"""Package narrated demo media and real SRT timestamps. Rebuild requires Windows SAPI."""
import json
import subprocess
import sys
import wave
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.processing import ffmpeg
from backend.config import ROOT

def stamp(seconds):
    milliseconds = round(seconds*1000)
    return f'{milliseconds//3600000:02}:{milliseconds//60000%60:02}:{milliseconds//1000%60:02},{milliseconds%1000:03}'

for lecture in json.loads((ROOT / 'demo/lectures.json').read_text(encoding='utf-8')):
    folder = ROOT / 'work/narration' / lecture['id']
    combined = folder / 'lecture.wav'
    position = 0
    subtitles = []
    with wave.open(str(combined), 'wb') as out:
        for index, text in enumerate(lecture['segments']):
            with wave.open(str(folder / f'{index}.wav'), 'rb') as source:
                if index == 0:
                    params = source.getparams()
                    out.setparams(params)
                    rate = source.getframerate()
                frames = source.readframes(source.getnframes())
                seconds = source.getnframes() / rate
                subtitles.append(f'{index+1}\n{stamp(position)} --> {stamp(position+seconds)}\n{text}\n')
                out.writeframes(frames)
                silence = b'\x00' * round(rate*.4) * params.nchannels * params.sampwidth
                out.writeframes(silence)
                position += seconds + .4
    subtitle = ROOT / 'demo' / (lecture['id']+'.srt')
    subtitle.write_text('\n'.join(subtitles), encoding='utf-8')
    titlefile = ROOT / 'demo' / (lecture['id']+'.title.txt')
    titlefile.write_text(lecture['title'], encoding='utf-8')
    image = ROOT / 'frontend/public/art' / (lecture['cover']+'.webp')
    video = ROOT / 'demo' / (lecture['id']+'.mp4')
    filters = f"scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,drawbox=x=0:y=560:w=1280:h=160:color=0x163d2d@0.94:t=fill,drawtext=fontfile='C\\:/Windows/Fonts/segoeui.ttf':textfile='demo/{lecture['id']}.title.txt':fontsize=34:fontcolor=0xf5f8ee:x=50:y=610"
    subprocess.run([ffmpeg(), '-y', '-loop', '1', '-framerate', '12', '-i', str(image), '-i', str(combined), '-vf', filters, '-c:v', 'libx264', '-preset', 'fast', '-tune', 'stillimage', '-crf', '26', '-c:a', 'aac', '-b:a', '96k', '-pix_fmt', 'yuv420p', '-shortest', '-movflags', '+faststart', str(video)], cwd=ROOT, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    print(lecture['id'], round(position, 1), 'seconds', round(video.stat().st_size/1024/1024,2), 'MB')
