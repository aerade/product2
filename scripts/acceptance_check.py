"""Read checks against a running local demo, plus grounded question requests."""
import json
import sys
from pathlib import Path
import httpx
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from backend.config import ROOT, DATA

password=(DATA/'demo-access.txt').read_text(encoding='utf-8').split('Пароль: ')[1].strip()
with httpx.Client(base_url='http://localhost:8000',headers={'X-Requested-With':'Lectory'},timeout=120) as client:
    client.post('/api/auth/login',json={'email':'viewer@demo.local','password':password}).raise_for_status()
    results=client.post('/api/search',json={'query':'Как найти длину диагонали комнаты?'}).json()['results']
    assert results[0]['lecture_id']=='demo-pythagoras' and abs(results[0]['start_seconds']-53.95)<1
    answer=client.post('/api/lectures/demo-pythagoras/ask',json={'question':'Как найти диагональ комнаты размером три на четыре метра?'}).json()
    assert answer['mode']=='llm' and answer['citations']
    unknown=client.post('/api/lectures/demo-pythagoras/ask',json={'question':'Как испечь хлеб?'}).json()
    assert unknown['mode']=='insufficient'
    report={'semantic_top_result':{k:results[0][k] for k in ('lecture_id','start_seconds','score')},'grounded_answer':answer,'unrelated_question':unknown,'health':client.get('/api/health').json()}
    assert report['health']['generation_configured']
    for lecture_id in ('demo-neural','demo-pythagoras','demo-orbit','demo-dna'):
        lecture=client.get('/api/lectures/'+lecture_id).json()
        assert lecture['status']=='ready' and lecture['summary_mode']=='llm'
    (ROOT/'work/acceptance-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
