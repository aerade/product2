import hashlib
import hmac
import secrets
import time
from fastapi import Cookie, HTTPException, Request
from .db import db

def hash_password(password):
    salt = secrets.token_hex(16)
    value = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return salt + ':' + value

def verify_password(password, encoded):
    salt, expected = encoded.split(':')
    value = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return hmac.compare_digest(value, expected)

def current_user(session: str | None = Cookie(default=None)):
    if not session:
        raise HTTPException(401, 'Войдите в аккаунт, чтобы продолжить.')
    digest = hashlib.sha256(session.encode()).hexdigest()
    with db() as conn:
        user = conn.execute('SELECT u.id,u.email,u.name,u.role,u.avatar FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?', (digest, time.time())).fetchone()
    if not user:
        raise HTTPException(401, 'Сессия завершилась. Войдите снова.')
    return dict(user)

def require_teacher(user):
    if user['role'] not in ('teacher', 'admin'):
        raise HTTPException(403, 'Это действие доступно преподавателю или администратору.')

def require_admin(user):
    if user['role'] != 'admin':
        raise HTTPException(403, 'Это действие доступно только администратору.')

def lecture_access(conn, lecture_id, user, edit=False):
    lecture = conn.execute('SELECT * FROM lectures WHERE id=?', (lecture_id,)).fetchone()
    if not lecture:
        raise HTTPException(404, 'Лекция не найдена.')
    owner = user['role'] == 'admin' or (user['role'] == 'teacher' and lecture['owner_id'] == user['id'])
    if edit and not owner:
        raise HTTPException(403, 'Вы можете изменять только свои лекции.')
    if not edit and lecture['status'] != 'ready' and not owner:
        raise HTTPException(404, 'Лекция ещё не опубликована.')
    return dict(lecture)

def rate_limit(key, limit=12, window=300):
    with db() as conn:
        conn.execute('BEGIN IMMEDIATE')
        row = conn.execute('SELECT * FROM login_attempts WHERE key=?', (key,)).fetchone()
        now = time.time()
        if row and row['reset_at'] > now and row['count'] >= limit:
            raise HTTPException(429, 'Слишком много попыток. Повторите через несколько минут.')
        if not row or row['reset_at'] <= now:
            conn.execute('INSERT OR REPLACE INTO login_attempts VALUES(?,1,?)', (key, now + window))
        else:
            conn.execute('UPDATE login_attempts SET count=count+1 WHERE key=?', (key,))
