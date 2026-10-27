import importlib
from io import BytesIO
import json

import pytest
from PIL import Image
from backend.db import db
from backend.processing import index_lecture

assistant = importlib.import_module('backend.assistant')


def picture():
    result = BytesIO()
    Image.new('RGB', (180, 70), 'orange').save(result, 'PNG')
    return result.getvalue()


def test_chat_images_are_private_preserve_aspect_ratio_and_bind_to_history(login, env, monkeypatch):
    folder = env / 'chat-images'
    folder.mkdir()
    monkeypatch.setattr(assistant, 'CHAT_IMAGES', folder)
    async def answer(history, context, prompt):
        assert len(context['images']) == 1
        parts = assistant.image_parts(context['images'])
        assert parts[0]['image_url']['url'].startswith('data:image/webp;base64,')
        return {'scope': 'site', 'answer': 'Выберите лекцию через меню «+».', 'sources': [], 'actions': []}
    monkeypatch.setattr(assistant, 'provider_reply', answer)
    monkeypatch.setattr(assistant, 'search', lambda *args, **kwargs: [])
    client = login('viewer')
    uploaded = client.post('/api/chat/images', files={'file': ('../diagram.png', picture(), 'image/png')})
    assert uploaded.status_code == 201
    image = uploaded.json()
    assert image['name'] == 'diagram.png'
    with Image.open(folder / (image['id'] + '.webp')) as processed:
        assert processed.size == (180, 70)
    assert client.get(image['url']).status_code == 200
    conversation = client.post('/api/chat/conversations').json()['id']
    result = client.post('/api/chat/messages', json={'conversation_id': conversation, 'message': 'Где выбрать лекцию?', 'image_ids': [image['id']]})
    assert result.status_code == 200
    stored = client.get('/api/chat/conversations/' + conversation).json()['messages']
    assert stored[0]['images'] == [image]
    login('admin')
    assert client.get(image['url']).status_code == 404
    foreign_conversation = client.post('/api/chat/conversations').json()['id']
    assert client.post('/api/chat/messages', json={'conversation_id': foreign_conversation, 'message': 'Покажи', 'image_ids': [image['id']]}).status_code == 404


def test_chat_rejects_invalid_images_and_more_than_three_attachments(login, env, monkeypatch):
    monkeypatch.setattr(assistant, 'CHAT_IMAGES', env)
    client = login('viewer')
    assert client.post('/api/chat/images', files={'file': ('bad.png', b'not an image', 'image/png')}).status_code == 422
    assert client.post('/api/chat/images', files={'file': ('huge.png', b'x' * (5 * 1024 * 1024 + 1), 'image/png')}).status_code == 413
    assert client.get('/api/chat/images/..%2Fsecret').status_code != 200
    conversation = client.post('/api/chat/conversations').json()['id']
    assert client.post('/api/chat/messages', json={'conversation_id': conversation, 'message': 'Вопрос', 'image_ids': ['a' * 32] * 4}).status_code == 422


def test_word_timings_round_trip_and_cascade(login, fake_vectors):
    words = [{'text': 'Квадрат', 'start_seconds': 1.25, 'end_seconds': 1.8}, {'text': 'гипотенузы', 'start_seconds': 1.8, 'end_seconds': 2.7}]
    index_lecture('ready', [{'text': 'Квадрат гипотенузы', 'start_seconds': 1.25, 'end_seconds': 2.7, 'words': words}])
    client = login('viewer')
    assert client.get('/api/lectures/ready').json()['segments'][0]['words'] == words
    login('admin')
    assert client.delete('/api/lectures/ready').status_code == 204
    with db() as conn:
        assert conn.execute('SELECT count(*) FROM transcript_word_timings').fetchone()[0] == 0


@pytest.mark.parametrize('url,cover', [('https://vimeo.com/76979871', 'source:vimeo:76979871')])
def test_link_suggestion_keeps_original_cover_through_idempotent_approval(login, url, cover):
    client = login('viewer')
    suggested = client.post('/api/suggestions', json={'url': url, 'comment': 'Лекция', 'cover': 'not-a-cover'})
    assert suggested.status_code == 201
    suggestion_id = suggested.json()['id']
    assert client.get('/api/library').json()['suggestions'][0]['cover'] == cover
    login('admin')
    approved = client.patch('/api/admin/suggestions/' + suggestion_id, json={'status': 'approved', 'title': 'Проверенная лекция', 'cover': cover})
    assert approved.status_code == 200
    lecture_id = approved.json()['lecture_id']
    assert client.get('/api/lectures/' + lecture_id).json()['cover'] == cover
    assert client.patch('/api/admin/suggestions/' + suggestion_id, json={'status': 'approved'}).json()['lecture_id'] == lecture_id


def test_explicit_interface_questions_skip_embedding_search(login, monkeypatch):
    def unnecessary_search(*args, **kwargs):
        pytest.fail('Interface help must not load semantic embeddings')
    monkeypatch.setattr(assistant, 'search', unnecessary_search)
    async def reply(history, context, prompt):
        assert context['fragments'] == []
        return {'scope': 'site', 'answer': 'Воспользуйтесь настройками профиля.', 'sources': [], 'actions': []}
    monkeypatch.setattr(assistant, 'provider_reply', reply)
    client = login('viewer')
    conversation = client.post('/api/chat/conversations').json()['id']
    assert client.post('/api/chat/messages', json={'conversation_id': conversation, 'message': 'Как изменить пароль в профиле?'}).status_code == 200


@pytest.mark.parametrize('lecture_id', ['ready', None])
def test_concept_question_with_note_request_keeps_retrieval(login, monkeypatch, lecture_id):
    calls = []
    def retrieve(*args, **kwargs):
        calls.append(args)
        return [{'lecture_id': 'ready', 'title': 'Лекция', 'start_seconds': 1, 'end_seconds': 3, 'text': 'Невесомость связана со свободным падением.'}]
    monkeypatch.setattr(assistant, 'search', retrieve)
    async def reply(history, context, prompt):
        assert context['fragments']
        return {'scope': 'lecture', 'answer': 'Это свободное падение.', 'sources': [1], 'actions': []}
    monkeypatch.setattr(assistant, 'provider_reply', reply)
    client = login('viewer')
    conversation = client.post('/api/chat/conversations').json()['id']
    result = client.post('/api/chat/messages', json={'conversation_id': conversation, 'message': 'Почему на орбите невесомость? Предложи сохранить заметку.', 'lecture_id': lecture_id})
    assert result.status_code == 200 and result.json()['citations'] and len(calls) == 1


def test_private_server_files_are_not_served(client):
    for path in ('/.env', '/.git/config', '/data/lectory.sqlite3', '/backend/app.py', '/deploy/production.env.example'):
        assert client.get(path).status_code == 404


def test_production_session_uses_secure_httponly_cookie(client, monkeypatch):
    monkeypatch.setattr(importlib.import_module('backend.app'), 'COOKIE_SECURE', True)
    response = client.post('/api/auth/login', json={'email': 'viewer@test.local', 'password': 'test-password-123'})
    assert response.status_code == 200
    cookie = response.headers['set-cookie'].lower()
    assert 'httponly' in cookie and 'secure' in cookie and 'samesite=lax' in cookie


def test_source_cover_can_be_selected_only_for_its_lecture(client, login, monkeypatch, tmp_path):
    from pathlib import Path
    import importlib
    from backend.db import db
    app_module=importlib.import_module('backend.app')
    image=tmp_path/'cover.webp'
    image.write_bytes(b'preview')
    monkeypatch.setattr(app_module, 'thumbnail', lambda source, external_id: image)
    login('teacher')
    url='https://rutube.ru/video/48eda3ae0ac36787c5627c057ae17c8d/'
    created=client.post('/api/lectures/import',json={'url':url,'title':'Лекция','cover':'math'})
    assert created.status_code == 201
    lecture_id=created.json()['id']
    key='source:rutube:48eda3ae0ac36787c5627c057ae17c8d'
    assert client.get('/api/source-covers/rutube/48eda3ae0ac36787c5627c057ae17c8d').status_code == 200
    assert client.patch('/api/lectures/'+lecture_id,json={'title':'Лекция','cover':key}).status_code == 200
    assert client.patch('/api/lectures/'+lecture_id,json={'title':'Лекция','cover':'source:rutube:5badd5c2749937db7685d50a796db7f3'}).status_code == 422
    login('viewer')
    assert client.get('/api/source-covers/rutube/48eda3ae0ac36787c5627c057ae17c8d').status_code == 404


def test_source_cover_selected_at_import(client, login):
    login('teacher')
    r=client.post('/api/lectures/import',json={'url':'https://vkvideo.ru/video-210987846_456239020','title':'Лекция','cover':'source'})
    assert r.status_code == 201
    assert client.get('/api/lectures/'+r.json()['id']).json()['cover'] == 'source:vk:-210987846_456239020'
