"""Real server checks. Requires running API + worker and opt-in seeded demo users."""
import json
import sys
import time
from pathlib import Path
import httpx
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.config import ROOT, DATA

def main():
    password = (DATA / 'demo-access.txt').read_text(encoding='utf-8').split('Пароль: ')[1].strip()
    client = httpx.Client(base_url='http://localhost:8000', headers={'X-Requested-With':'Lectory'}, timeout=90)
    r=client.post('/api/auth/login',json={'email':'teacher@demo.local','password':password})
    r.raise_for_status()
    with (ROOT / 'work/asr-test.mp4').open('rb') as video:
        r=client.post('/api/lectures/upload',data={'title':'Проверка реального распознавания речи','course':'Проверка','cover':'math'},files={'video':('asr.mp4',video,'video/mp4')})
    r.raise_for_status()
    asr_id=r.json()['id']
    r=client.post('/api/lectures/import',json={'url':'https://www.youtube.com/watch?v=aircAruvnKk','title':'Как устроена нейронная сеть — 3Blue1Brown','description':'Открытая видеолекция 3Blue1Brown. Импорт с YouTube: доступны субтитры на разных языках.','course':'Искусственный интеллект','cover':'ai'})
    r.raise_for_status()
    external_id=r.json()['id']
    report={}
    for name, lecture_id in [('asr',asr_id),('youtube',external_id)]:
        for _ in range(180):
            r=client.get('/api/lectures/'+lecture_id)
            r.raise_for_status()
            lecture=r.json()
            if lecture['status'] in ('ready','failed','needs_transcript'):
                break
            time.sleep(2)
        report[name]={'id':lecture_id,'status':lecture['status'],'error':lecture['error'],'segments':len(lecture['segments']),'duration':lecture['duration']}
        if lecture['status']=='ready':
            r=client.post('/api/search',json={'query':'Как работает нейронная сеть?' if name=='youtube' else 'Что такое гипотенуза?','lecture_ids':[lecture_id]})
            r.raise_for_status()
            report[name]['search_results']=len(r.json()['results'])
    report['health']=client.get('/api/health').json()
    report['qa_unrelated']=client.post('/api/lectures/demo-neural/ask',json={'question':'Как испечь хлеб?'}).json()['mode']
    (ROOT / 'work/integration-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    if report['asr']['status']=='ready':
        client.delete('/api/lectures/'+asr_id).raise_for_status()
    client.close()
    if any(report[k]['status']!='ready' for k in ('asr','youtube')):
        raise SystemExit(1)

if __name__=='__main__':main()
