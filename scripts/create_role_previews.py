"""Explicit local setup of viewer and teacher accounts; credentials stay in data/."""
import secrets
import sys
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.config import DATA
from backend.db import db, init_db
from backend.security import hash_password


def main():
    init_db()
    access = DATA / 'role-preview-access.txt'
    if access.exists():
        print('Данные уже сохранены:', access)
        return
    lines = ['Локальные аккаунты для просмотра ролей', 'Сайт: http://localhost:8000', '']
    with db() as conn:
        conn.execute('BEGIN IMMEDIATE')
        for role, name, title in [('viewer', 'Алексей', 'Зритель'), ('teacher', 'Ирина', 'Преподаватель')]:
            email = role + '@preview.local'
            while conn.execute('SELECT 1 FROM users WHERE email=?', (email,)).fetchone():
                email = role + '-' + secrets.token_hex(3) + '@preview.local'
            password = secrets.token_urlsafe(12)
            conn.execute('INSERT INTO users(id,email,name,password_hash,role) VALUES(?,?,?,?,?)',
                         (uuid4().hex, email, name, hash_password(password), role))
            lines.extend([title + ' — ' + name, 'Почта: ' + email, 'Пароль: ' + password, ''])
    access.write_text('\n'.join(lines), encoding='utf-8')
    print('Созданы зритель и преподаватель. Данные для входа:', access)


if __name__ == '__main__':
    main()
