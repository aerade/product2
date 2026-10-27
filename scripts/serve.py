"""Запуск сайта и обработчика задач; Ctrl+C останавливает оба процесса."""
import os
import subprocess
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
from backend.db import init_db
from backend.backup import restore_if_missing
import uvicorn

def main():
    restore_if_missing()
    init_db()
    worker = subprocess.Popen([sys.executable, '-m', 'backend.worker'], cwd=ROOT)
    try:
        uvicorn.run('backend.app:app',host=os.getenv('HOST','127.0.0.1'),port=int(os.getenv('PORT','8000')))
    finally:
        worker.terminate()
        try:
            worker.wait(timeout=10)
        except subprocess.TimeoutExpired:
            worker.kill()
            worker.wait()

if __name__=='__main__':main()
