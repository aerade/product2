import importlib

import numpy as np

from backend.db import db


def chunks():
    with db() as conn:
        for name, text, start, vector in [
            ('nearby', 'Фрагмент на похожую тему, который не отвечает на вопрос.', 0, [1., 0., 0.]),
            ('answer', 'Фрагмент с прямым ответом на вопрос.', 20, [.8, .6, 0.]),
        ]:
            conn.execute('INSERT INTO search_chunks VALUES(?,?,?,?,?,?,?)',
                         (name, 'ready', start, start+10, text, np.array(vector, dtype=np.float32).tobytes(), 'test'))


def test_relevance_changes_embedding_order(env, fake_vectors, monkeypatch):
    search=importlib.import_module('backend.search')
    monkeypatch.setattr(search,'MODEL','test')
    monkeypatch.setattr(search,'query_embedding',lambda _:np.array([1.,0.,0.],dtype=np.float32))
    chunks()
    monkeypatch.setattr(search,'relevance',lambda query, passages:[.01,.9])
    hits=search.search('Вопрос по смыслу')
    assert len(hits)==1 and hits[0]['id']=='answer' and hits[0]['start_seconds']==20


def test_unrelated_question_returns_no_hits(env, fake_vectors, monkeypatch):
    search=importlib.import_module('backend.search')
    monkeypatch.setattr(search,'MODEL','test')
    monkeypatch.setattr(search,'query_embedding',lambda _:np.array([1.,0.,0.],dtype=np.float32))
    chunks()
    monkeypatch.setattr(search,'relevance',lambda query, passages:[.0001,.0002])
    assert search.search('Посторонний вопрос')==[]


def test_scope_applies_before_reranking(env, fake_vectors, monkeypatch):
    search=importlib.import_module('backend.search')
    monkeypatch.setattr(search,'MODEL','test')
    chunks()
    with db() as conn:
        conn.execute("UPDATE search_chunks SET lecture_id='foreign' WHERE id='answer'")
    seen=[]
    def rank(query, passages):
        seen.extend(passages)
        return [.9]*len(passages)
    monkeypatch.setattr(search,'relevance',rank)
    hits=search.search('Вопрос по выбранной лекции',['ready'])
    assert len(hits)==1 and hits[0]['id']=='nearby' and len(seen)==1


def test_relevance_cache_reuses_same_query_and_passages(monkeypatch):
    module=importlib.import_module('backend.rerank')
    module._relevance.cache_clear()
    calls=[]
    class Tokenizer:
        def encode_batch(self, pairs):
            calls.append(pairs)
            return [type('Item',(),{'ids':[0,1],'attention_mask':[1,1],'type_ids':[0,0]})() for _ in pairs]
    class Session:
        def get_inputs(self): return [type('Input',(),{'name':'input_ids'})()]
        def run(self,*args): return [np.array([[2.]],dtype=np.float32)]
    monkeypatch.setattr(module,'load_model',lambda:(Session(),Tokenizer()))
    try:
        first=module.relevance('Вопрос',['Текст'])
        assert module.relevance('Вопрос',['Текст'])==first and len(calls)==1
        assert .8<first[0]<1
    finally:
        module._relevance.cache_clear()
