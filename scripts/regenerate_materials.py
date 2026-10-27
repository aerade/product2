"""Повторное создание материалов выбранной лекции."""
import sys
import json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from backend.db import db
from backend.processing import index_lecture

if len(sys.argv) < 2:
    raise SystemExit('Укажите идентификатор лекции.')

for lecture_id in sys.argv[1:]:
    with db() as conn:
        segments = []
        for row in conn.execute('SELECT s.start_seconds,s.end_seconds,s.text,w.words FROM transcript_segments s LEFT JOIN transcript_word_timings w ON w.segment_id=s.id WHERE s.lecture_id=? ORDER BY s.start_seconds', (lecture_id,)):
            segment = dict(row)
            segment['words'] = json.loads(segment['words']) if segment['words'] else []
            segments.append(segment)
    if not segments:
        raise SystemExit('Нет транскрипта лекции: '+lecture_id)
    index_lecture(lecture_id,segments)
    with db() as conn:
        print(lecture_id,conn.execute('SELECT summary_mode FROM lectures WHERE id=?',(lecture_id,)).fetchone()[0])
