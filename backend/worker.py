"""Обработчик очереди с восстановлением задач после остановки."""
import logging
import threading
import time
from pathlib import Path
from .db import db, init_db
from .processing import index_lecture, transcribe, import_source, parse_subtitles, media_duration, NeedsTranscript

log = logging.getLogger(__name__)
LEASE_SECONDS = 120

def claim():
    with db() as conn:
        conn.execute('BEGIN IMMEDIATE')
        # Восстанавливаем задачи после остановки обработчика.
        conn.execute("UPDATE processing_jobs SET status='queued',stage='Восстановление после остановки' WHERE status='processing' AND lease_until<?", (time.time(),))
        job = conn.execute("SELECT * FROM processing_jobs WHERE status='queued' ORDER BY created_at LIMIT 1").fetchone()
        if not job:
            return None
        conn.execute("UPDATE processing_jobs SET status='processing',stage='Получаем транскрипт',progress=10,attempts=attempts+1,lease_until=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (time.time()+LEASE_SECONDS, job['id']))
        conn.execute("UPDATE lectures SET status='processing',error=NULL WHERE id=?", (job['lecture_id'],))
        return dict(job)

def heartbeat(job_id, stop):
    while not stop.wait(30):
        with db() as conn:
            conn.execute('UPDATE processing_jobs SET lease_until=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', (time.time()+LEASE_SECONDS, job_id))

def run_once():
    job = claim()
    if not job:
        return False
    stop = threading.Event()
    beat = threading.Thread(target=heartbeat, args=(job['id'], stop), daemon=True)
    beat.start()
    try:
        with db() as conn:
            lecture = dict(conn.execute('SELECT * FROM lectures WHERE id=?', (job['lecture_id'],)).fetchone())
        if lecture['media_path']:
            duration = media_duration(lecture['media_path'])
            if duration is None:
                raise ValueError('Не удалось прочитать видео. Загрузите исправный MP4/WebM и повторите обработку.')
            with db() as conn:
                conn.execute('UPDATE lectures SET duration=? WHERE id=?', (duration, lecture['id']))
        if lecture['subtitle_path']:
            segments = parse_subtitles(Path(lecture['subtitle_path']).read_text(encoding='utf-8-sig'))
        elif lecture['media_path']:
            segments = transcribe(lecture['media_path'])
        else:
            segments = import_source(lecture)
        with db() as conn:
            conn.execute("UPDATE processing_jobs SET stage='Строим смысловой индекс и конспект',progress=65 WHERE id=?", (job['id'],))
        index_lecture(lecture['id'], segments)
        with db() as conn:
            conn.execute("UPDATE processing_jobs SET status='completed',stage='Готово',progress=100,lease_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?", (job['id'],))
    except Exception as exc:
        log.exception('Ошибка обработки лекции %s', job['lecture_id'])
        needs = isinstance(exc, NeedsTranscript)
        message = str(exc) if isinstance(exc, (NeedsTranscript, ValueError)) else 'Ошибка обработки. Проверьте сеть, доступность моделей и свободное место, затем повторите. Подробности в журнале сервера.'
        with db() as conn:
            conn.execute('UPDATE lectures SET status=?,error=? WHERE id=?', ('needs_transcript' if needs else 'failed', message, job['lecture_id']))
            conn.execute("UPDATE processing_jobs SET status='failed',error=?,stage=? WHERE id=?", (message, 'Нужен транскрипт' if needs else 'Ошибка обработки', job['id']))
    finally:
        stop.set()
        beat.join(timeout=2)
    return True

def main():
    logging.basicConfig(level=logging.INFO)
    init_db()
    log.info('Лекторий: обработчик запущен')
    while True:
        if not run_once():
            time.sleep(2)

if __name__ == '__main__':
    main()
