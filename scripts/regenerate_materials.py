"""Refresh selected lecture materials after changing the server model configuration."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from backend.db import db
from backend.processing import index_lecture

for lecture_id in sys.argv[1:]:
    with db() as conn:
        segments=[dict(r) for r in conn.execute('SELECT start_seconds,end_seconds,text FROM transcript_segments WHERE lecture_id=? ORDER BY start_seconds',(lecture_id,))]
    if not segments:
        raise SystemExit('No transcript: '+lecture_id)
    index_lecture(lecture_id,segments)
    with db() as conn:
        print(lecture_id,conn.execute('SELECT summary_mode FROM lectures WHERE id=?',(lecture_id,)).fetchone()[0])
