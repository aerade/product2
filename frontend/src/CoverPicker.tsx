import { useEffect, useRef, useState } from "react";
import { AlertCircle, ImagePlus, Loader2 } from "lucide-react";
import { api, coverImage, presetCovers, type CoverChoice } from "./api";

export default function CoverPicker({ value, onChange, disabled = false, onBusyChange, sourceKey }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  sourceKey?: string;
}) {
  const [covers, setCovers] = useState<CoverChoice[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sourceUnavailable, setSourceUnavailable] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const initial = useRef(value);

  useEffect(() => { setSourceUnavailable(false); }, [sourceKey]);

  useEffect(() => {
    let live = true;
    api<CoverChoice[]>("/covers")
      .then((data) => {
        if (live) setCovers((previous) => [...previous, ...data.filter((cover) => !previous.some((item) => item.key === cover.key))]);
      })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);

  const current = (initial.current.startsWith("custom:") || initial.current.startsWith("source:")) && initial.current !== sourceKey && !covers.some((cover) => cover.key === initial.current)
    ? [{ key: initial.current, title: initial.current.startsWith("source:") ? "Обложка из видео" : "Текущая обложка", url: coverImage(initial.current) }]
    : [];

  async function upload(file: File) {
    setError("");
    if (file.size > 5 * 1024 * 1024) {
      setError("Выберите изображение размером до 5 МБ.");
      return;
    }
    setUploading(true);
    onBusyChange?.(true);
    const data = new FormData();
    data.append("file", file);
    try {
      const cover = await api<CoverChoice>("/covers", { method: "POST", body: data });
      setCovers((previous) => [cover, ...previous]);
      onChange(cover.key);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      onBusyChange?.(false);
    }
  }

  return (
    <div className="cover-library">
      <fieldset className="cover-picker" disabled={disabled || uploading}>
        <legend>Обложка лекции</legend>
        {sourceKey && <label className={value === sourceKey ? "selected" : ""}>
          <input type="radio" name="cover" value={sourceKey} checked={value === sourceKey} disabled={sourceUnavailable && value !== sourceKey} onChange={() => onChange(sourceKey)} />
          {sourceKey === "source" ? <span className="source-cover-placeholder"><ImagePlus size={22} /></span> : <img src={coverImage(sourceKey)} alt="" loading="lazy" onError={e => { setSourceUnavailable(true); e.currentTarget.src = coverImage("math"); }} />}
          <span>{sourceUnavailable ? "Обложка недоступна" : "Обложка видео"}</span>
        </label>}
        {[...presetCovers, ...current, ...covers].map((cover) => (
          <label key={cover.key} className={value === cover.key ? "selected" : ""}>
            <input type="radio" name="cover" value={cover.key} checked={value === cover.key} onChange={() => onChange(cover.key)} />
            <img src={cover.key.startsWith("custom:") ? cover.url : coverImage(cover.key)} alt="" loading="lazy" />
            <span title={cover.title}>{cover.title}</span>
          </label>
        ))}
      </fieldset>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Загрузить свою обложку"
        hidden
        disabled={disabled || uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      <button type="button" className="button outline small" disabled={disabled || uploading} onClick={() => input.current?.click()}>
        {uploading ? <Loader2 className="spin" size={16} /> : <ImagePlus size={16} />}
        {uploading ? "Загружаем обложку…" : "Добавить свою обложку"}
      </button>
      <p className="cover-hint">JPG, PNG или WebP · до 5 МБ. Изображение сохранится в вашей коллекции.</p>
      {error && <div className="error-box" role="alert"><AlertCircle size={16} /><span>{error}</span></div>}
    </div>
  );
}
