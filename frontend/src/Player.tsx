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
    onYouTubeIframeAPIReady: () => void;
  }
}

export type PlayerHandle = { seek: (seconds: number) => void };
let youtubePromise: Promise<void> | undefined;
function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve();
  if (!youtubePromise)
    youtubePromise = new Promise<void>((resolve, reject) => {
      window.onYouTubeIframeAPIReady = () => resolve();
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () =>
        reject(
          new Error(
            "Не удалось загрузить плеер YouTube. Проверьте доступ к источнику.",
          ),
        );
      document.head.append(script);
    });
  return youtubePromise;
}

const Player = forwardRef<
  PlayerHandle,
  { lecture: Lecture; start: number; onTime: (s: number) => void }
>(({ lecture, start, onTime }, ref) => {
  const video = useRef<HTMLVideoElement>(null),
    host = useRef<HTMLDivElement>(null);
  const yt = useRef<YT.Player | null>(null),
    vimeo = useRef<VimeoPlayer | null>(null);
  const onTimeRef = useRef(onTime);
  onTimeRef.current = onTime;
  const [error, setError] = useState("");
  useImperativeHandle(
    ref,
    () => ({
      seek(seconds) {
        if (video.current) {
          video.current.currentTime = seconds;
          video.current.play().catch(() => {});
        }
        if (yt.current) {
          yt.current.seekTo(seconds, true);
          yt.current.playVideo();
        }
        if (vimeo.current)
          vimeo.current
            .setCurrentTime(seconds)
            .then(() => vimeo.current?.play())
            .catch(() =>
              setError(
                "Источник не разрешил переход к таймкоду. Откройте видео на сайте источника.",
              ),
            );
        onTimeRef.current(seconds);
      },
    }),
    [],
  );
  useEffect(() => {
    setError("");
    if (lecture.has_media || !host.current) return;
    let disposed = false,
      timer: ReturnType<typeof setInterval> | undefined;
    if (lecture.source === "youtube") {
      loadYouTube()
        .then(() => {
          if (disposed || !host.current) return;
          const target = document.createElement("div");
          host.current.append(target);
          yt.current = new YT.Player(target, {
            videoId: lecture.external_id!,
            width: "100%",
            height: "100%",
            playerVars: {
              start: Math.floor(start),
              origin: window.location.origin,
              rel: 0,
            },
            events: {
              onReady: () => {
                timer = setInterval(() => {
                  if (yt.current?.getCurrentTime)
                    onTimeRef.current(yt.current.getCurrentTime());
                }, 400);
              },
              onError: () =>
                setError(
                  "YouTube не разрешил воспроизведение. Откройте видео на сайте источника или приложите файл.",
                ),
            },
          });
        })
        .catch((e) => setError(e.message));
    } else if (lecture.source === "vimeo") {
      vimeo.current = new VimeoPlayer(host.current, {
        id: Number(lecture.external_id),
        responsive: true,
      });
      vimeo.current.on("timeupdate", (e) => onTimeRef.current(e.seconds));
      vimeo.current
        .ready()
        .then(() => vimeo.current?.setCurrentTime(start))
        .catch(() =>
          setError(
            "Vimeo не разрешил воспроизведение. Откройте видео на сайте источника.",
          ),
        );
    }
    return () => {
      disposed = true;
      clearInterval(timer);
      yt.current?.destroy();
      yt.current = null;
      vimeo.current?.destroy().catch(() => {});
      vimeo.current = null;
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
            if (video.current) video.current.currentTime = start;
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
