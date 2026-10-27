import os
from functools import lru_cache
import numpy as np
from .db import db
from .embeddings import embed, MODEL

@lru_cache(maxsize=128)
def query_embedding(query):
    return embed([query], query=True)[0]

def search(query, lecture_ids=None, limit=10):
    # В поиск попадают только готовые лекции.
    where = "l.status='ready' AND c.model=?"
    params = [MODEL]
    if lecture_ids:
        where += ' AND l.id IN (' + ','.join('?' for _ in lecture_ids) + ')'
        params.extend(lecture_ids)
    with db() as conn:
        rows = conn.execute(f'SELECT c.*,l.title,l.cover,l.course_id FROM search_chunks c JOIN lectures l ON l.id=c.lecture_id WHERE {where}', params).fetchall()
    if not rows:
        return []
    vector = query_embedding(query)
    matrix = np.stack([np.frombuffer(r['vector'], dtype=np.float32) for r in rows])
    scores = matrix @ vector
    minimum = max(float(os.getenv('SEARCH_MIN_SCORE', '0.79')), float(scores.max()) - 0.10)
    order = [i for i in np.argsort(scores)[::-1] if scores[i] >= minimum][:limit]
    return [{**{k: rows[int(i)][k] for k in ('id', 'lecture_id', 'title', 'cover', 'start_seconds', 'end_seconds', 'text')}, 'score': round(float(scores[i]), 4)} for i in order]
