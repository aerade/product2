import importlib
import numpy as np
import pytest
from fastapi.testclient import TestClient
from backend.app import app
from backend.db import db, init_db
from backend.security import hash_password

@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(importlib.import_module('backend.db'), 'DB_PATH', tmp_path / 'test.sqlite3')
    monkeypatch.setattr(importlib.import_module('backend.app'), 'MEDIA', tmp_path / 'media')
    monkeypatch.setattr(importlib.import_module('backend.processing'), 'MEDIA', tmp_path / 'media')
    (tmp_path / 'media').mkdir()
    monkeypatch.delenv('LLM_API_KEY', raising=False)
    init_db()
    with db() as conn:
        for role in ('viewer','teacher','admin','other'):
            conn.execute('INSERT INTO users(id,email,name,password_hash,role) VALUES(?,?,?,?,?)', (role, role+'@test.local', role, hash_password('test-password-123'), 'teacher' if role=='other' else role))
        for lecture_id, owner, status in [('ready','teacher','ready'),('private','teacher','queued'),('foreign','other','ready')]:
            conn.execute('INSERT INTO lectures(id,owner_id,title,status,duration) VALUES(?,?,?,?,100)', (lecture_id,owner,'Test lecture '+lecture_id,status))
    return tmp_path

@pytest.fixture
def client(env):
    with TestClient(app, headers={'X-Requested-With':'Lectory'}) as client:
        yield client

@pytest.fixture
def login(client):
    def as_role(role):
        result=client.post('/api/auth/login', json={'email':role+'@test.local','password':'test-password-123'})
        assert result.status_code==200
        return client
    return as_role

@pytest.fixture
def fake_vectors(monkeypatch):
    def fake_embed(texts,query=False):
        return [np.array([1.,0.,0.],dtype=np.float32) for _ in texts]
    monkeypatch.setattr(importlib.import_module('backend.processing'), 'embed', fake_embed)
    monkeypatch.setattr(importlib.import_module('backend.search'), 'embed', fake_embed)
