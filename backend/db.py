import contextlib
import sqlite3
from .config import DB_PATH

SCHEMA = '''
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 name TEXT NOT NULL, password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('viewer','teacher','admin')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS courses (id TEXT PRIMARY KEY, title TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS lectures (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id),
 course_id TEXT REFERENCES courses(id), title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 source TEXT NOT NULL DEFAULT 'upload', source_url TEXT UNIQUE, external_id TEXT,
 media_path TEXT, subtitle_path TEXT, cover TEXT NOT NULL DEFAULT 'math',
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','ready','failed','needs_transcript')),
 duration REAL NOT NULL DEFAULT 0, error TEXT, summary TEXT, summary_mode TEXT,
 is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS processing_jobs (
 id TEXT PRIMARY KEY, lecture_id TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'queued', stage TEXT NOT NULL DEFAULT 'В очереди',
 progress INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
 error TEXT, lease_until REAL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_job ON processing_jobs(lecture_id)
 WHERE status IN ('queued','processing');
CREATE TABLE IF NOT EXISTS transcript_segments (
 id TEXT PRIMARY KEY, lecture_id TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
 start_seconds REAL NOT NULL, end_seconds REAL NOT NULL, text TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS search_chunks (
 id TEXT PRIMARY KEY, lecture_id TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
 start_seconds REAL NOT NULL, end_seconds REAL NOT NULL, text TEXT NOT NULL,
 vector BLOB NOT NULL, model TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS outline_sections (
 id TEXT PRIMARY KEY, lecture_id TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
 title TEXT NOT NULL, start_seconds REAL NOT NULL, level INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS key_terms (
 id TEXT PRIMARY KEY, lecture_id TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
 term TEXT NOT NULL, start_seconds REAL NOT NULL);
CREATE TABLE IF NOT EXISTS bookmarks (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 lecture_id TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
 seconds REAL NOT NULL, title TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS notes (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 lecture_id TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
 seconds REAL NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS video_suggestions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), url TEXT NOT NULL,
 comment TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', reason TEXT,
 lecture_id TEXT REFERENCES lectures(id) ON DELETE SET NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS segment_lecture ON transcript_segments(lecture_id, start_seconds);
CREATE INDEX IF NOT EXISTS chunk_lecture ON search_chunks(lecture_id);
CREATE INDEX IF NOT EXISTS bookmark_user ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS note_user ON notes(user_id);
CREATE TABLE IF NOT EXISTS login_attempts (
 key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at REAL NOT NULL);
'''

@contextlib.contextmanager
def db():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    try:
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db():
    with db() as conn:
        conn.execute('PRAGMA journal_mode=WAL')
        conn.executescript(SCHEMA)
