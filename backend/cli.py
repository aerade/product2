import argparse
import getpass
import os
import zipfile
from pathlib import Path
from .db import db, init_db
from .security import hash_password
from .processing import uid

def main():
    parser = argparse.ArgumentParser(description='Лекторий: начальная настройка')
    parser.add_argument('command', choices=['create-admin', 'download-models', 'create-backup', 'restore-backup'])
    parser.add_argument('--file', type=Path, help='Путь к архиву резервной копии')
    args = parser.parse_args()
    if args.command in ('create-backup', 'restore-backup'):
        from .backup import BUNDLED_BACKUP, create_backup, restore_backup
        operation = create_backup if args.command == 'create-backup' else restore_backup
        try:
            manifest = operation(args.file or BUNDLED_BACKUP)
        except (ValueError, OSError, zipfile.BadZipFile) as exc:
            raise SystemExit(str(exc))
        print('Копия готова:', manifest['counts'])
        return
    if args.file:
        parser.error('--file используется только с командами резервного копирования.')
    if args.command == 'download-models':
        from .embeddings import embed
        print('Загружаем многоязычную модель поиска…')
        embed(['Проверка смыслового поиска'])
        from faster_whisper import WhisperModel
        from .config import MODELS
        WhisperModel(os.getenv('WHISPER_MODEL', 'large-v3'), device='cpu', compute_type='int8', download_root=str(MODELS / 'whisper'))
        print('Модели готовы.')
        return
    from .backup import restore_if_missing
    restore_if_missing()
    init_db()
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
