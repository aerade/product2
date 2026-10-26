"""Explicit opt-in demo setup. Never runs automatically and never changes existing users."""
import json
import os
import secrets
import shutil
from .config import ROOT, MEDIA
from .db import db, init_db
from .processing import uid, parse_subtitles, index_lecture
from .security import hash_password

def main():
    init_db()
    password = os.getenv('DEMO_PASSWORD') or secrets.token_urlsafe(14)
    if len(password) < 10:
        raise SystemExit('DEMO_PASSWORD должен содержать не менее 10 символов.')
    with db() as conn:
        if conn.execute('SELECT id FROM users WHERE email IN (?,?,?)', ('viewer@demo.local','teacher@demo.local','admin@demo.local')).fetchone():
            raise SystemExit('Демо-аккаунты уже существуют. Повторное создание остановлено, данные сохранены.')
        users = []
        for role, name in [('viewer','Александр'),('teacher','Редакция Лектория'),('admin','Администратор')]:
            user_id = uid()
            conn.execute('INSERT INTO users(id,email,name,password_hash,role) VALUES(?,?,?,?,?)', (user_id, role+'@demo.local', name, hash_password(password), role))
            users.append(user_id)
    # Save a local recovery copy before model download/indexing. This path is ignored by Git.
    (MEDIA.parent / 'demo-access.txt').write_text('Локальные демонстрационные аккаунты\nviewer@demo.local\nteacher@demo.local\nadmin@demo.local\nПароль: '+password+'\n', encoding='utf-8')
    lectures = json.loads((ROOT / 'demo/lectures.json').read_text(encoding='utf-8'))
    for item in lectures:
        with db() as conn:
            course_id = uid()
            conn.execute('INSERT OR IGNORE INTO courses VALUES(?,?)', (course_id, item['course']))
            course_id = conn.execute('SELECT id FROM courses WHERE title=?', (item['course'],)).fetchone()['id']
            folder = MEDIA / item['id']
            folder.mkdir(exist_ok=True)
            source_video = ROOT / 'demo' / (item['id']+'.mp4')
            source_sub = ROOT / 'demo' / (item['id']+'.srt')
            if not source_video.is_file():
                raise SystemExit('Отсутствуют demo/*.mp4. См. README для восстановления медиа.')
            video = folder / 'lecture.mp4'
            subtitle = folder / 'lecture.srt'
            shutil.copy2(source_video, video)
            shutil.copy2(source_sub, subtitle)
            conn.execute('INSERT INTO lectures(id,owner_id,course_id,title,description,media_path,subtitle_path,cover,is_demo) VALUES(?,?,?,?,?,?,?,?,1)', (item['id'], users[1], course_id, item['title'], item['description'], str(video), str(subtitle), item['cover']))
        index_lecture(item['id'], parse_subtitles(subtitle.read_text(encoding='utf-8')))
        print('Готово:', item['title'])
    print('Демо готово. Учётные данные находятся только в data/demo-access.txt. Не публикуйте этот файл.')

if __name__ == '__main__':
    main()
