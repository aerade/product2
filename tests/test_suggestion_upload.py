from pathlib import Path
from backend.db import db
from io import BytesIO
from PIL import Image
import importlib


def cover_upload(client, env, monkeypatch):
    folder = env / 'covers'
    folder.mkdir(exist_ok=True)
    monkeypatch.setattr(importlib.import_module('backend.app'), 'COVERS', folder)
    image = BytesIO()
    Image.new('RGB', (80, 45), 'orange').save(image, 'PNG')
    result = client.post('/api/covers', files={'file': ('Моя обложка.png', image.getvalue(), 'image/png')})
    assert result.status_code == 201
    return result.json()['key']


def upload(client, **overrides):
    values = {'title': 'Моя видеолекция', 'comment': 'О новых открытиях'}
    values.update(overrides)
    return client.post('/api/suggestions/upload', data=values,
        files={'video': ('lecture.mp4', b'\x00\x00\x00\x18ftypisom' + b'\0' * 30, 'video/mp4')})


def test_uploaded_suggestion_is_private_until_approval(login, fake_vectors):
    viewer = login('viewer')
    result = upload(viewer)
    assert result.status_code == 201
    suggestion_id = result.json()['id']
    assert viewer.get(f'/api/suggestions/{suggestion_id}/video').status_code == 200
    assert not any(l['title'] == 'Моя видеолекция' for l in viewer.get('/api/lectures').json())
    stranger = login('teacher')
    assert stranger.get(f'/api/suggestions/{suggestion_id}/video').status_code == 404
    assert stranger.patch(f'/api/admin/suggestions/{suggestion_id}', json={'status': 'approved'}).status_code == 403
    admin = login('admin')
    assert admin.get(f'/api/suggestions/{suggestion_id}/video').status_code == 200
    approved = admin.patch(f'/api/admin/suggestions/{suggestion_id}', json={'status': 'approved'})
    assert approved.status_code == 200
    lecture_id = approved.json()['lecture_id']
    assert admin.patch(f'/api/admin/suggestions/{suggestion_id}', json={'status': 'approved'}).json()['lecture_id'] == lecture_id
    with db() as conn:
        lecture = conn.execute('SELECT * FROM lectures WHERE id=?', (lecture_id,)).fetchone()
        assert lecture['title'] == 'Моя видеолекция'
        assert lecture['status'] == 'queued'
        assert Path(lecture['media_path']).is_file()
        assert conn.execute('SELECT count(*) FROM processing_jobs WHERE lecture_id=?', (lecture_id,)).fetchone()[0] == 1


def test_uploaded_suggestion_rejection_and_validation(login):
    viewer = login('viewer')
    assert viewer.post('/api/suggestions/upload', data={'title': 'Bad video'},
        files={'video': ('fake.mp4', b'not video', 'video/mp4')}).status_code == 422
    assert upload(viewer, title='  ').status_code == 422
    result = upload(viewer)
    suggestion_id = result.json()['id']
    admin = login('admin')
    result = admin.patch(f'/api/admin/suggestions/{suggestion_id}', json={'status': 'rejected', 'reason': 'Не по теме'})
    assert result.status_code == 200
    with db() as conn:
        assert conn.execute('SELECT lecture_id FROM video_suggestions WHERE id=?', (suggestion_id,)).fetchone()[0] is None


def test_uploaded_suggestion_accepts_optional_subtitles(login):
    viewer = login('viewer')
    response = viewer.post('/api/suggestions/upload', data={'title': 'С субтитрами'}, files={
        'video': ('lecture.mp4', b'\x00\x00\x00\x18ftypisom' + b'\0' * 30, 'video/mp4'),
        'subtitles': ('lecture.srt', '1\n00:00:00,000 --> 00:00:02,000\nТестовая лекция\n'.encode(), 'text/plain')})
    assert response.status_code == 201
    admin = login('admin')
    result = admin.patch('/api/admin/suggestions/' + response.json()['id'], json={'status': 'approved'})
    assert result.status_code == 200
    with db() as conn:
        row = conn.execute('SELECT subtitle_path FROM lectures WHERE id=?', (result.json()['lecture_id'],)).fetchone()
        assert 'Тестовая лекция' in Path(row['subtitle_path']).read_text(encoding='utf-8')


def test_viewer_cover_and_admin_metadata_survive_approval(login, env, monkeypatch):
    viewer = login('viewer')
    cover = cover_upload(viewer, env, monkeypatch)
    assert viewer.get('/api/covers').json()[0]['key'] == cover
    suggestion_id = upload(viewer, cover=cover).json()['id']
    assert viewer.get('/api/library').json()['suggestions'][0]['cover'] == cover
    teacher = login('teacher')
    assert teacher.get('/api/covers/' + cover[7:]).status_code == 404
    assert upload(teacher, cover=cover).status_code == 422
    admin = login('admin')
    assert admin.get('/api/covers/' + cover[7:]).status_code == 200
    result = admin.patch('/api/admin/suggestions/' + suggestion_id, json={
        'status': 'approved', 'title': 'Проверенное название', 'description': 'Описание редактора', 'course': 'Новый курс', 'cover': cover})
    assert result.status_code == 200
    lecture_id = result.json()['lecture_id']
    with db() as conn:
        row = conn.execute('SELECT l.*,c.title AS course FROM lectures l LEFT JOIN courses c ON c.id=l.course_id WHERE l.id=?', (lecture_id,)).fetchone()
        assert row['cover'] == cover
        assert row['title'] == 'Проверенное название'
        assert row['description'] == 'Описание редактора'
        assert row['course'] == 'Новый курс'
    assert admin.patch('/api/lectures/' + lecture_id, json={'title': 'Исправленное название', 'cover': cover}).status_code == 200


def test_link_suggestion_cover_can_be_replaced_by_admin(login, env, monkeypatch):
    viewer = login('viewer')
    viewer_cover = cover_upload(viewer, env, monkeypatch)
    result = viewer.post('/api/suggestions', json={'url': 'https://vimeo.com/76979871', 'cover': viewer_cover})
    assert result.status_code == 201
    suggestion_id = result.json()['id']
    admin = login('admin')
    own_cover = cover_upload(admin, env, monkeypatch)
    result = admin.patch('/api/admin/suggestions/' + suggestion_id, json={
        'status': 'approved', 'title': 'Название редактора', 'description': 'Обработано', 'course': 'Курс', 'cover': own_cover})
    assert result.status_code == 200
    with db() as conn:
        row = conn.execute('SELECT title,description,cover FROM lectures WHERE id=?', (result.json()['lecture_id'],)).fetchone()
        assert tuple(row) == ('Название редактора', 'Обработано', own_cover)


def test_delete_suggestion_ownership_and_keeps_published_lecture(client, login, tmp_path):
    from backend.db import db
    login('viewer')
    result = client.post('/api/suggestions/upload', data={'title':'Видео', 'cover':'math'}, files={'video':('test.mp4',b'0000ftyp00000000','video/mp4')})
    assert result.status_code == 201
    suggestion_id = result.json()['id']
    with db() as c:
        path = Path(c.execute('SELECT media_path FROM video_suggestions WHERE id=?',(suggestion_id,)).fetchone()['media_path'])
        assert path.exists()
    login('other')
    assert client.delete('/api/suggestions/'+suggestion_id).status_code == 404
    assert path.exists()
    login('admin')
    approved = client.patch('/api/admin/suggestions/'+suggestion_id,json={'status':'approved'})
    assert approved.status_code == 200
    lecture_id=approved.json()['lecture_id']
    login('viewer')
    assert client.delete('/api/suggestions/'+suggestion_id).status_code == 204
    assert not path.exists()
    with db() as c:
        assert c.execute('SELECT 1 FROM lectures WHERE id=?',(lecture_id,)).fetchone()


def test_admin_can_delete_any_suggestion(client, login):
    login('viewer')
    result = client.post('/api/suggestions',json={'url':'https://rutube.ru/video/48eda3ae0ac36787c5627c057ae17c8d/'})
    assert result.status_code == 201
    login('admin')
    assert client.delete('/api/suggestions/'+result.json()['id']).status_code == 204
