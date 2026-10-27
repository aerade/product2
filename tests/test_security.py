def test_unauthenticated_cannot_read(client):
    assert client.get('/api/lectures').status_code==401
    assert client.get('/api/lectures/ready/media').status_code==401

def test_registration_ignores_privileged_role(client):
    r=client.post('/api/auth/register',json={'email':'new@test.local','password':'new-password-123','name':'Новый зритель','role':'admin'})
    assert r.status_code==201 and r.json()['role']=='viewer'
    assert 'HttpOnly' in r.headers['set-cookie'] and 'SameSite=lax' in r.headers['set-cookie']

def test_csrf_origin_and_header(client,login):
    login('viewer')
    assert client.post('/api/suggestions',json={'url':'https://youtu.be/jNQXAC9IVRw'},headers={'Origin':'https://evil.example'}).status_code==403
    assert client.post('/api/suggestions',json={'url':'https://youtu.be/jNQXAC9IVRw'},headers={'X-Requested-With':''}).status_code==403

def test_viewer_cannot_upload_import_or_admin(client,login):
    login('viewer')
    assert client.post('/api/lectures/import',json={'url':'https://youtu.be/jNQXAC9IVRw','title':'New video'}).status_code==403
    assert client.post('/api/lectures/upload',data={'title':'New video'},files={'video':('x.mp4',b'0000ftyp00000000','video/mp4')}).status_code==403
    assert client.get('/api/admin').status_code==403
    assert client.patch('/api/admin/users/viewer',json={'role':'admin'}).status_code==403

def test_teacher_cannot_edit_others_or_assign_roles(client,login):
    login('teacher')
    assert client.patch('/api/lectures/foreign',json={'title':'Changed'}).status_code==403
    assert client.delete('/api/lectures/foreign').status_code==403
    assert client.patch('/api/admin/users/viewer',json={'role':'admin'}).status_code==403
    assert client.patch('/api/lectures/ready',json={'title':'Changed'}).status_code==200

def test_unprocessed_lecture_hidden_from_viewer(client,login):
    login('viewer')
    assert 'private' not in [l['id'] for l in client.get('/api/lectures').json()]
    assert client.get('/api/lectures/private').status_code==404
    login('teacher')
    assert client.get('/api/lectures/private').status_code==200

def test_notes_private_even_for_admin(client,login):
    login('viewer')
    nid=client.post('/api/notes',json={'lecture_id':'ready','seconds':12.5,'text':'Моя мысль'}).json()['id']
    assert len(client.get('/api/library').json()['notes'])==1
    login('admin')
    assert client.get('/api/library').json()['notes']==[]
    assert client.patch('/api/notes/'+nid,json={'text':'Чужое изменение'}).status_code==404
    assert client.delete('/api/notes/'+nid).status_code==404
    login('viewer')
    assert client.patch('/api/notes/'+nid,json={'text':'Новая мысль'}).status_code==200
    assert client.delete('/api/notes/'+nid).status_code==204

def test_bookmark_ownership_and_timestamp(client,login):
    login('viewer')
    assert client.post('/api/bookmarks',json={'lecture_id':'ready','seconds':200}).status_code==422
    r=client.post('/api/bookmarks',json={'lecture_id':'ready','seconds':30,'title':'Пример'})
    assert r.status_code==201
    login('teacher')
    assert client.delete('/api/bookmarks/'+r.json()['id']).status_code==404

def test_last_admin_and_live_role_changes(client,login):
    login('admin')
    assert client.patch('/api/admin/users/admin',json={'role':'viewer'}).status_code==409
    assert client.patch('/api/admin/users/viewer',json={'role':'teacher'}).status_code==200
    login('viewer')
    assert client.get('/api/auth/me').json()['role']=='teacher'

def test_logout_invalidates_server_session(client,login):
    login('viewer')
    old=client.cookies.get('session')
    assert client.post('/api/auth/logout').status_code==204
    client.cookies.set('session',old)
    assert client.get('/api/auth/me').status_code==401

def test_public_responses_hide_paths(client,login):
    login('teacher')
    assert not {'password_hash','media_path','subtitle_path'}.intersection(client.get('/api/lectures/ready').json())

def test_login_rate_limit(client):
    codes=[client.post('/api/auth/login',json={'email':'viewer@test.local','password':'incorrect-password'}).status_code for _ in range(13)]
    assert codes[:12]==[401]*12 and codes[12]==429
