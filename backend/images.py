from io import BytesIO
from uuid import uuid4
from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError


def save_image(upload, folder, size, crop=True):
    maximum = 5 * 1024 * 1024
    try:
        data = upload.file.read(maximum + 1)
    finally:
        upload.file.close()
    if len(data) > maximum:
        raise HTTPException(413, 'Выберите изображение размером до 5 МБ.')
    try:
        with Image.open(BytesIO(data)) as image:
            if image.format not in ('JPEG', 'PNG', 'WEBP'):
                raise HTTPException(422, 'Поддерживаются изображения JPG, PNG и WebP.')
            if image.width * image.height > 16_000_000:
                raise HTTPException(422, 'Выберите изображение размером до 16 мегапикселей.')
            result = ImageOps.exif_transpose(image).convert('RGBA')
            if crop:
                result = ImageOps.fit(result, size, method=Image.Resampling.LANCZOS)
            else:
                result.thumbnail(size, Image.Resampling.LANCZOS)
            result.info.clear()
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError) as exc:
        raise HTTPException(422, 'Не удалось открыть изображение. Выберите другой JPG, PNG или WebP.') from exc
    path = folder / (uuid4().hex + '.webp')
    try:
        result.save(path, 'WEBP', quality=90, method=4)
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    return path
