import argparse
import getpass
import os
from .db import db, init_db
from .security import hash_password
from .processing import uid

def main():
    parser = argparse.ArgumentParser(description='Лекторий: начальная настройка')
    parser.add_argument('command', choices=['create-admin', 'download-models'])
    args = parser.parse_args()
    init_db()
    if args.command == 'download-models':
        from .embeddings import embed
        print('Загружаем многоязычную модель поиска…')
        embed(['Проверка смыслового поиска'])
        from faster_whisper import WhisperModel
        from .config import MODELS
        WhisperModel(os.getenv('WHISPER_MODEL', 'base'), device='cpu', compute_type='int8', download_root=str(MODELS / 'whisper'))
        print('Модели готовы.')
        return
    email = (os.getenv('ADMIN_EMAIL') or input('Email администратора: ')).strip().lower()
    password = os.getenv('ADMIN_PASSWORD') or getpass.getpass('Пароль (не менее 10 символов): ')
    if len(password) < 10 or '@' not in email:
        raise SystemExit('Проверьте email и длину пароля.')
    with db() as conn:
        if conn.execute('SELECT id FROM users WHERE email=?', (email,)).fetchone():
            raise SystemExit('Аккаунт уже существует. Роли назначаются действующим администратором.')
        conn.execute('INSERT INTO users(id,email,name,password_hash,role) VALUES(?,?,?,?,?)', (uid(), email, 'Администратор', hash_password(password), 'admin'))
    print('Администратор создан.')

if __name__ == '__main__':
    main()
