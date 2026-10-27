import hashlib
import importlib
import json
import sqlite3
import zipfile
from pathlib import Path

import pytest

from backend.backup import create_backup, restore_backup
from backend.db import db


def sample_backup(env):
    media = env / 'media' / 'ready' / 'lecture.mp4'
    media.parent.mkdir(parents=True)
    media.write_bytes(b'0000ftyp00000000')
    with db() as conn:
        conn.execute('UPDATE lectures SET media_path=? WHERE id=?', (str(media), 'ready'))
        conn.execute("INSERT INTO sessions VALUES('old-session','viewer',9999999999)")
    archive = env / 'copy.zip'
    create_backup(archive, env, env / 'test.sqlite3')
    return archive


def test_backup_restores_users_media_and_portable_paths(env):
    archive = sample_backup(env)
    with db() as conn:
        password = conn.execute("SELECT password_hash FROM users WHERE id='viewer'").fetchone()[0]
        assert conn.execute('SELECT count(*) FROM sessions').fetchone()[0] == 1
    target = env / 'restored'
    manifest = restore_backup(archive, target)
    assert manifest['counts']['users'] == 4
    with sqlite3.connect(target / 'lectory.sqlite3') as conn:
        assert conn.execute("SELECT password_hash FROM users WHERE id='viewer'").fetchone()[0] == password
        assert conn.execute('SELECT count(*) FROM sessions').fetchone()[0] == 0
        video = Path(conn.execute("SELECT media_path FROM lectures WHERE id='ready'").fetchone()[0])
        assert video.is_relative_to(target) and video.read_bytes() == b'0000ftyp00000000'
        assert conn.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert not conn.execute('PRAGMA foreign_key_check').fetchall()
    before = (target / 'lectory.sqlite3').read_bytes()
    with pytest.raises(FileExistsError):
        restore_backup(archive, target)
    assert (target / 'lectory.sqlite3').read_bytes() == before


@pytest.mark.parametrize('malicious', [False, True])
def test_corrupt_or_escaping_archive_never_restores(env, malicious):
    original = sample_backup(env)
    changed = env / 'changed.zip'
    with zipfile.ZipFile(original) as source, zipfile.ZipFile(changed, 'w') as out:
        manifest = json.loads(source.read('manifest.json'))
        for name in source.namelist():
            if name == 'manifest.json':
                continue
            content = source.read(name)
            if not malicious and name.endswith('.mp4'):
                content = b'x' * len(content)
            out.writestr(name, content)
        if malicious:
            out.writestr('../outside', b'x')
            manifest['files']['../outside'] = {'size': 1, 'sha256': hashlib.sha256(b'x').hexdigest()}
        out.writestr('manifest.json', json.dumps(manifest))
    with pytest.raises(ValueError):
        restore_backup(changed, env / 'restored')
    assert not (env / 'restored' / 'lectory.sqlite3').exists()
    assert not (env / 'outside').exists()


def test_backup_requires_all_referenced_media(env):
    with db() as conn:
        conn.execute("UPDATE lectures SET media_path=? WHERE id='ready'", (str(env / 'media' / 'missing.mp4'),))
    with pytest.raises(ValueError):
        create_backup(env / 'copy.zip', env, env / 'test.sqlite3')
    assert not (env / 'copy.zip').exists()


def test_first_start_restores_only_missing_database(env, monkeypatch):
    archive = sample_backup(env)
    module = importlib.import_module('backend.backup')
    target = env / 'first-start'
    monkeypatch.setattr(module, 'BUNDLED_BACKUP', archive)
    monkeypatch.setattr(module, 'DATA', target)
    monkeypatch.setattr(module, 'DB_PATH', target / 'lectory.sqlite3')
    assert module.restore_if_missing()['counts']['users'] == 4
    assert module.restore_if_missing() is None


@pytest.mark.parametrize('manifest', [None, [], {'version': 1, 'files': {'lectory.sqlite3': None}}])
def test_invalid_manifest_is_rejected_without_database(env, manifest):
    archive = env / 'invalid.zip'
    with zipfile.ZipFile(archive, 'w') as out:
        out.writestr('lectory.sqlite3', b'invalid')
        if manifest is not None:
            out.writestr('manifest.json', json.dumps(manifest))
    with pytest.raises(ValueError):
        restore_backup(archive, env / 'restored')
    assert not (env / 'restored' / 'lectory.sqlite3').exists()
