from concurrent.futures import ThreadPoolExecutor
from backend.db import db


def test_bookmark_can_be_added_removed_and_added_again(login):
    client = login('viewer')
    url = '/api/lectures/ready/bookmark'
    first = client.put(url, json={'saved': True, 'seconds': 12, 'title': 'Момент'}).json()
    second = client.put(url, json={'saved': True, 'seconds': 20}).json()
    assert first['saved'] is True and second['id'] == first['id']
    assert len(client.get('/api/library').json()['bookmarks']) == 1
    assert client.put(url, json={'saved': False}).json()['saved'] is False
    assert client.get('/api/library').json()['bookmarks'] == []
    assert client.put(url, json={'saved': False}).status_code == 200
    third = client.put(url, json={'saved': True, 'seconds': 25}).json()
    assert third['saved'] is True and third['id'] != first['id']
    assert len(client.get('/api/library').json()['bookmarks']) == 1


def test_unsave_removes_legacy_duplicates_only_for_current_user(login):
    client = login('viewer')
    with db() as conn:
        for bookmark_id, owner in [('one', 'viewer'), ('two', 'viewer'), ('foreign-bookmark', 'teacher')]:
            conn.execute('INSERT INTO bookmarks(id,user_id,lecture_id,seconds) VALUES(?,?,?,?)', (bookmark_id, owner, 'ready', 10))
    assert client.put('/api/lectures/ready/bookmark', json={'saved': False}).status_code == 200
    with db() as conn:
        assert [row['id'] for row in conn.execute('SELECT id FROM bookmarks')] == ['foreign-bookmark']


def test_repeated_and_concurrent_save_does_not_duplicate(login):
    client = login('viewer')
    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(pool.map(lambda _: client.put('/api/lectures/ready/bookmark', json={'saved': True, 'seconds': 10}), range(4)))
    assert all(response.status_code == 200 for response in responses)
    assert len({response.json()['id'] for response in responses}) == 1
    old_endpoint = client.post('/api/bookmarks', json={'lecture_id': 'ready', 'seconds': 30})
    assert old_endpoint.json()['id'] == responses[0].json()['id']
    assert len(client.get('/api/library').json()['bookmarks']) == 1


def test_toggle_still_checks_access_and_timestamp(login):
    client = login('viewer')
    assert client.put('/api/lectures/private/bookmark', json={'saved': True, 'seconds': 0}).status_code == 404
    assert client.put('/api/lectures/ready/bookmark', json={'saved': True, 'seconds': 200}).status_code == 422
