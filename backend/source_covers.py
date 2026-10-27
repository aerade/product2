"""Обложки из проверенных источников с локальным кешем."""
from io import BytesIO
import logging
import re
from urllib.parse import urlparse
from uuid import uuid4

import httpx
from fastapi import HTTPException
from PIL import Image, ImageOps
from .config import COVERS

log = logging.getLogger(__name__)
SOURCE_COVER = re.compile(r'^source:(?:vimeo:\d{5,12}|vk:-?\d{1,20}_\d{1,20}|rutube:[0-9a-f]{32})$')


def thumbnail(source, external_id):
    key = f'source:{source}:{external_id}'
    if not SOURCE_COVER.fullmatch(key):
        raise HTTPException(404, 'Обложка не найдена.')
    destination = COVERS / f'source-{source}-{external_id}.webp'
    if destination.is_file():
        return destination
    try:
        with httpx.Client(timeout=httpx.Timeout(10, connect=4), follow_redirects=False) as client:
            if source == 'vimeo':
                metadata = client.get('https://vimeo.com/api/oembed.json', params={'url': f'https://vimeo.com/{external_id}'})
                metadata.raise_for_status()
                url = metadata.json()['thumbnail_url']
            else:
                import yt_dlp
                video_url = f'https://vkvideo.ru/video{external_id}' if source == 'vk' else f'https://rutube.ru/video/{external_id}/'
                with yt_dlp.YoutubeDL({'quiet': True, 'no_warnings': True, 'noplaylist': True, 'socket_timeout': 10, 'retries': 1}) as ydl:
                    url = ydl.extract_info(video_url, download=False).get('thumbnail')
                if not isinstance(url, str):
                    raise ValueError('Источник не вернул обложку.')
            parsed = urlparse(url)
            suffixes = {'vimeo': ('vimeocdn.com',), 'vk': ('okcdn.ru', 'userapi.com', 'vkuseraudio.net'), 'rutube': ('rtbcdn.ru', 'rutubelist.ru', 'rutube.ru')}[source]
            host = (parsed.hostname or '').lower()
            if parsed.scheme != 'https' or not any(host == suffix or host.endswith('.' + suffix) for suffix in suffixes) or parsed.port not in (None, 443) or parsed.username or parsed.password:
                raise ValueError('Недопустимый адрес обложки.')
            with client.stream('GET', url) as response:
                response.raise_for_status()
                chunks, length = [], 0
                for chunk in response.iter_bytes():
                    length += len(chunk)
                    if length > 5 * 1024 * 1024:
                        raise ValueError('Файл обложки слишком большой.')
                    chunks.append(chunk)
            with Image.open(BytesIO(b''.join(chunks))) as image:
                if image.width * image.height > 16_000_000:
                    raise ValueError('Размеры обложки слишком большие.')
                result = ImageOps.exif_transpose(image).convert('RGB')
                result.thumbnail((1280, 720), Image.Resampling.LANCZOS)
                result.info.clear()
                buffer = BytesIO()
                result.save(buffer, 'WEBP', quality=88)
                temporary = destination.with_name(destination.stem + '-' + uuid4().hex + '.tmp')
                try:
                    temporary.write_bytes(buffer.getvalue())
                    temporary.replace(destination)
                finally:
                    temporary.unlink(missing_ok=True)
        return destination
    except Exception as exc:
        log.warning('Обложка источника недоступна (%s): %s', source, type(exc).__name__)
        raise HTTPException(502, 'Не удалось получить обложку из источника.') from exc
