import importlib
import sqlite3
from backend.config import ROOT
from backend.db import db, init_db


def test_existing_users_receive_stable_avatars(tmp_path, monkeypatch):
    path = tmp_path / 'old.sqlite3'
    monkeypatch.setattr(importlib.import_module('backend.db'), 'DB_PATH', path)
    with sqlite3.connect(path) as conn:
        conn.executescript('''
            CREATE TABLE users (
                id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
                password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO users(id,email,name,password_hash)
            VALUES('old','old@test.local','Old user','unchanged');
        ''')
    init_db()
    with db() as conn:
        first = dict(conn.execute("SELECT * FROM users WHERE id='old'").fetchone())
    assert 1 <= first['avatar'] <= 10
    assert first['name'] == 'Old user' and first['password_hash'] == 'unchanged'
    init_db()
    with db() as conn:
        assert conn.execute("SELECT avatar FROM users WHERE id='old'").fetchone()['avatar'] == first['avatar']
        conn.execute("INSERT INTO users(id,email,name,password_hash) VALUES('cli','cli@test.local','CLI user','hash')")
        assert 1 <= conn.execute("SELECT avatar FROM users WHERE id='cli'").fetchone()['avatar'] <= 10


def test_avatar_persists_across_sessions_and_author_views(client, login):
    r = client.post('/api/auth/register', json={
        'email': 'avatar@test.local', 'password': 'avatar-password-123', 'name': 'New user',
    })
    assert r.status_code == 201
    avatar = r.json()['avatar']
    assert 1 <= avatar <= 10
    assert client.get('/api/auth/me').json()['avatar'] == avatar
    client.post('/api/auth/logout')
    r = client.post('/api/auth/login', json={'email': 'avatar@test.local', 'password': 'avatar-password-123'})
    assert r.json()['avatar'] == avatar
    assert client.get('/api/auth/me').json()['avatar'] == avatar

    login('teacher')
    teacher = client.get('/api/auth/me').json()['avatar']
    lectures = client.get('/api/lectures').json()
    assert next(l for l in lectures if l['id'] == 'ready')['author_avatar'] == teacher
    assert client.get('/api/lectures/ready').json()['author_avatar'] == teacher
    login('admin')
    users = client.get('/api/admin').json()['users']
    assert next(u for u in users if u['id'] == 'teacher')['avatar'] == teacher
    assert next(u for u in users if u['email'] == 'avatar@test.local')['avatar'] == avatar
    for n in range(1, 11):
        for theme in ('light', 'dark'):
            assert (ROOT / 'frontend/public/art/avatars' / f'avatar-{n:02}-{theme}.webp').is_file()
