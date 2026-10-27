import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import VimeoPlayer from "@vimeo/player";
import { coverImage, type Lecture } from "./api";
declare global {
  interface Window {
    VK?: { VideoPlayer: (frame: HTMLIFrameElement) => VKPlayer };
  }
}

type VKPlayer = { seek: (time: number) => void; play: () => void; destroy: () => void; on: (name: string, fn: (data: { time?: number }) => void) => void };
let vkPromise: Promise<void> | undefined;
function loadVK() {
  if (window.VK?.VideoPlayer) return Promise.resolve();
  if (!vkPromise) vkPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://vk.com/js/api/videoplayer.js';
    script.onload = () => resolve();
    script.onerror = () => { vkPromise = undefined; reject(new Error('Не удалось загрузить плеер VK Видео.')); };
    document.head.append(script);
  });
  return vkPromise;
}

export type PlayerHandle = { seek: (seconds: number) => void };
const Player = forwardRef<
  PlayerHandle,
  { lecture: Lecture; start: number; onTime: (s: number) => void }
>(({ lecture, start, onTime }, ref) => {
  const video = useRef<HTMLVideoElement>(null),
    host = useRef<HTMLDivElement>(null);
  const vimeo = useRef<VimeoPlayer | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const vk = useRef<VKPlayer | null>(null);
  const rutubeFrame = useRef<HTMLIFrameElement | null>(null);
  const rutubeReady = useRef(false);
  const vimeoReady = useRef(false);
  const onTimeRef = useRef(onTime);
  onTimeRef.current = onTime;
  const [error, setError] = useState("");
  useEffect(() => {
    const media = video.current;
    if (!media) return;
    let frame = 0, last = 0;
    const tick = (now: number) => {
      if (now - last >= 70) { onTimeRef.current(media.currentTime); last = now; }
      if (!media.paused && !media.ended) frame = requestAnimationFrame(tick);
    };
    const startClock = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(tick); };
    const stopClock = () => { cancelAnimationFrame(frame); onTimeRef.current(media.currentTime); };
    media.addEventListener('play', startClock);
    media.addEventListener('pause', stopClock);
    media.addEventListener('ended', stopClock);
    if (!media.paused) startClock();
    return () => { cancelAnimationFrame(frame); media.removeEventListener('play', startClock); media.removeEventListener('pause', stopClock); media.removeEventListener('ended', stopClock); };
  }, [lecture.id, lecture.has_media]);
  useImperativeHandle(
    ref,
    () => ({
      seek(seconds) {
        pendingSeek.current = seconds;
        if (video.current && video.current.readyState > 0) {
          video.current.currentTime = seconds;
          video.current.play().catch(() => {});
          pendingSeek.current = null;
        }
        if (vimeo.current && vimeoReady.current)
          vimeo.current
            .setCurrentTime(seconds)
            .then(() => { pendingSeek.current = null; return vimeo.current?.play(); })
            .catch(() =>
              setError(
                "Источник не разрешил переход к таймкоду. Откройте видео на сайте источника.",
              ),
            );
        if (vk.current) { vk.current.seek(seconds); vk.current.play(); pendingSeek.current = null; }
        if (rutubeFrame.current && rutubeReady.current) {
          rutubeFrame.current.contentWindow?.postMessage(JSON.stringify({ type: 'player:setCurrentTime', data: { time: seconds } }), 'https://rutube.ru');
          rutubeFrame.current.contentWindow?.postMessage(JSON.stringify({ type: 'player:play', data: {} }), 'https://rutube.ru');
          pendingSeek.current = null;
        }
        onTimeRef.current(seconds);
      },
    }),
    [],
  );
  useEffect(() => {
    setError("");
    if (lecture.has_media || !host.current) return;
    let rutubeListener: ((event: MessageEvent) => void) | undefined;
    let disposed = false;
    if (lecture.source === "youtube") {
      setError("Этот источник больше не поддерживается. Приложите файл видео или откройте источник.");
    } else if (lecture.source === "vk") {
      const match = /^(-?\d{1,20})_(\d{1,20})$/.exec(lecture.external_id || '');
      if (!match) { setError('Неверный идентификатор VK Видео.'); return; }
      const frame = document.createElement('iframe');
      frame.src = `https://vk.com/video_ext.php?oid=${match[1]}&id=${match[2]}&js_api=1&t=${Math.floor(start)}`;
      frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
      frame.allowFullscreen = true;
      host.current.append(frame);
      loadVK().then(() => {
        if (disposed || !window.VK) return;
        vk.current = window.VK.VideoPlayer(frame);
        vk.current.on('inited', () => {
          if (pendingSeek.current !== null && vk.current) { vk.current.seek(pendingSeek.current); vk.current.play(); pendingSeek.current = null; }
        });
        vk.current.on('timeupdate', e => { if (typeof e.time === 'number') onTimeRef.current(e.time); });
        vk.current.on('error', () => setError('VK Видео не разрешил воспроизведение. Откройте источник.'));
      }).catch(e => setError(e.message));
    } else if (lecture.source === "rutube") {
      if (!/^[0-9a-f]{32}$/.test(lecture.external_id || '')) { setError('Неверный идентификатор Rutube.'); return; }
      const frame = document.createElement('iframe');
      frame.src = `https://rutube.ru/play/embed/${lecture.external_id}?t=${Math.floor(start)}`;
      frame.allow = 'clipboard-write; autoplay; fullscreen; picture-in-picture';
      frame.allowFullscreen = true;
      rutubeFrame.current = frame;
      rutubeListener = (event: MessageEvent) => {
        if (event.origin !== 'https://rutube.ru' || event.source !== frame.contentWindow) return;
        let message: { type?: string; data?: { time?: number } };
        try { message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
        if (!message || typeof message !== 'object') return;
        if (message.type === 'player:ready') {
          rutubeReady.current = true;
          if (pendingSeek.current !== null) {
            frame.contentWindow?.postMessage(JSON.stringify({ type: 'player:setCurrentTime', data: { time: pendingSeek.current } }), 'https://rutube.ru');
            frame.contentWindow?.postMessage(JSON.stringify({ type: 'player:play', data: {} }), 'https://rutube.ru');
            pendingSeek.current = null;
          }
        } else if (message.type === 'player:currentTime' && typeof message.data?.time === 'number') onTimeRef.current(message.data.time);
        else if (message.type === 'player:error') setError('Rutube не разрешил воспроизведение. Откройте источник.');
      };
      window.addEventListener('message', rutubeListener);
      host.current.append(frame);
    } else if (lecture.source === "vimeo") {
      vimeo.current = new VimeoPlayer(host.current, {
        id: Number(lecture.external_id),
        responsive: true,
      });
      vimeo.current.on("timeupdate", (e) => onTimeRef.current(e.seconds));
      vimeo.current
        .ready()
        .then(async () => {
          if (disposed || !vimeo.current) return;
          vimeoReady.current = true;
          const requested = pendingSeek.current;
          await vimeo.current.setCurrentTime(requested ?? start);
          if (requested !== null) { pendingSeek.current = null; await vimeo.current.play(); }
        })
        .catch(() =>
          setError(
            "Vimeo не разрешил воспроизведение. Откройте видео на сайте источника.",
          ),
        );
    }
    return () => {
      disposed = true;
      if (rutubeListener) window.removeEventListener('message', rutubeListener);
      rutubeFrame.current = null;
      rutubeReady.current = false;
      vk.current?.destroy();
      vk.current = null;
      vimeo.current?.destroy().catch(() => {});
      vimeo.current = null;
      vimeoReady.current = false;
      pendingSeek.current = null;
      host.current?.replaceChildren();
    };
  }, [
    lecture.id,
    lecture.has_media,
    lecture.source,
    lecture.external_id,
    start,
  ]);
  return (
    <div className="player-wrap">
      {lecture.has_media ? (
        <video
          ref={video}
          controls
          preload="metadata"
          poster={coverImage(lecture.cover)}
          src={"/api/lectures/" + lecture.id + "/media"}
          onLoadedMetadata={() => {
            if (video.current) {
              const requested = pendingSeek.current;
              video.current.currentTime = requested ?? start;
              if (requested !== null) { pendingSeek.current = null; video.current.play().catch(() => {}); }
            }
          }}
          onTimeUpdate={() =>
            onTimeRef.current(video.current?.currentTime || 0)
          }
          onError={() =>
            setError(
              "Не удалось открыть видео. Обновите страницу или обратитесь к преподавателю.",
            )
          }
          playsInline
        />
      ) : (
        <div ref={host} className="external-player" />
      )}
      {error && (
        <div className="player-error">
          {error}
          {lecture.source_url && (
            <a href={lecture.source_url} target="_blank" rel="noreferrer">
              Открыть источник ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
});
export default Player;
