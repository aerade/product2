import { useRef, useState, type FormEvent } from "react";
import { AlertCircle, Check, CheckCircle2, ImagePlus, Loader2, Shuffle } from "lucide-react";
import { api, json, roleLabel, type User } from "./api";
import Avatar from "./Avatar";

type Tab = "profile" | "avatar" | "password";

export default function Settings({ user, onChange }: {
  user: User;
  onChange: (user: User) => void;
}) {
  const [tab, setTab] = useState<Tab>("profile");
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [selected, setSelected] = useState(user.avatar);
  const [custom, setCustom] = useState(!!user.avatar_url);
  const [busy, setBusy] = useState<Tab | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase();

  function start(section: Tab) {
    setBusy(section);
    setError("");
    setSuccess("");
  }

  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    start("profile");
    try {
      const updated = await api<User>("/auth/profile", {
        method: "PATCH",
        body: json({ name, email, current_password: emailPassword }),
      });
      onChange(updated);
      setName(updated.name);
      setEmail(updated.email);
      setEmailPassword("");
      setSuccess("Данные профиля сохранены.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function savePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSuccess("");
    if (password !== repeat) {
      setError("Новые пароли не совпадают.");
      return;
    }
    start("password");
    try {
      await api("/auth/password", {
        method: "POST",
        body: json({ current_password: current, password }),
      });
      setCurrent("");
      setPassword("");
      setRepeat("");
      setEmailPassword("");
      setSuccess("Пароль изменён. Остальные сеансы завершены.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveAvatar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    start("avatar");
    try {
      const updated = await api<User>("/auth/avatar", {
        method: "PUT",
        body: json({ avatar: selected }),
      });
      onChange(updated);
      setCustom(false);
      setSuccess("Аватарка сохранена.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    setSuccess("");
    setError("");
    if (file.size > 5 * 1024 * 1024) {
      setError("Выберите изображение размером до 5 МБ.");
      return;
    }
    start("avatar");
    const data = new FormData();
    data.append("file", file);
    try {
      const updated = await api<User>("/auth/avatar", { method: "POST", body: data });
      onChange(updated);
      setSelected(updated.avatar);
      setCustom(true);
      setSuccess("Ваша аватарка загружена и сохранена.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="settings">
      <div className="settings-account">
        <Avatar n={user.avatar} src={user.avatar_url} className="settings-account-avatar" />
        <div>
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </div>
        <span className="badge">{roleLabel[user.role]}</span>
      </div>
      <nav className="settings-tabs" aria-label="Разделы настроек">
        {([['profile', 'Профиль'], ['avatar', 'Аватарка'], ['password', 'Пароль']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            disabled={!!busy}
            onClick={() => { setTab(id); setError(""); setSuccess(""); }}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && <div className="error-box" role="alert"><AlertCircle size={18} /><span>{error}</span></div>}
      {success && <div className="settings-success" role="status"><CheckCircle2 size={18} /><span>{success}</span></div>}
      {tab === "profile" && (
        <form onSubmit={saveProfile} aria-busy={busy === "profile"}>
          <label>
            Имя
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={80} disabled={!!busy} />
          </label>
          <label>
            Электронная почта
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required maxLength={254} disabled={!!busy} />
            <small>Этот адрес используется для входа в аккаунт.</small>
          </label>
          {emailChanged && (
            <label>
              Текущий пароль
              <input type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} autoComplete="current-password" required maxLength={128} disabled={!!busy} />
              <small>Подтвердите смену электронной почты своим паролем.</small>
            </label>
          )}
          <button className="button primary" type="submit" disabled={!!busy || (name.trim() === user.name && !emailChanged)}>
            {busy === "profile" && <Loader2 className="spin" size={16} />}
            Сохранить изменения
          </button>
        </form>
      )}
      {tab === "avatar" && (
        <form onSubmit={saveAvatar} aria-busy={busy === "avatar"}>
          <div className="settings-avatar-preview">
            <Avatar n={selected} src={custom ? user.avatar_url : null} className="settings-preview-avatar" />
            <div><strong>Ваша аватарка</strong><p>Выберите персонажа из коллекции или загрузите свою фотографию.</p></div>
          </div>
          <div className="settings-avatar-grid" aria-label="Коллекция аватарок">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                type="button"
                key={n}
                aria-label={"Аватарка " + n}
                aria-pressed={!custom && selected === n}
                disabled={!!busy}
                onClick={() => { setSelected(n); setCustom(false); setSuccess(""); }}
              >
                <Avatar n={n} className="settings-choice-avatar" />
                {!custom && selected === n && <span className="settings-avatar-check"><Check size={13} /></span>}
              </button>
            ))}
          </div>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Загрузить свою аватарку"
            hidden
            disabled={!!busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
          <div className="settings-avatar-actions">
            <button className="button outline" type="button" disabled={!!busy} onClick={() => input.current?.click()}>
              {busy === "avatar" ? <Loader2 className="spin" size={16} /> : <ImagePlus size={16} />}
              Загрузить свою
            </button>
            <button className="button outline" type="button" disabled={!!busy} onClick={() => {
              setSelected((n) => ((n + Math.floor(Math.random() * 9)) % 10) + 1);
              setCustom(false);
              setSuccess("");
            }}>
              <Shuffle size={16} />Выбрать случайную
            </button>
          </div>
          <p className="settings-hint">JPG, PNG или WebP, до 5 МБ и 16 мегапикселей. Картинка будет обрезана до квадрата и сохранится сразу после загрузки.</p>
          <button className="button primary" type="submit" disabled={!!busy || custom || (selected === user.avatar && !user.avatar_url)}>
            Сохранить выбранную аватарку
          </button>
        </form>
      )}
      {tab === "password" && (
        <form onSubmit={savePassword} aria-busy={busy === "password"}>
          <label>
            Текущий пароль
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required maxLength={128} disabled={!!busy} />
          </label>
          <label>
            Новый пароль
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={10} maxLength={128} disabled={!!busy} />
            <small>От 10 до 128 символов.</small>
          </label>
          <label>
            Повторите новый пароль
            <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" required minLength={10} maxLength={128} disabled={!!busy} />
          </label>
          <p className="settings-hint">После смены пароля остальные сеансы завершатся. На этом устройстве вы останетесь в аккаунте.</p>
          <button className="button primary" type="submit" disabled={!!busy}>
            {busy === "password" && <Loader2 className="spin" size={16} />}
            Изменить пароль
          </button>
        </form>
      )}
    </div>
  );
}
