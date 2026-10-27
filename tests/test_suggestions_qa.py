import importlib
from backend.db import db
from backend.processing import index_lecture, parse_subtitles
from tests.test_processing import SRT

def test_approval_is_idempotent(client,login):
    login('viewer')
    r=client.post('/api/suggestions',json={'url':'https://vimeo.com/76979871','comment':'Интересное видео'})
    assert r.status_code==201
    sid=r.json()['id']
    assert client.get('/api/library').json()['suggestions'][0]['status']=='pending'
    login('admin')
    first=client.patch('/api/admin/suggestions/'+sid,json={'status':'approved'})
    second=client.patch('/api/admin/suggestions/'+sid,json={'status':'approved'})
    assert first.json()['lecture_id']==second.json()['lecture_id']
    with db() as conn:
        assert conn.execute('SELECT count(*) FROM lectures WHERE source_url=?',('https://vimeo.com/76979871',)).fetchone()[0]==1
        assert conn.execute('SELECT count(*) FROM processing_jobs').fetchone()[0]==1

def test_rejection_reason_required(client,login):
    login('viewer')
    sid=client.post('/api/suggestions',json={'url':'https://vimeo.com/76979871'}).json()['id']
    login('admin')
    assert client.patch('/api/admin/suggestions/'+sid,json={'status':'rejected'}).status_code==422
    assert client.patch('/api/admin/suggestions/'+sid,json={'status':'rejected','reason':'Не учебное видео'}).status_code==200
    login('viewer')
    assert client.get('/api/library').json()['suggestions'][0]['reason']=='Не учебное видео'

def test_qa_without_key_clearly_labels_excerpts(client,login,fake_vectors):
    index_lecture('ready',parse_subtitles(SRT))
    login('viewer')
    r=client.post('/api/lectures/ready/ask',json={'question':'Как найти диагональ?'})
    assert r.status_code==200 and r.json()['mode']=='excerpts'
    assert r.json()['citations'][0]['start_seconds']==1.25

def test_qa_no_evidence_refuses(client,login,monkeypatch):
    login('viewer')
    monkeypatch.setattr(importlib.import_module('backend.app'),'search',lambda *args:[])
    r=client.post('/api/lectures/ready/ask',json={'question':'Как испечь хлеб?'})
    assert r.json()['mode']=='insufficient' and r.json()['citations']==[]

def test_qa_generation_requires_valid_citations(client,login,monkeypatch):
    login('viewer')
    module=importlib.import_module('backend.app')
    monkeypatch.setattr(module,'search',lambda *args:[{'score':.9,'text':'Evidence','start_seconds':10}])
    monkeypatch.setattr(module,'llm_configured',lambda:True)
    monkeypatch.setattr(module,'call_llm',lambda *args:'{"answer":"Invented", "sources":[99],"sufficient":true}')
    assert client.post('/api/lectures/ready/ask',json={'question':'Как это работает?'}).json()['mode']=='insufficient'
    monkeypatch.setattr(module,'call_llm',lambda *args:'{"answer":"Grounded", "sources":[1],"sufficient":true}')
    result=client.post('/api/lectures/ready/ask',json={'question':'Как это работает?'}).json()
    assert result['mode']=='llm' and result['citations'][0]['start_seconds']==10
