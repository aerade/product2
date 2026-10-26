import importlib
import time
import pytest
from backend.db import db
from backend.processing import parse_subtitles, validate_source, index_lecture, NeedsTranscript
from backend.worker import run_once

SRT='1\n00:00:01,250 --> 00:00:04,750\nКвадрат гипотенузы равен сумме квадратов катетов.\n\n2\n00:00:05,000 --> 00:00:08,000\nДиагональ комнаты вычисляют по этой теореме.\n'

def test_srt_vtt_and_fractional_timestamps():
    s=parse_subtitles(SRT)
    assert s[0]['start_seconds']==1.25 and s[1]['end_seconds']==8
    vtt='WEBVTT\n\n00:01.250 --> 00:04.750 align:start\n<b>Привет</b> &amp; мир\n'
    assert parse_subtitles(vtt)[0]['text']=='Привет & мир'
    with pytest.raises(ValueError):parse_subtitles('not a subtitle')

@pytest.mark.parametrize('url',['http://127.0.0.1/video','https://youtube.com.evil.example/watch?v=jNQXAC9IVRw','https://youtube.com@evil.example/watch?v=jNQXAC9IVRw','file:///etc/passwd','https://vimeo.com:9000/76979871','https://youtube.com/playlist?list=abc','https://youtu.be/../../etc/passwd'])
def test_source_validation_rejects_ssrf(url):
    with pytest.raises(ValueError):validate_source(url)

def test_normalize_sources():
    assert validate_source('https://youtu.be/jNQXAC9IVRw?t=10')[2]=='https://www.youtube.com/watch?v=jNQXAC9IVRw'
    assert validate_source('https://player.vimeo.com/video/76979871')[0]=='vimeo'

def test_upload_content_and_limits(client,login,monkeypatch):
    login('teacher')
    assert client.post('/api/lectures/upload',data={'title':'A lecture'},files={'video':('x.mp4',b'fake','video/mp4')}).status_code==422
    assert client.post('/api/lectures/upload',data={'title':'A lecture'},files={'video':('x.exe',b'0000ftyp','video/mp4')}).status_code==422
    monkeypatch.setattr(importlib.import_module('backend.app'),'MAX_UPLOAD',5)
    assert client.post('/api/lectures/upload',data={'title':'A lecture'},files={'video':('x.mp4',b'0000ftyp00000000','video/mp4')}).status_code==413

def test_persistent_upload_job_to_search(client,login,fake_vectors):
    login('teacher')
    result=client.post('/api/lectures/upload',data={'title':'Геометрия','course':'Математика'},files={'video':('lesson.mp4',b'0000ftyp00000000','video/mp4'),'subtitles':('lesson.srt',SRT.encode(),'text/plain')})
    assert result.status_code==201
    lecture_id=result.json()['id']
    assert run_once()
    lecture=client.get('/api/lectures/'+lecture_id).json()
    assert lecture['status']=='ready' and len(lecture['segments'])==2
    assert lecture['summary_mode']=='extractive' and lecture['job']['progress']==100
    assert lecture['outline'] and lecture['terms']
    hits=client.post('/api/search',json={'query':'диагональ','lecture_ids':[lecture_id]}).json()['results']
    assert hits[0]['lecture_id']==lecture_id and hits[0]['start_seconds']==1.25
    media=client.get('/api/lectures/'+lecture_id+'/media',headers={'Range':'bytes=0-7'})
    assert media.status_code==206 and media.content==b'0000ftyp'

def test_retry_replaces_index_atomically(client,login,fake_vectors):
    index_lecture('ready',parse_subtitles(SRT))
    index_lecture('ready',parse_subtitles(SRT))
    with db() as conn:
        assert conn.execute("SELECT count(*) FROM transcript_segments WHERE lecture_id='ready'").fetchone()[0]==2
        assert conn.execute("SELECT count(*) FROM search_chunks WHERE lecture_id='ready'").fetchone()[0]==1

def test_external_import_failure_requires_transcript(client,login,monkeypatch):
    login('teacher')
    def blocked(_):raise NeedsTranscript('Загрузите файл видео или SRT/VTT')
    monkeypatch.setattr(importlib.import_module('backend.worker'),'import_source',blocked)
    result=client.post('/api/lectures/import',json={'url':'https://vimeo.com/76979871','title':'Внешняя лекция'})
    run_once()
    lecture=client.get('/api/lectures/'+result.json()['id']).json()
    assert lecture['status']=='needs_transcript' and 'SRT/VTT' in lecture['error']

def test_external_subtitle_success_path(client,login,fake_vectors,monkeypatch):
    login('teacher')
    monkeypatch.setattr(importlib.import_module('backend.worker'),'import_source',lambda _:parse_subtitles(SRT))
    result=client.post('/api/lectures/import',json={'url':'https://vimeo.com/76979871','title':'Внешняя лекция'})
    run_once()
    assert client.get('/api/lectures/'+result.json()['id']).json()['status']=='ready'

def test_expired_job_recovered_after_crash(client,login,fake_vectors,monkeypatch):
    with db() as conn:
        conn.execute("INSERT INTO processing_jobs(id,lecture_id,status,lease_until) VALUES('lost','private','processing',?)",(time.time()-300,))
    monkeypatch.setattr(importlib.import_module('backend.worker'),'import_source',lambda _:parse_subtitles(SRT))
    assert run_once()
    with db() as conn:
        assert conn.execute("SELECT status FROM processing_jobs WHERE id='lost'").fetchone()[0]=='completed'

def test_failed_embeddings_never_mark_ready(client,login,monkeypatch):
    def fail(*args,**kwargs):raise RuntimeError('model unavailable')
    monkeypatch.setattr(importlib.import_module('backend.processing'),'embed',fail)
    with pytest.raises(RuntimeError):index_lecture('private',parse_subtitles(SRT))
    with db() as conn:
        assert conn.execute("SELECT status FROM lectures WHERE id='private'").fetchone()[0]!='ready'

def test_deletion_cascades_personal_data(client,login,fake_vectors):
    index_lecture('ready',parse_subtitles(SRT))
    login('viewer')
    client.post('/api/notes',json={'lecture_id':'ready','seconds':2,'text':'My note'})
    login('admin')
    assert client.delete('/api/lectures/ready').status_code==204
    with db() as conn:
        for table in ('transcript_segments','search_chunks','outline_sections','key_terms','notes'):
            assert conn.execute(f'SELECT count(*) FROM {table} WHERE lecture_id=?',('ready',)).fetchone()[0]==0
