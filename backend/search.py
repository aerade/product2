import os
from functools import lru_cache
import numpy as np
from .db import db
from .embeddings import embed, MODEL
from .rerank import relevance

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
    candidates = np.argsort(scores)[::-1][:max(1, min(100, int(os.getenv('SEARCH_CANDIDATES', '30'))))]
    ranked = relevance(query, [rows[int(i)]['text'] for i in candidates])
    minimum = max(float(os.getenv('SEARCH_MIN_RELEVANCE', '0.001')), max(ranked) * 0.08)
    order = [j for j in np.argsort(ranked)[::-1] if ranked[j] >= minimum][:limit]
    return [{**{k: rows[int(candidates[j])][k] for k in ('id', 'lecture_id', 'title', 'cover', 'start_seconds', 'end_seconds', 'text')}, 'score': round(float(ranked[j]), 5)} for j in order]
