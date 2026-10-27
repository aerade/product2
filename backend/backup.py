"""Переносимая копия базы и связанных файлов без моделей и сеансов входа."""
import hashlib
import json
import os
import shutil
import sqlite3
import tempfile
import zipfile
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

from .config import DATA, DB_PATH, ROOT

BUNDLED_BACKUP = ROOT / 'backup' / 'lectory.zip'
PATH_COLUMNS = {'lectures': ('media_path', 'subtitle_path'), 'video_suggestions': ('media_path', 'subtitle_path')}


def _relative(name):
    path = PurePosixPath(name)
    if not name or '\\' in name or path.is_absolute() or '..' in path.parts or ':' in name or str(path) != name:
        raise ValueError('Некорректный путь в резервной копии.')
    return path


def create_backup(destination=BUNDLED_BACKUP, data_dir=DATA, db_path=DB_PATH):
    data_dir, destination = Path(data_dir).resolve(), Path(destination).resolve()
    if not Path(db_path).is_file():
        raise ValueError('База не найдена. Сначала запустите сайт.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.lectory-backup-', dir=destination.parent) as temporary:
        stage = Path(temporary)
        database = stage / 'lectory.sqlite3'
        with closing(sqlite3.connect(db_path)) as source, closing(sqlite3.connect(database)) as copied:
            source.backup(copied)
        files = {}

        def include(path):
            path = Path(path).resolve()
            if not path.is_relative_to(data_dir) or not path.is_file():
                raise ValueError('Не найден связанный файл или он находится вне data/.')
            name = path.relative_to(data_dir).as_posix()
            _relative(name)
            files[name] = path
            return name

        with closing(sqlite3.connect(database)) as copied, copied:
            if copied.execute("SELECT count(*) FROM processing_jobs WHERE status IN ('queued','processing')").fetchone()[0]:
                raise ValueError('Дождитесь завершения обработки видео перед созданием копии.')
            for table, columns in PATH_COLUMNS.items():
                for column in columns:
                    for row_id, value in copied.execute(f'SELECT id,{column} FROM {table} WHERE {column} IS NOT NULL').fetchall():
                        name = include(value)
                        copied.execute(f'UPDATE {table} SET {column}=? WHERE id=?', (name, row_id))
            for (filename,) in copied.execute('SELECT avatar_file FROM users WHERE avatar_file IS NOT NULL'):
                include(data_dir / 'avatars' / filename)
            for (cover_id,) in copied.execute('SELECT id FROM lecture_covers'):
                include(data_dir / 'covers' / (cover_id + '.webp'))
            for (image_id,) in copied.execute('SELECT id FROM assistant_images'):
                include(data_dir / 'chat-images' / (image_id + '.webp'))
            for (cover,) in copied.execute('SELECT cover FROM lectures UNION SELECT cover FROM video_suggestions'):
                if cover.startswith('source:'):
                    path = data_dir / 'covers' / (cover.replace(':', '-', 2) + '.webp')
                    if path.is_file():
                        include(path)
            copied.execute('DELETE FROM sessions')
            copied.execute('DELETE FROM login_attempts')
            copied.execute('UPDATE assistant_conversations SET pending_request=NULL,pending_since=NULL')
            copied.commit()
            copied.execute('PRAGMA journal_mode=DELETE')
            copied.execute('VACUUM')
            if copied.execute('PRAGMA integrity_check').fetchone()[0] != 'ok' or copied.execute('PRAGMA foreign_key_check').fetchone():
                raise ValueError('База не прошла проверку целостности.')
            counts = {table: copied.execute(f'SELECT count(*) FROM {table}').fetchone()[0] for table in ('users', 'lectures', 'video_suggestions', 'notes', 'bookmarks')}
        files['lectory.sqlite3'] = database
        manifest = {'version': 1, 'created_at': datetime.now(timezone.utc).isoformat(), 'counts': counts, 'files': {}}
        archive = stage / 'backup.zip'
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as out:
            for name, path in sorted(files.items()):
                with path.open('rb') as content:
                    digest = hashlib.file_digest(content, 'sha256').hexdigest()
                manifest['files'][name] = {'size': path.stat().st_size, 'sha256': digest}
                out.write(path, name, compress_type=zipfile.ZIP_STORED if path.suffix.lower() in ('.mp4', '.webm', '.webp') else zipfile.ZIP_DEFLATED)
            out.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2))
        archive.replace(destination)
    return manifest


def restore_backup(archive=BUNDLED_BACKUP, data_dir=DATA):
    data_dir = Path(data_dir).resolve()
    database = data_dir / 'lectory.sqlite3'
    if database.exists():
        raise FileExistsError('База уже существует. Восстановление её не перезаписывает.')
    data_dir.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.lectory-restore-', dir=data_dir.parent) as temporary:
        stage = Path(temporary)
        with zipfile.ZipFile(archive) as source:
            names = source.namelist()
            if 'manifest.json' not in names or len(names) != len(set(names)) or source.getinfo('manifest.json').file_size > 1024 * 1024:
                raise ValueError('Некорректная резервная копия.')
            manifest = json.loads(source.read('manifest.json'))
            if not isinstance(manifest, dict) or manifest.get('version') != 1 or not isinstance(manifest.get('files'), dict):
                raise ValueError('Неизвестный формат резервной копии.')
            files = manifest['files']
            if set(names) != set(files) | {'manifest.json'} or 'lectory.sqlite3' not in files:
                raise ValueError('Состав резервной копии не совпадает с описанием.')
            if sum(info.file_size for info in source.infolist()) > 16 * 1024**3:
                raise ValueError('Резервная копия слишком большая.')
            for name, expected in files.items():
                relative = _relative(name)
                if not isinstance(expected, dict) or not isinstance(expected.get('size'), int) or expected['size'] < 0 or not isinstance(expected.get('sha256'), str):
                    raise ValueError('Некорректное описание файла резервной копии.')
                if name != 'lectory.sqlite3' and relative.parts[0] not in ('media', 'avatars', 'covers', 'chat-images'):
                    raise ValueError('В копии найден посторонний файл.')
                if (data_dir / name).exists():
                    raise FileExistsError('В data/ уже есть файл из этой копии.')
                if source.getinfo(name).file_size != expected['size']:
                    raise ValueError('Повреждён файл резервной копии.')
                target = stage.joinpath(*relative.parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                digest = hashlib.sha256()
                with source.open(name) as content, target.open('wb') as output:
                    while chunk := content.read(1024 * 1024):
                        digest.update(chunk)
                        output.write(chunk)
                if digest.hexdigest() != expected['sha256']:
                    raise ValueError('Повреждён файл резервной копии.')
        staged_db = stage / 'lectory.sqlite3'
        with closing(sqlite3.connect(staged_db)) as restored, restored:
            for table, columns in PATH_COLUMNS.items():
                for column in columns:
                    for row_id, name in restored.execute(f'SELECT id,{column} FROM {table} WHERE {column} IS NOT NULL').fetchall():
                        _relative(name)
                        if name not in files:
                            raise ValueError('В копии не хватает связанного видео или субтитров.')
                        restored.execute(f'UPDATE {table} SET {column}=? WHERE id=?', (str(data_dir / name), row_id))
            if restored.execute('PRAGMA integrity_check').fetchone()[0] != 'ok' or restored.execute('PRAGMA foreign_key_check').fetchone():
                raise ValueError('Восстановленная база повреждена.')
        data_dir.mkdir(parents=True, exist_ok=True)
        for name in files:
            if name != 'lectory.sqlite3':
                target = data_dir / name
                target.parent.mkdir(parents=True, exist_ok=True)
                with (stage / name).open('rb') as source_file, target.open('xb') as destination_file:
                    shutil.copyfileobj(source_file, destination_file)
        with staged_db.open('rb') as source_file, database.open('xb') as destination_file:
            shutil.copyfileobj(source_file, destination_file)
    return manifest


def restore_if_missing():
    if os.getenv('AUTO_RESTORE_BACKUP', 'true').lower() == 'true' and not DB_PATH.exists() and BUNDLED_BACKUP.is_file():
        return restore_backup(BUNDLED_BACKUP, DATA)
    return None
