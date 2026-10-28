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
    with pytest.raises(ValueError): validate_source('https://youtu.be/jNQXAC9IVRw?t=10')
    assert validate_source('https://player.vimeo.com/video/76979871')[0]=='vimeo'

def test_upload_content_and_limits(client,login,monkeypatch):
    login('teacher')
    assert client.post('/api/lectures/upload',data={'title':'A lecture'},files={'video':('x.mp4',b'fake','video/mp4')}).status_code==422
    assert client.post('/api/lectures/upload',data={'title':'A lecture'},files={'video':('x.exe',b'0000ftyp','video/mp4')}).status_code==422
    monkeypatch.setattr(importlib.import_module('backend.app'),'MAX_UPLOAD',5)
    assert client.post('/api/lectures/upload',data={'title':'A lecture'},files={'video':('x.mp4',b'0000ftyp00000000','video/mp4')}).status_code==413

def test_persistent_upload_job_to_search(client,login,fake_vectors,monkeypatch):
    monkeypatch.setattr(importlib.import_module('backend.worker'), 'media_duration', lambda path: 79.11)
    login('teacher')
    result=client.post('/api/lectures/upload',data={'title':'Геометрия','course':'Математика'},files={'video':('lesson.mp4',b'0000ftyp00000000','video/mp4'),'subtitles':('lesson.srt',SRT.encode(),'text/plain')})
    assert result.status_code==201
    lecture_id=result.json()['id']
    assert run_once()
    lecture=client.get('/api/lectures/'+lecture_id).json()
    assert lecture['status']=='ready' and len(lecture['segments'])==2
    assert lecture['duration']==79.11
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


def test_unreadable_video_with_subtitles_never_marked_ready(client, login, fake_vectors, monkeypatch):
    login('teacher')
    monkeypatch.setattr(importlib.import_module('backend.worker'), 'media_duration', lambda path: None)
    response=client.post('/api/lectures/upload',data={'title':'Повреждённое видео'},files={
        'video':('broken.mp4',b'0000ftyp00000000','video/mp4'),
        'subtitles':('lecture.srt',SRT.encode(),'text/plain')})
    assert response.status_code==201
    assert run_once()
    lecture=client.get('/api/lectures/'+response.json()['id']).json()
    assert lecture['status']=='failed' and 'исправный MP4/WebM' in lecture['error']


def test_import_tries_audio_after_subtitle_failure(tmp_path, monkeypatch):
    import yt_dlp
    processing = importlib.import_module('backend.processing')
    monkeypatch.setattr(processing, 'MEDIA', tmp_path)
    audio = tmp_path / 'video' / 'source.webm'
    calls = []

    class Downloader:
        def __init__(self, options):
            self.options = options.copy()
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def extract_info(self, url, download):
            calls.append(self.options['skip_download'])
            if self.options['skip_download']:
                raise yt_dlp.utils.DownloadError('subtitles failed')
            audio.write_bytes(b'audio')
            return {'id': 'video'}
        def prepare_filename(self, info): return str(audio)

    monkeypatch.setattr(yt_dlp, 'YoutubeDL', Downloader)
    monkeypatch.setattr(processing, 'ffmpeg', lambda: 'ffmpeg')
    monkeypatch.setattr(processing, 'transcribe', lambda path: parse_subtitles(SRT))
    from contextlib import contextmanager
    @contextmanager
    def fake_db():
        class Connection:
            def execute(self, *args): pass
        yield Connection()
    monkeypatch.setattr(processing, 'db', fake_db)
    result = processing.import_source({'id': 'video', 'source_url': 'https://vimeo.com/76979871'})
    assert calls == [True, False]
    assert len(result) == 2 and not audio.exists()


def test_tls_failure_is_reported_as_connection_problem(client, login, monkeypatch, tmp_path):
    import yt_dlp
    processing = importlib.import_module('backend.processing')
    monkeypatch.setattr(processing, 'MEDIA', tmp_path)
    monkeypatch.setattr(processing, 'ffmpeg', lambda: 'ffmpeg')
    class Downloader:
        def __init__(self, options): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def extract_info(self, url, download):
            raise yt_dlp.utils.DownloadError('[SSL: INVALID_SESSION_ID] invalid session id')
    monkeypatch.setattr(yt_dlp, 'YoutubeDL', Downloader)
    login('teacher')
    result = client.post('/api/lectures/import', json={'url':'https://vimeo.com/76979871', 'title':'Внешнее видео'})
    assert run_once()
    lecture = client.get('/api/lectures/' + result.json()['id']).json()
    assert lecture['status'] == 'failed'
    assert 'подключиться' in lecture['error']
    assert lecture['job']['stage'] == 'Ошибка обработки'


@pytest.mark.parametrize('url,source,video_id,canonical', [
    ('https://vkvideo.ru/video-77521_162222515?x=1', 'vk', '-77521_162222515', 'https://vkvideo.ru/video-77521_162222515'),
    ('https://vk.com/videos-77521?z=video-77521_162222515%2Fclub77521', 'vk', '-77521_162222515', 'https://vkvideo.ru/video-77521_162222515'),
    ('https://vk.com/video_ext.php?oid=-77521&id=162222515', 'vk', '-77521_162222515', 'https://vkvideo.ru/video-77521_162222515'),
    ('https://rutube.ru/play/embed/3eac3b4561676c17df9132a9a1e62e3e', 'rutube', '3eac3b4561676c17df9132a9a1e62e3e', 'https://rutube.ru/video/3eac3b4561676c17df9132a9a1e62e3e/'),
])
def test_new_video_sources_normalized(url, source, video_id, canonical):
    assert validate_source(url) == (source, video_id, canonical)


@pytest.mark.parametrize('url', [
    'https://vk.com.evil.test/video-77521_162222515',
    'https://rutube.ru.evil.test/video/3eac3b4561676c17df9132a9a1e62e3e',
    'https://vkvideo.ru/video-1_1/other',
    'https://rutube.ru/video/private/3eac3b4561676c17df9132a9a1e62e3e/?p=secret',
])
def test_new_source_rejects_untrusted_or_private_urls(url):
    with pytest.raises(ValueError): validate_source(url)


@pytest.mark.parametrize('url', [
    'https://vkvideo.ru/video205387401_165548505',
    'https://rutube.ru/video/3eac3b4561676c17df9132a9a1e62e3e/',
])
def test_new_source_suggestion_and_moderation(client, login, url):
    login('viewer')
    suggestion = client.post('/api/suggestions', json={'url': url, 'comment': 'Тест'})
    assert suggestion.status_code == 201
    login('admin')
    approved = client.patch('/api/admin/suggestions/' + suggestion.json()['id'], json={'status':'approved', 'title':'Видео', 'description':'', 'course':'', 'cover':'math'})
    assert approved.status_code == 200
    with db() as conn:
        lecture = conn.execute('SELECT source, source_url FROM lectures WHERE source_url=?', (validate_source(url)[2],)).fetchone()
        assert lecture and lecture['source'] == validate_source(url)[0]


@pytest.mark.parametrize('url', ['https://youtu.be/jNQXAC9IVRw', 'https://www.youtube.com/watch?v=jNQXAC9IVRw', 'https://www.youtube.com/embed/jNQXAC9IVRw'])
def test_youtube_rejected_for_import_and_suggestions(client, login, url):
    login('teacher')
    assert client.post('/api/lectures/import', json={'url':url, 'title':'Лекция'}).status_code == 422
    login('viewer')
    assert client.post('/api/suggestions', json={'url':url}).status_code == 422


def test_read_container_duration(monkeypatch):
    import subprocess
    processing = importlib.import_module('backend.processing')
    monkeypatch.setattr(processing, 'ffmpeg', lambda: 'ffmpeg')
    monkeypatch.setattr(subprocess, 'run', lambda *a, **kw: type('Result', (), {'stderr': b'Duration: 00:01:19.11, start: 0.000000'})())
    assert processing.media_duration('video.mp4') == 79.11
    monkeypatch.setattr(subprocess, 'run', lambda *a, **kw: type('Result', (), {'stderr': b'Duration: N/A'})())
    assert processing.media_duration('video.mp4') is None


def test_speech_model_reused_without_network(monkeypatch, tmp_path):
    import faster_whisper
    processing=importlib.import_module('backend.processing')
    calls=[]
    def model(name, **options):
        calls.append((name, options))
        return object()
    monkeypatch.setattr(faster_whisper, 'WhisperModel', model)
    processing.speech_model.cache_clear()
    try:
        first=processing.speech_model('large-v3','cpu','int8',str(tmp_path))
        assert processing.speech_model('large-v3','cpu','int8',str(tmp_path)) is first
        assert len(calls)==1 and calls[0][1]['local_files_only'] is True
    finally:
        processing.speech_model.cache_clear()


def test_failed_audio_conversion_removes_partial_file(monkeypatch, tmp_path):
    import subprocess
    processing=importlib.import_module('backend.processing')
    partial=tmp_path/'video.audio.wav'
    monkeypatch.setattr(processing, 'ffmpeg', lambda: 'ffmpeg')
    def fail(*args, **kwargs):
        partial.write_bytes(b'partial')
        raise subprocess.CalledProcessError(1, 'ffmpeg')
    monkeypatch.setattr(subprocess, 'run', fail)
    with pytest.raises(subprocess.CalledProcessError):
        processing.transcribe(tmp_path/'video.mp4')
    assert not partial.exists()
