import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / '.env', encoding='utf-8-sig')
DATA = Path(os.getenv('DATA_DIR', str(ROOT / 'data'))).resolve()
MEDIA = DATA / 'media'
MODELS = DATA / 'models'
for directory in (DATA, MEDIA, MODELS):
    directory.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA / 'lectory.sqlite3'
MAX_UPLOAD = int(os.getenv('MAX_UPLOAD_MB', '500')) * 1024 * 1024
ORIGIN = os.getenv('PUBLIC_ORIGIN', 'http://localhost:8000')
COOKIE_SECURE = os.getenv('COOKIE_SECURE', 'false').lower() == 'true'
SESSION_DAYS = int(os.getenv('SESSION_DAYS', '7'))
