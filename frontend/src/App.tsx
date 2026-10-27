import {
  useState,
  useEffect,
  useRef,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Search,
  LayoutGrid,
  Bookmark,
  Upload,
  Shield,
  BookOpen,
  Play,
  Plus,
  X,
  LogOut,
  Settings as SettingsIcon,
  ChevronDown,
  ChevronRight,
  Clock3,
  SlidersHorizontal,
  FileText,
  Link2,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Pencil,
  Menu,
  CircleHelp,
  Send,
  ExternalLink,
} from "lucide-react";
import {
  api,
  json,
  ApiError,
  timecode,
  duration,
  coverImage,
  sourceCoverFromUrl,
  roleLabel,
  statusLabel,
  type User,
  type Lecture,
  type Hit,
  type Library,
  type SavedMoment,
  type Suggestion,
} from "./api";
import Player, { type PlayerHandle } from "./Player";
import TranscriptText from "./TranscriptText";
import ThemeSwitch from "./ThemeSwitch";
import Avatar from "./Avatar";
import Settings from "./Settings";
import CoverPicker from "./CoverPicker";
import Select, { CourseInput } from "./Select";
import ThemedArt from "./ThemedArt";
import Toast from "./Toast";
import AIAssistant from "./AIAssistant";

const plural = (n: number, forms: string[]) =>
  forms[
    n % 100 >= 11 && n % 100 <= 14
      ? 2
      : n % 10 === 1
        ? 0
        : n % 10 >= 2 && n % 10 <= 4
          ? 1
          : 2
  ];
const go = (path: string) => {
  window.location.hash = path;
};
const emptyLibrary: Library = { bookmarks: [], notes: [], suggestions: [] };
function Spinner() {
  return (
    <div className="loading" role="status">
      <Loader2 className="spin" />
      <span>Загружаем пространство знаний…</span>
    </div>
  );
}
function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error-box" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
    </div>
  ) : null;
}
function Empty({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <BookOpen />
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  function dismiss() {
    if (closing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onClose(); return; }
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, 170);
  }
  useEffect(() => {
    dialog.current?.showModal();
    const el = dialog.current;
    return () => el?.close();
  }, []);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  return (
    <dialog
      ref={dialog}
      className={"modal " + (wide ? "wide " : "") + className}
      data-closing={closing}
      onCancel={e => { e.preventDefault(); dismiss(); }}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button className="icon-button" onClick={dismiss} aria-label="Закрыть">
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Brand() {
  return (
    <span className="brand" role="img" aria-label="Лекторий">
      <img
        className="brand-light"
        src="/art/lectory-logo-light.webp"
        alt=""
        width={2172}
        height={724}
      />
      <img
        className="brand-dark"
        src="/art/lectory-logo-dark.webp"
        alt=""
        width={2172}
        height={724}
      />
    </span>
  );
}

function Auth({ onLogin }: { onLogin: (u: User) => void }) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      onLogin(
        await api<User>("/auth/" + (register ? "register" : "login"), {
          method: "POST",
          body: json(Object.fromEntries(fd)),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Brand />
        <div className="auth-art" aria-hidden="true">
          <img
            className="auth-art-light"
            src="/art/auth-story-light.webp"
            alt=""
            width={1024}
            height={1536}
          />
          <img
            className="auth-art-dark"
            src="/art/auth-story-dark.webp"
            alt=""
            width={1024}
            height={1536}
          />
        </div>
      </div>
      <div className="auth-form-wrap">
        <div className="auth-theme">
          <ThemeSwitch />
        </div>
        <div className="auth-form">
          <h2>
            {register ? "Создайте свой аккаунт" : "Рады видеть вас снова"}
          </h2>
          <p>
            {register
              ? "Сохраняйте открытия и собирайте свою библиотеку."
              : "Войдите, чтобы продолжить учиться и находить новое."}
          </p>
          <form onSubmit={submit}>
            {register && (
              <label>
                Как вас зовут
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Имя и фамилия"
                />
              </label>
            )}
            <label>
              Электронная почта
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
              />
            </label>
            <label>
              Пароль
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                required
                minLength={10}
                maxLength={128}
                placeholder="Не менее 10 символов"
              />
            </label>
            <ErrorBox message={error} />
            <button className="button primary full" disabled={busy}>
              {busy ? (
                <Loader2 className="spin" size={18} />
              ) : (
                <>
                  {register ? "Создать аккаунт" : "Войти в Лекторий"}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          <p className="auth-switch">
            {register ? "Уже есть аккаунт?" : "Впервые здесь?"}{" "}
            <button
              className="text-button"
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {register ? "Войти" : "Зарегистрироваться"}
            </button>
          </p>
          <div className="auth-footnote">
            <Shield size={16} />
            Ваши заметки видны только вам
          </div>
        </div>
        <span className="auth-copyright">Лекторий © 2026</span>
      </div>
    </div>
  );
}

export default function App() {
  const [, refreshTheme] = useState(0);
  useEffect(() => {
    let theme = document.documentElement.dataset.theme;
    const update = () => {
      const next = document.documentElement.dataset.theme;
      if (next !== theme) { theme = next; refreshTheme(v => v + 1); }
    };
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("lectory-theme-change", update);
    return () => { observer.disconnect(); window.removeEventListener("lectory-theme-change", update); };
  }, []);
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [route, setRoute] = useState(window.location.hash.slice(1) || "/"),
    [lectures, setLectures] = useState<Lecture[]>([]),
    [catalogError, setCatalogError] = useState(""),
    [revision, setRevision] = useState(0),
    [mobile, setMobile] = useState(false),
    [modal, setModal] = useState<"suggest" | "help" | "settings" | null>(null),
    [toast, setToast] = useState<{ id: number; message: string } | null>(null),
    [searchText, setSearchText] = useState("");
  const toastSerial = useRef(0);
  useEffect(() => {
    const openAssistantTarget = (event: Event) => {
      const target = (event as CustomEvent<string>).detail;
      if (target === 'settings' || target === 'suggest') setModal(target);
    };
    window.addEventListener('lectory-assistant-open', openAssistantTarget);
    return () => window.removeEventListener('lectory-assistant-open', openAssistantTarget);
  }, []);
  function notify(message: string) {
    setToast({ id: ++toastSerial.current, message });
  }
  function refresh() {
    setRevision((v) => v + 1);
  }
  useEffect(() => {
    api<User>("/auth/me")
      .then(setUser)
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401))
          setCatalogError(e.message);
      })
      .finally(() => setLoading(false));
    const change = () => {
      setRoute(window.location.hash.slice(1) || "/");
      setMobile(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", change);
    const expired = () => {
      setModal(null);
      setUser(null);
      setLectures([]);
    };
    window.addEventListener("session-expired", expired);
    return () => {
      window.removeEventListener("hashchange", change);
      window.removeEventListener("session-expired", expired);
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    let disposed = false;
    const load = () =>
      api<Lecture[]>("/lectures")
        .then((data) => {
          if (!disposed) {
            setLectures(data);
            setCatalogError("");
          }
        })
        .catch((e) => {
          if (!disposed) setCatalogError(e.message);
        });
    load();
    const timer = setInterval(load, 10000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [user, revision]);
  if (loading) return <Spinner />;
  if (!user)
    return (
      <>
        <Auth
          onLogin={(u) => {
            setUser(u);
            go("/");
          }}
        />
        {catalogError && (
          <div className="offline-banner">
            <ErrorBox message={catalogError} />
          </div>
        )}
      </>
    );
  const lecturer = user.role !== "viewer";
  const nav = [
    { path: "/", label: "Каталог лекций", icon: LayoutGrid },
    { path: "/search", label: "Смысловой поиск", icon: Search },
    { path: "/library", label: "Моя библиотека", icon: Bookmark },
  ];
  const active = route.startsWith("/lecture") ? "/" : route.split("?")[0];
  let content: ReactNode;
  if (route.startsWith("/lecture/")) {
    const [path, qs] = route.split("?");
    content = (
      <LecturePage
        key={route}
        id={path.split("/")[2]}
        start={Number(new URLSearchParams(qs).get("t")) || 0}
        user={user}
        notify={notify}
        refresh={refresh}
      />
    );
  } else if (active === "/search")
    content = (
      <SearchPage
        lectures={lectures}
        initial={new URLSearchParams(route.split('?')[1]).get('q') || searchText}
        onSearch={setSearchText}
      />
    );
  else if (active === "/library") content = <LibraryPage notify={notify} />;
  else if (active === "/upload" && lecturer)
    content = (
      <UploadPage
        lectures={lectures}
        user={user}
        notify={notify}
        refresh={refresh}
      />
    );
  else if (active === "/admin" && user.role === "admin")
    content = (
      <AdminPage
        user={user}
        lectures={lectures}
        notify={notify}
        onUserChange={(u) => setUser(u)}
      />
    );
  else
    content = (
      <Catalog
        lectures={lectures}
        user={user}
        onSearch={(q) => {
          setSearchText(q);
          go("/search");
        }}
        suggest={() => setModal("suggest")}
      />
    );
  return (
    <div className="app-shell">
      <button
        className={"sidebar-scrim " + (mobile ? "visible" : "")}
        aria-label="Закрыть меню"
        onClick={() => setMobile(false)}
      />
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <a className="brand-link" href="#/">
          <Brand />
        </a>
        <div className="workspace-label">ПРОСТРАНСТВО ЗНАНИЙ</div>
        <nav onClick={() => setMobile(false)}>
          {nav.map((item) => (
            <a
              key={item.path}
              href={"#" + item.path}
              className={active === item.path ? "active" : ""}
            >
              <item.icon size={19} />
              {item.label}
              {active === item.path && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        {lecturer && (
          <>
            <div className="workspace-label manage-label">УПРАВЛЕНИЕ</div>
            <nav onClick={() => setMobile(false)}>
              <a
                href="#/upload"
                className={active === "/upload" ? "active" : ""}
              >
                <Upload size={19} />
                Мои лекции
              </a>
              {user.role === "admin" && (
                <a
                  href="#/admin"
                  className={active === "/admin" ? "active" : ""}
                >
                  <Shield size={19} />
                  Администрирование
                </a>
              )}
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          <button className="sidebar-help" onClick={() => setModal("help")}>
            <CircleHelp size={18} />О Лектории
            <ArrowUpRight size={15} />
          </button>
          <div className="profile">
            <Avatar n={user.avatar} src={user.avatar_url} />
            <div>
              <strong>{user.name}</strong>
              <small>{roleLabel[user.role]}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Настройки профиля"
              title="Настройки профиля"
              onClick={() => {
                setMobile(false);
                setModal("settings");
              }}
            >
              <SettingsIcon size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Выйти"
              title="Выйти"
              onClick={async () => {
                try {
                  await api("/auth/logout", { method: "POST" });
                  setModal(null);
                  setUser(null);
                  setLectures([]);
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-menu"
              aria-label="Открыть меню"
              onClick={() => setMobile(!mobile)}
            >
              <Menu />
            </button>
            <span className="topbar-label">Личное пространство</span>
            <ChevronRight size={13} />
            <span>
              {active === "/search"
                ? "Смысловой поиск"
                : active === "/library"
                  ? "Моя библиотека"
                  : active === "/upload"
                    ? "Мои лекции"
                    : active === "/admin"
                      ? "Администрирование"
                      : route.startsWith("/lecture")
                        ? "Видеолекция"
                        : "Каталог"}
            </span>
          </div>
          <div className="topbar-right">
            <ThemeSwitch />
          </div>
        </header>
        <main>
          <ErrorBox message={catalogError} />
          <div className="page-scene" key={route}>{content}</div>
        </main>
      </div>
      {toast && <Toast key={toast.id} message={toast.message} onDone={() => setToast(null)} />}
      <AIAssistant key={user.id} user={user} lectureId={route.startsWith('/lecture/') ? route.split('?')[0].split('/')[2] : undefined}
        lectureTitle={lectures.find(l => l.id === route.split('?')[0].split('/')[2])?.title} />
      {modal === "suggest" && (
        <SuggestModal onClose={() => setModal(null)} notify={notify} />
      )}
      {modal === "settings" && (
        <Modal title="Настройки профиля" onClose={() => setModal(null)} wide className="settings-modal">
          <Settings
            user={user}
            onChange={(updated) => {
              setUser((current) => current?.id === updated.id ? updated : current);
              refresh();
            }}
          />
        </Modal>
      )}
      {modal === "help" && (
        <Modal title="Знания по вашему запросу" onClose={() => setModal(null)}>
          <div className="help-steps">
            <div>
              <span>01</span>
              <h3>Выберите лекции</h3>
              <p>Исследуйте одну лекцию, курс или весь каталог.</p>
            </div>
            <div>
              <span>02</span>
              <h3>Спросите своими словами</h3>
              <p>
                Опишите мысль, которую хотите найти. Смысловая модель сопоставит
                запрос с транскриптами.
              </p>
            </div>
            <div>
              <span>03</span>
              <h3>Вернитесь к моменту</h3>
              <p>
                Нажмите на результат, чтобы открыть видео с нужной секунды.
                Сохраните закладку или личную заметку.
              </p>
            </div>
          </div>
          <button
            className="button primary full"
            onClick={() => {
              setModal(null);
              go("/search");
            }}
          >
            Начать исследовать
            <ArrowRight size={18} />
          </button>
        </Modal>
      )}
    </div>
  );
}

function SortPicker({ value, onChange }: {
  value: "new" | "title";
  onChange: (value: "new" | "title") => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const options = [
    { value: "new", label: "Сначала новые" },
    { value: "title", label: "По названию" },
  ] as const;
  const label = options.find((option) => option.value === value)!.label;
  useEffect(() => {
    const closeOutside = (e: PointerEvent) => {
      if (menu.current && !menu.current.contains(e.target as Node)) menu.current.open = false;
    };
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector<HTMLElement>("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  return (
    <details className="sort-control" ref={menu}>
      <summary aria-label={"Сортировка: " + label}>
        <SlidersHorizontal size={15} />
        <span>{label}</span>
        <ChevronDown size={15} />
      </summary>
      <div className="sort-options" aria-label="Варианты сортировки">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => {
              onChange(option.value);
              if (menu.current) {
                menu.current.open = false;
                menu.current.querySelector<HTMLElement>("summary")?.focus();
              }
            }}
          >
            {option.label}
            {value === option.value && <Check size={15} />}
          </button>
        ))}
      </div>
    </details>
  );
}

function Catalog({
  lectures,
  user,
  onSearch,
  suggest,
}: {
  lectures: Lecture[];
  user: User;
  onSearch: (q: string) => void;
  suggest: () => void;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [course, setCourse] = useState(""),
    [sort, setSort] = useState<"new" | "title">("new");
  const courses = [...new Set(lectures.map(lecture => lecture.course).filter((name): name is string => !!name))].sort((a, b) => a.localeCompare(b, 'ru'));
  const shown = lectures
    .filter(
      (l) =>
        (!course || l.course === course) &&
        (!filter ||
          (l.title + " " + l.description)
            .toLowerCase()
            .includes(filter.toLowerCase())),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "ru")
        : b.created_at.localeCompare(a.created_at),
    );
  const ready = lectures.filter((l) => l.status === "ready");
  return (
    <>
      <div className="page-title">
        <div>
          <h1>
            Откройте новое<span className="title-dot">.</span>
          </h1>
          <p>Ваша следующая идея уже есть в одной из лекций.</p>
        </div>
        <button className="button outline" onClick={suggest}>
          <Plus size={17} />
          Предложить видео
        </button>
      </div>
      <section className="hero">
        <img
          className="hero-art hero-art-light"
          src="/art/catalog-hero-light.webp"
          alt=""
        />
        <img
          className="hero-art hero-art-dark"
          src="/art/catalog-hero-dark.webp"
          alt=""
        />
        <div className="hero-content">
          <h2>
            Найдите мысль.
            <br />
            Продолжите открытие.
          </h2>
          <p>
            Задайте вопрос своими словами —<br />и переходите к нужной секунде
            лекции.
          </p>
          <form
            className="hero-search"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) onSearch(query.trim());
            }}
          >
            <Search size={20} />
            <input
              aria-label="Что хотите понять?"
              placeholder="Что хотите понять?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              minLength={2}
              required
            />
            <button type="submit" aria-label="Найти по смыслу">
              <ArrowRight size={21} />
            </button>
          </form>
        </div>
      </section>
      <div className="catalog-heading">
        <div>
          <h2>
            Библиотека лекций <span className="count">{lectures.length}</span>
          </h2>
          <p>Изучайте в своём темпе. Возвращайтесь к важному.</p>
        </div>
        <div className="catalog-stats">
          <span>
            <BookOpen size={15} />
            {ready.length} готовы к просмотру
          </span>
        </div>
      </div>
      <div className="catalog-toolbar">
        <span className="catalog-all">Все лекции</span>
        <div className="catalog-controls">
          <label className="compact-search">
            <Search size={15} />
            <input
              aria-label="Фильтр по названию"
              placeholder="По названию"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          <Select value={course} onChange={setCourse} label="Курс в каталоге"
            options={[{ value: '', label: 'Все курсы' }, ...courses.map(name => ({ value: name, label: name }))]} />
          <SortPicker value={sort} onChange={setSort} />
        </div>
      </div>
      {shown.length ? (
        <div className="lecture-grid">
          {shown.map((l) => (
            <LectureCard key={l.id} lecture={l} />
          ))}
        </div>
      ) : (
        <Empty
          title={
            lectures.length ? "Лекции не найдены" : "Здесь начинаются открытия"
          }
          text={
            lectures.length
              ? "Попробуйте другое название."
              : user.role === "viewer"
                ? "Преподаватель ещё не добавил лекции. Предложите видео, которое хотели бы изучить."
                : "Добавьте первую лекцию: загрузите видео или импортируйте ссылку."
          }
        >
          <button
            className="button primary"
            onClick={() => (user.role === "viewer" ? suggest() : go("/upload"))}
          >
            <Plus size={17} />
            {user.role === "viewer" ? "Предложить видео" : "Добавить лекцию"}
          </button>
        </Empty>
      )}
    </>
  );
}
function LectureCard({ lecture: l }: { lecture: Lecture }) {
  return (
    <a className="lecture-card" href={"#/lecture/" + l.id}>
      <div className={"card-image " + l.cover}>
        <img src={coverImage(l.cover)} alt="" loading="lazy" />
        <span className="duration-badge">
          <Clock3 size={12} />
          {l.duration ? duration(l.duration) : "Новая лекция"}
        </span>
        <span className="card-play">
          <Play fill="currentColor" size={20} />
        </span>
      </div>
      <div className="card-body">
        <div className="card-meta">
          <span className={"status-dot " + l.status} />
          {statusLabel[l.status]}
          {l.is_demo === 1 && <span className="demo-label">Демо</span>}
        </div>
        <h3>{l.title}</h3>
        <p>{l.description}</p>
        <div className="card-bottom">
          <Avatar n={l.author_avatar} src={l.author_avatar_url} className="author-avatar" />
          <span>{l.author}</span>
          <ArrowUpRight size={19} />
        </div>
      </div>
    </a>
  );
}

function LectureScopePicker({ lectures, selected, onApply, onClose }: {
  lectures: Lecture[]; selected: string[]; onApply: (ids: string[]) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(selected);
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState("");
  const [page, setPage] = useState(0);
  const courses = [...new Set(lectures.map(l => l.course).filter((c): c is string => !!c))];
  const matching = lectures.filter(l => (!course || l.course === course) &&
    `${l.title} ${l.course || ""} ${l.author}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));
  const pageSize = 24;
  const pages = Math.max(1, Math.ceil(matching.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const toggle = (id: string) => setDraft(previous => previous.includes(id) ? previous.filter(i => i !== id) : [...previous, id]);
  return <Modal title="Где искать?" onClose={onClose} wide className="scope-modal">
    <p className="muted">Поиск по всему каталогу или выбранным лекциям.</p>
    <div className="scope-toolbar">
      <label className="inline-search"><Search size={18} /><input autoFocus value={query} placeholder="Название, автор или курс"
        aria-label="Найти лекцию для поиска" onChange={e => { setQuery(e.target.value); setPage(0); }} /></label>
      <Select value={course} options={[{ value: "", label: "Все курсы" }, ...courses.map(c => ({ value: c, label: c }))]}
        label="Курс для поиска" onChange={value => { setCourse(value); setPage(0); }} />
    </div>
    <div className="scope-selection">
      <span>{draft.length ? `Выбрано: ${draft.length}` : "Весь каталог"} · найдено {matching.length}</span>
      <div><button type="button" className="text-button" disabled={!matching.length} onClick={() => setDraft(ids => [...new Set([...ids, ...matching.map(l => l.id)])])}>Выбрать найденные</button>
      <button type="button" className="text-button" disabled={!draft.length} onClick={() => setDraft([])}>Сбросить</button></div>
    </div>
    {!!draft.length && <div className="scope-chips">{draft.slice(0, 5).map(id => <button key={id} type="button" onClick={() => toggle(id)}>
      <span>{lectures.find(l => l.id === id)?.title || "Лекция"}</span><X size={13} /></button>)}{draft.length > 5 && <span>Ещё {draft.length - 5}</span>}</div>}
    <div className="scope-results">
      {matching.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(l => <label key={l.id} className={draft.includes(l.id) ? "selected" : ""}>
        <input type="checkbox" checked={draft.includes(l.id)} onChange={() => toggle(l.id)} />
        <img src={coverImage(l.cover)} alt="" loading="lazy" /><span><strong>{l.title}</strong><small>{l.course || "Без курса"} · {l.author}</small></span>
      </label>)}
      {!matching.length && <p className="muted">Лекции не найдены. Измените запрос или курс.</p>}
    </div>
    <div className="scope-footer"><div className="scope-pagination">
      <button type="button" className="icon-button" aria-label="Предыдущие лекции" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}><ArrowLeft size={17} /></button>
      <span>{currentPage + 1} / {pages}</span><button type="button" className="icon-button" aria-label="Следующие лекции" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}><ArrowRight size={17} /></button>
    </div><button type="button" className="button primary" onClick={() => onApply(draft)}>Применить{draft.length ? ` · ${draft.length}` : ""}</button></div>
  </Modal>;
}

function SearchPage({
  lectures,
  initial,
  onSearch,
}: {
  lectures: Lecture[];
  initial: string;
  onSearch: (q: string) => void;
}) {
  const [query, setQuery] = useState(initial),
    [selected, setSelected] = useState<string[]>([]),
    [hits, setHits] = useState<Hit[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [filterOpen, setFilterOpen] = useState(false),
    [searched, setSearched] = useState("");
  const ready = lectures.filter((l) => l.status === "ready");
  async function run(q = query, ids = selected) {
    if (q.trim().length < 2) return;
    setBusy(true);
    setError("");
    onSearch(q);
    setSearched(q);
    try {
      const data = await api<{ results: Hit[] }>("/search", {
        method: "POST",
        body: json({ query: q, lecture_ids: ids }),
      });
      setHits(data.results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (initial.trim().length > 1) void run(initial);
  }, []);
  return (
    <>
      <div className="page-title">
        <div>
          <h1>
            Поиск по смыслу<span className="title-dot">.</span>
          </h1>
          <p>Не нужно помнить точные слова. Достаточно вашей мысли.</p>
        </div>
      </div>
      <div className="search-workspace">
        <form
          className="big-search"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <Search size={23} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Например, почему модель ошибается на новых данных?"
            aria-label="Поисковый запрос"
            required
            minLength={2}
            maxLength={1000}
          />
          <button className="button primary" disabled={busy}>
            {busy ? (
              <Loader2 size={18} className="spin" />
            ) : (
              <>
                Найти
                <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>
        <div className="search-options">
          <button
            className="text-button"
            onClick={() => setFilterOpen(!filterOpen)}
          >
            <SlidersHorizontal size={16} />
            {selected.length
              ? `Выбрано лекций: ${selected.length}`
              : "По всему каталогу"}
            <ChevronDown size={15} />
          </button>
        </div>
        {filterOpen && (
          <LectureScopePicker lectures={ready} selected={selected} onClose={() => setFilterOpen(false)}
            onApply={ids => { setSelected(ids); setFilterOpen(false); if (query.trim().length > 1) void run(query, ids); }} />
        )}
      </div>
      <ErrorBox message={error} />
      {busy ? (
        <Spinner />
      ) : hits !== null ? (
        <>
          <div className="result-heading">
            <h2>
              Найденные фрагменты <span className="count">{hits.length}</span>
            </h2>
            <span>По запросу «{searched}»</span>
          </div>
          {hits.length ? (
            <div className="search-results">
              {hits.map((hit, i) => (
                <a
                  className="search-result"
                  key={hit.id}
                  href={`#/lecture/${hit.lecture_id}?t=${hit.start_seconds}`}
                >
                  <img src={coverImage(hit.cover)} alt="" />
                  <div>
                    <span className="result-lecture">{hit.title}</span>
                    <h3>
                      <span className="time-chip">
                        <Play size={12} fill="currentColor" />
                        {timecode(hit.start_seconds)}
                      </span>
                      <span>Фрагмент {String(i + 1).padStart(2, "0")}</span>
                    </h3>
                    <p>{hit.text}</p>
                  </div>
                  <ArrowUpRight size={23} />
                </a>
              ))}
            </div>
          ) : (
            <Empty
              title="Пока нет подходящих фрагментов"
              text="Выберите другие лекции или измените запрос. Поиск доступен после завершения обработки видео."
            />
          )}
        </>
      ) : (
        <div className="search-intro">
          <ThemedArt name="search-guide" alt="Исследовательница находит связи между идеями" />
          <div>
            <h2>
              Один вопрос.
              <br />
              Весь мир лекций.
            </h2>
            <p>Попробуйте запрос, на который хотели бы найти ответ.</p>
            {[
              "Как нейросети учатся на ошибках?",
              "Как найти длину диагонали?",
              "Почему спутник не падает на Землю?",
            ].map((q) => (
              <button
                key={q}
                onClick={() => {
                  setQuery(q);
                  void run(q);
                }}
              >
                {q}
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function LecturePage({
  id,
  start,
  user,
  notify,
  refresh,
}: {
  id: string;
  start: number;
  user: User;
  notify: (m: string) => void;
  refresh: () => void;
}) {
  const [lecture, setLecture] = useState<Lecture | null>(null),
    [error, setError] = useState(""),
    [seconds, setSeconds] = useState(start),
    [tab, setTab] = useState("outline"),
    [following, setFollowing] = useState(true),
    [filter, setFilter] = useState(""),
    [note, setNote] = useState<number | null>(null),
    [editing, setEditing] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false),
    [busy, setBusy] = useState(false),
    [notes, setNotes] = useState<SavedMoment[]>([]),
    [bookmarked, setBookmarked] = useState(false);
  const player = useRef<PlayerHandle>(null),
    transcript = useRef<HTMLDivElement>(null),
    readyRef = useRef(false);
  readyRef.current = lecture?.status === "ready";
  function load() {
    api<Lecture>("/lectures/" + id)
      .then(setLecture)
      .catch((e) => setError(e.message));
  }
  useEffect(() => {
    let live = true;
    const fetchLecture = () =>
      api<Lecture>("/lectures/" + id)
        .then((l) => {
          if (live) setLecture(l);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    fetchLecture();
    const timer = setInterval(() => {
      if (live && !readyRef.current) fetchLecture();
    }, 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [id]);
  useEffect(() => {
    let live = true;
    const loadLibrary = () => api<Library>("/library")
      .then((l) => {
        if (!live) return;
        setNotes(l.notes.filter((n) => n.lecture_id === id));
        setBookmarked(l.bookmarks.some(b => b.lecture_id === id));
      })
      .catch(() => {});
    void loadLibrary();
    window.addEventListener('lectory-library-changed', loadLibrary);
    return () => { live = false; window.removeEventListener('lectory-library-changed', loadLibrary); };
  }, [id, note]);
  const active = lecture?.segments?.find(
    (s) => seconds >= s.start_seconds && seconds < s.end_seconds,
  )?.id;
  useEffect(() => {
    if (following && transcript.current && active) {
      const parent = transcript.current;
      const row = parent.querySelector<HTMLElement>('.transcript-word[data-speaking="true"]') || parent.querySelector<HTMLElement>('[data-active="true"]');
      if (row) {
        const parentBounds = parent.getBoundingClientRect();
        const rowBounds = row.getBoundingClientRect();
        const top = rowBounds.top - parentBounds.top + parent.scrollTop;
        if (
          top < parent.scrollTop ||
          top + rowBounds.height > parent.scrollTop + parent.clientHeight
        )
          parent.scrollTo({ top: Math.max(0, top - 80), behavior: "smooth" });
      }
    }
  }, [active, following, seconds]);
  function seek(time: number) {
    setSeconds(time);
    player.current?.seek(time);
  }
  if (!lecture) return error ? <ErrorBox message={error} /> : <Spinner />;
  const canEdit =
    user.role === "admin" ||
    (user.role === "teacher" && lecture.owner_id === user.id);
  const segments =
    lecture.segments?.filter(
      (s) => !filter || s.text.toLowerCase().includes(filter.toLowerCase()),
    ) || [];
  const terms = [...new Set(lecture.terms?.map((t) => t.term))];
  async function bookmark() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api<{ saved: boolean }>(`/lectures/${id}/bookmark`, {
        method: "PUT",
        body: json({
          saved: !bookmarked,
          seconds,
          title:
            lecture!.segments
              ?.find(
                (s) => seconds >= s.start_seconds && seconds < s.end_seconds,
              )
              ?.text.slice(0, 100) || "Важный момент",
        }),
      });
      notify(result.saved ? "Момент сохранён в вашу библиотеку" : "Лекция удалена из закладок");
      setBookmarked(result.saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <a className="back-link" href="#/">
        <ArrowLeft size={16} />К каталогу лекций
      </a>
      <div className="lecture-title">
        <div>
          <span className="section-label">
            {lecture.course || "ВИДЕОЛЕКЦИЯ"}
          </span>
          <h1>{lecture.title}</h1>
          <div className="lecture-byline">
            <Avatar
              n={lecture.owner_id === user.id ? user.avatar : lecture.author_avatar}
              src={lecture.owner_id === user.id ? user.avatar_url : lecture.author_avatar_url}
              className="author-avatar"
            />
            {lecture.owner_id === user.id ? user.name : lecture.author}
            <span>·</span>
            <Clock3 size={14} />
            {duration(lecture.duration)}
            {lecture.is_demo === 1 && (
              <span className="badge">Демонстрационная мини-лекция</span>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="lecture-management">
          <button className="lecture-delete-button" onClick={() => setConfirmDelete(true)} title="Удалить лекцию">
            <Trash2 size={15} />Удалить
          </button>
          <button
            className="button outline small"
            onClick={() => setEditing(true)}
          >
            <Pencil size={15} />
            Изменить
          </button>
          </div>
        )}
      </div>
      <ErrorBox message={error} />
      {lecture.status !== "ready" ? (
        <div className="processing-panel">
          <Loader2
            size={32}
            className={
              ["queued", "processing"].includes(lecture.status) ? "spin" : ""
            }
          />
          <h2>{statusLabel[lecture.status]}</h2>
          <p>
            {lecture.error ||
              lecture.job?.stage ||
              "Обработка начнётся, когда освободится обработчик."}
          </p>
          <progress value={lecture.job?.progress || 0} max="100" />
          <p className="muted">
            Статус обновляется автоматически каждые 5 секунд.
          </p>
          {canEdit && (
            <div className="button-row">
              <button
                className="button primary"
                onClick={async () => {
                  try {
                    await api("/lectures/" + id + "/retry", { method: "POST" });
                    load();
                    refresh();
                    notify("Лекция добавлена в очередь");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Повторить обработку
              </button>
              <label className="button outline file-label">
                <Upload size={17} />
                Приложить видео или SRT/VTT
                <input
                  type="file"
                  accept=".srt,.vtt,.mp4,.webm"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const fd = new FormData();
                    fd.set("file", file);
                    try {
                      await api("/lectures/" + id + "/attachment", {
                        method: "POST",
                        body: fd,
                      });
                      load();
                      notify("Файл принят. Лекция обрабатывается.");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                />
              </label>
            </div>
          )}
        </div>
      ) : (
        <div className="watch-grid">
          <div className="watch-main">
            <Player
              ref={player}
              lecture={lecture}
              start={start}
              onTime={setSeconds}
            />
            <div className="player-action-bar">
              <div>
                <button disabled={busy} onClick={bookmark} className={bookmarked ? "is-bookmarked" : ""}
                  aria-pressed={bookmarked} title={bookmarked ? "Удалить из закладок" : "Сохранить текущий момент"}>
                  <Bookmark size={17} fill={bookmarked ? "currentColor" : "none"} />{bookmarked ? "В закладках" : "В закладки"}
                </button>
                <button onClick={() => setNote(seconds)}>
                  <Pencil size={16} />
                  Заметка
                </button>
              </div>
            </div>
            <p className="lecture-description">{lecture.description}</p>
            <div className="content-tabs" role="tablist">
              {[
                ["outline", "Оглавление"],
                ["summary", "Конспект"],
                ["terms", "Термины"],
                ["notes", "Мои заметки"],
              ].map(([key, label]) => (
                <button
                  role="tab"
                  aria-selected={tab === key}
                  key={key}
                  onClick={() => setTab(key)}
                  className={tab === key ? "active" : ""}
                >
                  {label}
                  {key === "notes" && notes.length > 0 && (
                    <small>{notes.length}</small>
                  )}
                </button>
              ))}
            </div>
            <div className="lecture-content motion-panel" key={tab}>
              {tab === "outline" && (
                <div className="outline-list">
                  {lecture.outline?.map((o, i) => (
                    <button
                      key={i}
                      className={o.level === 2 ? "subsection" : ""}
                      onClick={() => seek(o.start_seconds)}
                    >
                      <span className="outline-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>{o.title}</span>
                      <span className="outline-time">
                        {timecode(o.start_seconds)}
                        <Play size={12} />
                      </span>
                    </button>
                  ))}
                  <p className="muted small-text">
                    Оглавление построено по фрагментам транскрипта.
                  </p>
                </div>
              )}
              {tab === "summary" && (
                <>
                  <span className="mode-note">
                    <FileText size={16} />
                    {lecture.summary_mode === "llm"
                      ? "Конспект с помощью языковой модели"
                      : lecture.summary_mode === "extractive_provider_error"
                        ? "Языковая модель недоступна: ключевые выдержки из транскрипта"
                        : "Ключевые выдержки из транскрипта"}
                  </span>
                  <div className="summary-text">{lecture.summary}</div>
                </>
              )}
              {tab === "terms" && (
                <>
                  <p className="muted">
                    Нажмите на время, чтобы перейти к видео.
                  </p>
                  <div className="terms-list">
                    {terms.map((term) => (
                      <div key={term}>
                        <strong>{term}</strong>
                        <div>
                          {lecture.terms
                            ?.filter((t) => t.term === term)
                            .map((t, i) => (
                              <button
                                key={i}
                                className="time-chip"
                                onClick={() => seek(t.start_seconds)}
                              >
                                {timecode(t.start_seconds)}
                                <Play size={11} />
                              </button>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {tab === "notes" &&
                (notes.length ? (
                  <div className="lecture-notes">
                    {notes.map((n) => (
                      <div key={n.id}>
                        <button
                          className="time-chip"
                          onClick={() => seek(n.seconds)}
                        >
                          {timecode(n.seconds)}
                        </button>
                        <p>{n.text}</p>
                        <a href="#/library">
                          Изменить в библиотеке
                          <ArrowUpRight size={13} />
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="Место для ваших мыслей"
                    text="Нажмите «Заметка» под плеером. Мы привяжем её к текущей секунде видео."
                  />
                ))}
            </div>
          </div>
          <aside className="watch-aside">
            <section className="transcript-panel">
              <div className="panel-heading">
                <h2>
                  <FileText size={18} />
                  Транскрипт
                </h2>
                <span>{lecture.segments?.length} фрагм.</span>
              </div>
              <label className="transcript-search">
                <Search size={15} />
                <input
                  aria-label="Найти слово в транскрипте"
                  placeholder="Найти слово в тексте"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </label>
              <div className="transcript" ref={transcript}>
                {segments.map((s) => (
                  <button
                    key={s.id}
                    data-active={following && active === s.id}
                    onClick={() => seek(s.start_seconds)}
                  >
                    <span>{timecode(s.start_seconds)}</span>
                    <TranscriptText segment={s} seconds={following && active === s.id ? seconds : undefined} />
                  </button>
                ))}
                {!segments.length && <p className="muted">Совпадений нет.</p>}
              </div>
              <label className="follow-toggle">
                <input
                  type="checkbox"
                  checked={following}
                  onChange={(e) => setFollowing(e.target.checked)}
                />
                Следовать за видео
              </label>
            </section>

          </aside>
        </div>
      )}
      {note !== null && (
        <NoteModal
          lectureId={id}
          seconds={note}
          onClose={() => setNote(null)}
          notify={notify}
        />
      )}
      {editing && (
        <EditLectureModal
          lecture={lecture}
          onClose={() => setEditing(false)}
          onSaved={() => {
            load();
            refresh();
          }}
          notify={notify}
        />
      )}
      {confirmDelete && (
        <Modal title="Удалить лекцию?" onClose={() => setConfirmDelete(false)}>
          <p>
            Видео, транскрипт, индекс, закладки и заметки к этой лекции будут
            удалены.
          </p>
          <div className="button-row">
            <button
              className="button outline"
              onClick={() => setConfirmDelete(false)}
            >
              Отмена
            </button>
            <button
              className="button primary"
              onClick={async () => {
                try {
                  await api("/lectures/" + id, { method: "DELETE" });
                  refresh();
                  go("/");
                  notify("Лекция удалена");
                } catch (e) {
                  setConfirmDelete(false);
                  setError((e as Error).message);
                }
              }}
            >
              Удалить лекцию
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function NoteModal({
  lectureId,
  seconds,
  onClose,
  notify,
  existing,
}: {
  lectureId: string;
  seconds: number;
  onClose: () => void;
  notify: (m: string) => void;
  existing?: SavedMoment;
}) {
  const [text, setText] = useState(existing?.text || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={existing ? "Редактировать заметку" : "Сохранить мысль"}
      onClose={onClose}
    >
      <span className="mode-note">
        <Clock3 size={16} />
        Момент {timecode(seconds)}
      </span>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api(existing ? "/notes/" + existing.id : "/notes", {
              method: existing ? "PATCH" : "POST",
              body: json(
                existing ? { text } : { lecture_id: lectureId, seconds, text },
              ),
            });
            notify("Заметка сохранена в библиотеке");
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Ваша заметка
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Что вы хотите запомнить?"
            required
            maxLength={10000}
            rows={6}
          />
        </label>
        <ErrorBox message={error} />
        <button className="button primary full" disabled={busy}>
          {busy ? (
            <Loader2 size={18} className="spin" />
          ) : (
            <>
              Сохранить заметку
              <Check size={17} />
            </>
          )}
        </button>
      </form>
    </Modal>
  );
}
function SuggestModal({
  onClose,
  notify,
}: {
  onClose: () => void;
  notify: (m: string) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState<"link" | "upload">("link"),
    [cover, setCover] = useState("math"),
    [coverBusy, setCoverBusy] = useState(false);
  return (
    <Modal title="Поделитесь хорошей лекцией" onClose={onClose} wide>
      <p className="muted">
        Предложите ссылку или загрузите своё видео. После проверки администратором лекция появится в каталоге, а статус — в вашей библиотеке.
      </p>
      <div className="content-tabs suggestion-mode">
        <button type="button" disabled={busy} className={mode === "link" ? "active" : ""} onClick={() => { setMode("link"); setError(""); }}><Link2 size={16} />Ссылка</button>
        <button type="button" disabled={busy} className={mode === "upload" ? "active" : ""} onClick={() => { setMode("upload"); setError(""); }}><Upload size={16} />Своё видео</button>
      </div>
      <form
        key={mode}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const fd = new FormData(e.currentTarget);
          const subtitles = fd.get("subtitles");
          if (subtitles instanceof File && !subtitles.name) fd.delete("subtitles");
          if (mode === "upload") fd.set("cover", cover);
          setError("");
          try {
            await api(mode === "upload" ? "/suggestions/upload" : "/suggestions", {
              method: "POST",
              body: mode === "upload" ? fd : json(Object.fromEntries(fd)),
            });
            notify("Спасибо! Видео отправлено на рассмотрение");
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {mode === "link" ? <label>
          Ссылка на видео
          <input
            name="url"
            type="url"
            placeholder="https://rutube.ru/video/…"
            required
            maxLength={2048}
          />
        </label> : <>
          <label>Название видео<input name="title" required minLength={2} maxLength={200} placeholder="О чём ваша лекция?" disabled={busy} /></label>
          <label className="suggestion-file">Видеофайл<input name="video" type="file" accept=".mp4,.webm,video/mp4,video/webm" required disabled={busy} /><small>MP4 или WebM · до 500 МБ</small></label>
          <label>Субтитры, если есть<input name="subtitles" type="file" accept=".srt,.vtt" disabled={busy}
            onChange={e => { if (!e.target.files?.length) e.target.removeAttribute("name"); else e.target.name = "subtitles"; }} /><small>SRT или VTT · необязательно</small></label>
        </>}
        <label>
          Чем интересна эта лекция?
          <textarea
            name="comment"
            placeholder="Расскажите о теме или авторе"
            maxLength={2000}
            rows={4}
          />
        </label>
        {mode === "upload" && <CoverPicker value={cover} onChange={setCover} disabled={busy} onBusyChange={setCoverBusy} />}
        <ErrorBox message={error} />
        <button className="button primary full" disabled={busy || (mode === "upload" && coverBusy)}>
          {busy ? (
            <Loader2 className="spin" size={18} />
          ) : (
            <>
              Отправить предложение
              <Send size={17} />
            </>
          )}
        </button>
      </form>
    </Modal>
  );
}

function LibraryPage({ notify }: { notify: (m: string) => void }) {
  const [data, setData] = useState<Library>(emptyLibrary),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState("bookmarks"),
    [error, setError] = useState(""),
    [edit, setEdit] = useState<SavedMoment | null>(null),
    [suggest, setSuggest] = useState(false),
    [deleting, setDeleting] = useState<SavedMoment | null>(null),
    [deletingSuggestion, setDeletingSuggestion] = useState<Suggestion | null>(null);
  function load() {
    api<Library>("/library")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
    window.addEventListener('lectory-library-changed', load);
    return () => window.removeEventListener('lectory-library-changed', load);
  }, []);
  const items = tab === "notes" ? data.notes : data.bookmarks;
  return (
    <>
      <div className="page-title">
        <div>
          <h1>
            Сохраните главное<span className="title-dot">.</span>
          </h1>
          <p>Мысли, к которым стоит вернуться.</p>
        </div>
        <button className="button outline" onClick={() => setSuggest(true)}>
          <Plus size={17} />
          Предложить видео
        </button>
      </div>
      <section className="library-hero">
        <div>
          <span className="section-label">МОЯ БИБЛИОТЕКА</span>
          <h2>
            Знания складываются
            <br />
            из важных моментов.
          </h2>
          <div className="library-stats">
            <div>
              <strong>{data.bookmarks.length}</strong>
              <span>
                {plural(data.bookmarks.length, [
                  "закладка",
                  "закладки",
                  "закладок",
                ])}
              </span>
            </div>
            <div>
              <strong>{data.notes.length}</strong>
              <span>
                {plural(data.notes.length, ["заметка", "заметки", "заметок"])}
              </span>
            </div>
            <div>
              <strong>{data.suggestions.length}</strong>
              <span>
                {plural(data.suggestions.length, [
                  "предложение",
                  "предложения",
                  "предложений",
                ])}
              </span>
            </div>
          </div>
        </div>
        <ThemedArt name="library-guide" alt="Читательница собирает любимые лекции и заметки" />
      </section>
      <div className="content-tabs library-tabs">
        {[
          ["bookmarks", "Закладки", Bookmark],
          ["notes", "Заметки", FileText],
          ["suggestions", "Предложения", Link2],
        ].map(([key, label, Icon]) => (
          <button
            key={key as string}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key as string)}
          >
            {typeof Icon !== "string" && <Icon size={17} />} {label as string}
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      {loading ? (
        <Spinner />
      ) : tab === "suggestions" ? (
        data.suggestions.length ? (
          <div className="suggestion-list">
            {data.suggestions.map((s) => (
              <SuggestionRow key={s.id} suggestion={s}>
                <button className="button small outline suggestion-delete" onClick={() => setDeletingSuggestion(s)}><Trash2 size={14} />Удалить заявку</button>
              </SuggestionRow>
            ))}
          </div>
        ) : (
          <Empty
            title="Хорошими лекциями стоит делиться"
            text="Предложите видео, чтобы помочь расширить библиотеку."
          />
        )
      ) : items.length ? (
        <div className="saved-list">
          {items.map((item) => (
            <article className="saved-item" key={item.id}>
              <a href={`#/lecture/${item.lecture_id}?t=${item.seconds}`}>
                <img src={coverImage(item.cover)} alt="" />
              </a>
              <div>
                <a
                  className="saved-title"
                  href={`#/lecture/${item.lecture_id}?t=${item.seconds}`}
                >
                  {item.lecture_title}
                </a>
                <a
                  className="time-chip"
                  href={`#/lecture/${item.lecture_id}?t=${item.seconds}`}
                >
                  <Play size={11} />
                  {timecode(item.seconds)}
                </a>
                <p>{item.text || item.title || "Важный момент"}</p>
              </div>
              <div className="saved-actions">
                {tab === "notes" && (
                  <button
                    className="icon-button"
                    aria-label="Изменить заметку"
                    onClick={() => setEdit(item)}
                  >
                    <Pencil size={16} />
                  </button>
                )}
                <button
                  className="icon-button library-delete"
                  aria-label={
                    tab === "notes" ? "Удалить заметку" : "Удалить закладку"
                  }
                  onClick={() => setDeleting(item)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={
            tab === "notes"
              ? "Здесь будут ваши мысли"
              : "Здесь будут важные моменты"
          }
          text={
            tab === "notes"
              ? "Откройте лекцию и добавьте заметку к нужной секунде."
              : "Сохраните момент с помощью кнопки «В закладки» под видео."
          }
        >
          <a className="button primary" href="#/">
            Открыть каталог
            <ArrowRight size={17} />
          </a>
        </Empty>
      )}
      {edit && (
        <NoteModal
          existing={edit}
          lectureId={edit.lecture_id}
          seconds={edit.seconds}
          onClose={() => {
            setEdit(null);
            load();
          }}
          notify={notify}
        />
      )}
      {suggest && (
        <SuggestModal
          onClose={() => {
            setSuggest(false);
            load();
          }}
          notify={notify}
        />
      )}
      {deletingSuggestion && <DeleteSuggestionModal suggestion={deletingSuggestion} onClose={() => setDeletingSuggestion(null)} onDeleted={() => { setDeletingSuggestion(null); load(); notify("Заявка удалена"); }} />}
      {deleting && (
        <Modal
          title={tab === "notes" ? "Удалить заметку?" : "Удалить закладку?"}
          onClose={() => setDeleting(null)}
        >
          <p>Этот момент исчезнет из вашей библиотеки.</p>
          <div className="button-row">
            <button
              className="button outline"
              onClick={() => setDeleting(null)}
            >
              Отмена
            </button>
            <button
              className="button primary"
              onClick={async () => {
                try {
                  await api("/" + tab + "/" + deleting.id, {
                    method: "DELETE",
                  });
                  setDeleting(null);
                  load();
                  notify("Удалено из библиотеки");
                } catch (e) {
                  setDeleting(null);
                  setError((e as Error).message);
                }
              }}
            >
              Удалить
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function UploadPage({
  lectures,
  user,
  notify,
  refresh,
}: {
  lectures: Lecture[];
  user: User;
  notify: (m: string) => void;
  refresh: () => void;
}) {
  const [mode, setMode] = useState("upload"),
    [file, setFile] = useState<File | null>(null),
    [subtitles, setSubtitles] = useState<File | null>(null),
    [cover, setCover] = useState("math"),
    [coverBusy, setCoverBusy] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const mine = lectures.filter((l) => l.owner_id === user.id);
  return (
    <>
      <div className="page-title">
        <div>
          <h1>
            Мои лекции<span className="title-dot">.</span>
          </h1>
          <p>Добавьте видео. Мы поможем другим найти в нём главное.</p>
        </div>
      </div>
      <div className="upload-layout">
        <section className="form-panel">
          <h2>Новая лекция</h2>
          <div className="segmented">
            <button
              className={mode === "upload" ? "active" : ""}
              onClick={() => {
                setMode("upload");
                setCover(previous => previous === "source" ? "math" : previous);
                setError("");
              }}
            >
              <Upload size={17} />
              Загрузить файл
            </button>
            <button
              className={mode === "import" ? "active" : ""}
              onClick={() => {
                setMode("import");
                setError("");
              }}
            >
              <Link2 size={17} />
              По ссылке
            </button>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              const fd = new FormData(e.currentTarget);
              try {
                let response: { id: string };
                if (mode === "upload") {
                  if (!file) throw new Error("Выберите видео MP4 или WebM.");
                  fd.set("video", file);
                  if (subtitles) fd.set("subtitles", subtitles);
                  fd.set("cover", cover);
                  response = await api("/lectures/upload", {
                    method: "POST",
                    body: fd,
                  });
                } else
                  response = await api("/lectures/import", {
                    method: "POST",
                    body: json({ ...Object.fromEntries(fd), cover }),
                  });
                refresh();
                notify("Лекция добавлена. Обработка идёт в фоне.");
                go("/lecture/" + response.id);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {mode === "upload" ? (
              <label
                className={"dropzone " + (file ? "has-file" : "")}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) setFile(f);
                }}
              >
                <span className="drop-icon">
                  {file ? <CheckCircle2 size={26} /> : <Upload size={26} />}
                </span>
                <strong>{file ? file.name : "Перетащите видео сюда"}</strong>
                <span>
                  {file
                    ? `${(file.size / 1024 / 1024).toFixed(1)} МБ · нажмите, чтобы заменить`
                    : "или нажмите, чтобы выбрать файл"}
                </span>
                <small>MP4 / WebM · до 500 МБ по умолчанию</small>
                <input
                  type="file"
                  accept=".mp4,.webm"
                  aria-label="Файл видеолекции"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
            ) : (
              <label>
                Ссылка на Vimeo, VK Видео или Rutube
                <input
                  type="url"
                  name="url"
                  required
                  placeholder="https://rutube.ru/video/…"
                  maxLength={2048}
                />
                <small>
                  Импортируем доступные субтитры или распознаем аудио.
                </small>
              </label>
            )}
            <label>
              Название лекции
              <input
                name="title"
                required
                minLength={2}
                maxLength={200}
                placeholder="Например, нейросети: от данных к решению"
              />
            </label>
            <label>
              Описание
              <textarea
                name="description"
                maxLength={5000}
                rows={3}
                placeholder="О чём эта лекция и кому будет полезна"
              />
            </label>
            <label>
              Курс
              <CourseInput courses={[...new Set(lectures.map(l => l.course).filter((c): c is string => !!c))]} />
            </label>
            <CoverPicker value={cover} onChange={setCover} disabled={busy} onBusyChange={setCoverBusy} sourceKey={mode === "import" ? "source" : undefined} />
            {mode === "upload" && (
              <label className="subtitle-upload">
                <FileText size={18} />
                <span>
                  {subtitles
                    ? subtitles.name
                    : "Есть субтитры? Приложите SRT или VTT"}
                  <small>Необязательно.</small>
                </span>
                <Plus size={17} />
                <input
                  type="file"
                  accept=".srt,.vtt"
                  onChange={(e) => setSubtitles(e.target.files?.[0] || null)}
                />
              </label>
            )}
            <ErrorBox message={error} />
            <button className="button primary full" disabled={busy || coverBusy}>
              {busy ? (
                <>
                  <Loader2 className="spin" size={18} />
                  Передаём файл…
                </>
              ) : (
                <>
                  Добавить и обработать
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        </section>
        <aside className="upload-aside">
          <h2>
            Ваши материалы <span className="count">{mine.length}</span>
          </h2>
          {mine.length ? (
            mine.map((l) => (
              <a className="mini-lecture" href={"#/lecture/" + l.id} key={l.id}>
                <img src={coverImage(l.cover)} alt="" />
                <div>
                  <strong>{l.title}</strong>
                  <span>
                    <span className={"status-dot " + l.status} />
                    {statusLabel[l.status]}
                  </span>
                </div>
                <ChevronRight size={16} />
              </a>
            ))
          ) : (
            <p className="muted">Пока нет лекций. Начните с первого видео.</p>
          )}
          <p className="muted">Обработка продолжится, если закрыть страницу.</p>
        </aside>
      </div>
    </>
  );
}

function EditLectureModal({
  lecture,
  onClose,
  onSaved,
  notify,
}: {
  lecture: Lecture;
  onClose: () => void;
  onSaved: () => void;
  notify: (m: string) => void;
}) {
  const [error, setError] = useState(""),
    [cover, setCover] = useState(lecture.cover),
    [coverBusy, setCoverBusy] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Настройки лекции" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const fd = new FormData(e.currentTarget);
          try {
            await api("/lectures/" + lecture.id, {
              method: "PATCH",
              body: json({ ...Object.fromEntries(fd), cover }),
            });
            onSaved();
            notify("Изменения сохранены");
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Название
          <input
            name="title"
            defaultValue={lecture.title}
            required
            minLength={2}
            maxLength={200}
          />
        </label>
        <label>
          Описание
          <textarea
            name="description"
            defaultValue={lecture.description}
            maxLength={5000}
            rows={5}
          />
        </label>
        <label>
          Курс
          <input
            name="course"
            defaultValue={lecture.course || ""}
            maxLength={160}
          />
        </label>
        <ErrorBox message={error} />
        <CoverPicker value={cover} onChange={setCover} disabled={busy} onBusyChange={setCoverBusy} sourceKey={sourceCoverFromUrl(lecture.source_url)} />
        <button className="button primary full" disabled={busy || coverBusy}>
          Сохранить изменения
          <Check size={17} />
        </button>
      </form>
    </Modal>
  );
}

function SuggestionRow({
  suggestion: s,
  children,
}: {
  suggestion: Suggestion;
  children?: ReactNode;
}) {
  return (
    <article className="suggestion-row">
      <img className="suggestion-cover" src={coverImage(s.cover || "math")} alt="Предложенная обложка" loading="lazy" />
      <div>
        <div className="suggestion-top">
          <a href={s.media_path ? `/api/suggestions/${s.id}/video` : s.url} target="_blank" rel="noreferrer">
            {s.media_path ? (s.title || "Загруженное видео") : s.url}
            <ExternalLink size={13} />
          </a>
          <span className={"badge " + s.status}>{statusLabel[s.status]}</span>
        </div>
        {s.author && (
          <span className="muted small-text">Предложил(а): {s.author}</span>
        )}
        {s.comment && <p>{s.comment}</p>}
        {s.reason && <p className="rejection-reason">Причина: {s.reason}</p>}
        {s.lecture_id && (
          <a className="text-button" href={"#/lecture/" + s.lecture_id}>
            Открыть лекцию
            <ArrowUpRight size={14} />
          </a>
        )}
        {children}
      </div>
    </article>
  );
}

function DeleteSuggestionModal({ suggestion, onClose, onDeleted }: { suggestion: Suggestion; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Modal title="Удалить заявку?" onClose={onClose}>
    <p>{suggestion.lecture_id ? "Заявка исчезнет, а опубликованная лекция останется в каталоге." : "Заявка и прикреплённые к ней файлы будут удалены."}</p>
    <ErrorBox message={error} />
    <div className="button-row"><button className="button outline" onClick={onClose} disabled={busy}>Отмена</button>
      <button className="button primary" disabled={busy} onClick={async () => { setBusy(true); try { await api("/suggestions/" + suggestion.id, { method: "DELETE" }); onDeleted(); } catch (e) { setError((e as Error).message); setBusy(false); } }}>Удалить</button></div>
  </Modal>;
}

type ReviewFields = { title: string; description: string; course: string; cover: string };

function ReviewSuggestionModal({ suggestion, lectures, busy, error, onClose, onApprove }: {
  suggestion: Suggestion; lectures: Lecture[]; busy: boolean; error: string; onClose: () => void; onApprove: (fields: ReviewFields) => Promise<void>;
}) {
  const [cover, setCover] = useState(suggestion.cover || "math");
  const [coverBusy, setCoverBusy] = useState(false);
  return <Modal title="Подготовить лекцию к публикации" onClose={onClose} wide>
    <p className="muted">Проверьте видео и настройте карточку. После одобрения начнётся обработка.</p>
    <a className="text-button review-source" href={suggestion.media_path ? `/api/suggestions/${suggestion.id}/video` : suggestion.url} target="_blank" rel="noreferrer"><Play size={16} />Посмотреть предложенное видео<ExternalLink size={14} /></a>
    <form onSubmit={async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      await onApprove({ title: String(fd.get("title") || ""), description: String(fd.get("description") || ""), course: String(fd.get("course") || ""), cover });
    }}>
      <label>Название лекции<input name="title" defaultValue={suggestion.title || "Лекция по предложению зрителя"} required minLength={2} maxLength={200} disabled={busy} /></label>
      <label>Описание<textarea name="description" defaultValue={suggestion.comment || ""} rows={3} maxLength={5000} disabled={busy} /></label>
      <label>Курс<CourseInput courses={[...new Set(lectures.map(l => l.course).filter((c): c is string => !!c))]} /></label>
      <CoverPicker value={cover} onChange={setCover} disabled={busy} onBusyChange={setCoverBusy} sourceKey={sourceCoverFromUrl(suggestion.url)} />
      <ErrorBox message={error} />
      <button type="submit" className="button primary full" disabled={busy || coverBusy}>{busy ? <Loader2 size={17} className="spin" /> : <Check size={17} />}Одобрить и начать обработку</button>
    </form>
  </Modal>;
}

function AdminPage({
  user,
  lectures,
  notify,
  onUserChange,
}: {
  user: User;
  lectures: Lecture[];
  notify: (m: string) => void;
  onUserChange: (u: User) => void;
}) {
  const [data, setData] = useState<{
      users: User[];
      suggestions: Suggestion[];
    } | null>(null),
    [tab, setTab] = useState("suggestions"),
    [error, setError] = useState(""),
    [reject, setReject] = useState<Suggestion | null>(null),
    [approve, setApprove] = useState<Suggestion | null>(null),
    [deletingSuggestion, setDeletingSuggestion] = useState<Suggestion | null>(null),
    [busy, setBusy] = useState(""),
    [userQuery, setUserQuery] = useState(""),
    [lectureQuery, setLectureQuery] = useState("");
  function load() {
    api<{ users: User[]; suggestions: Suggestion[] }>("/admin")
      .then(setData)
      .catch((e) => setError(e.message));
  }
  useEffect(load, [user]);
  async function review(id: string, status: string, reason = "", fields?: ReviewFields) {
    setBusy(id);
    try {
      await api("/admin/suggestions/" + id, {
        method: "PATCH",
        body: json({ status, reason, ...fields }),
      });
      load();
      setReject(null);
      notify(
        status === "approved"
          ? "Предложение одобрено. Видео добавлено в очередь."
          : "Статус предложения обновлён",
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="page-title">
        <div>
          <h1>
            Администрирование<span className="title-dot">.</span>
          </h1>
          <p>Управляйте доступом и помогайте библиотеке расти.</p>
        </div>
        <span className="admin-badge">
          <Shield size={18} />
          Администратор
        </span>
      </div>
      <div className="admin-stats">
        <div>
          <span>Пользователей</span>
          <strong>{data?.users.length || 0}</strong>
        </div>
        <div>
          <span>Всего лекций</span>
          <strong>{lectures.length}</strong>
        </div>
        <div>
          <span>Ожидают рассмотрения</span>
          <strong>
            {data?.suggestions.filter((s) => s.status === "pending").length ||
              0}
          </strong>
        </div>
        <div>
          <span>Требуют внимания</span>
          <strong>
            {
              lectures.filter((l) =>
                ["failed", "needs_transcript"].includes(l.status),
              ).length
            }
          </strong>
        </div>
      </div>
      <div className="content-tabs">
        <button
          className={tab === "suggestions" ? "active" : ""}
          onClick={() => setTab("suggestions")}
        >
          Предложения видео
        </button>
        <button
          className={tab === "users" ? "active" : ""}
          onClick={() => setTab("users")}
        >
          Пользователи и роли
        </button>
        <button
          className={tab === "lectures" ? "active" : ""}
          onClick={() => setTab("lectures")}
        >
          Все лекции
        </button>
      </div>
      <ErrorBox message={error} />
      {!data ? (
        <Spinner />
      ) : tab === "suggestions" ? (
        <div className="suggestion-list">
          {data.suggestions.length ? (
            data.suggestions.map((s) => (
              <SuggestionRow key={s.id} suggestion={s}>
                <div className="button-row">
                  <button className="button small outline suggestion-delete" disabled={busy === s.id} onClick={() => setDeletingSuggestion(s)}><Trash2 size={14} />Удалить заявку</button>
                  {s.status !== "approved" && (
                    <button
                      className="button small primary"
                      disabled={busy === s.id}
                      onClick={() => { setError(""); setApprove(s); }}
                    >
                      <Check size={15} />
                      Настроить и одобрить
                    </button>
                  )}
                  {s.status !== "rejected" && (
                    <button
                      className="button small outline"
                      disabled={busy === s.id}
                      onClick={() => setReject(s)}
                    >
                      Отклонить
                    </button>
                  )}
                  {s.status !== "pending" && (
                    <button
                      className="text-button"
                      disabled={busy === s.id}
                      onClick={() => void review(s.id, "pending")}
                    >
                      Вернуть в очередь
                    </button>
                  )}
                </div>
              </SuggestionRow>
            ))
          ) : (
            <Empty
              title="Все предложения рассмотрены"
              text="Здесь появятся видео, которыми захотят поделиться зрители."
            />
          )}
        </div>
      ) : tab === "users" ? (
        <div>
        <label className="inline-search admin-search"><Search size={18} /><input value={userQuery} onChange={e => setUserQuery(e.target.value)}
          placeholder="Имя, почта или роль" aria-label="Поиск пользователей" /></label>
        <div className="table-scroll">
          <table className="users-table">
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Электронная почта</th>
                <th>Роль</th>
              </tr>
            </thead>
            <tbody>
              {data.users.filter(u => `${u.name} ${u.email} ${roleLabel[u.role]}`.toLocaleLowerCase().includes(userQuery.toLocaleLowerCase().trim())).map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="user-cell"><Avatar n={u.avatar} src={u.avatar_url} className="author-avatar" />
                    <strong>{u.name}</strong>
                    {u.id === user.id && <small>Это вы</small>}</div>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <Select
                      label={"Роль " + u.name}
                      value={u.role}
                      options={Object.entries(roleLabel).map(([value, label]) => ({ value, label }))}
                      disabled={busy === u.id}
                      onChange={async (value) => {
                        const role = value as User["role"];
                        setBusy(u.id);
                        try {
                          await api("/admin/users/" + u.id, {
                            method: "PATCH",
                            body: json({ role }),
                          });
                          load();
                          if (u.id === user.id) onUserChange({ ...user, role });
                          notify("Роль обновлена");
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy("");
                        }
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.users.some(u => `${u.name} ${u.email} ${roleLabel[u.role]}`.toLocaleLowerCase().includes(userQuery.toLocaleLowerCase().trim())) && <p className="muted admin-empty">Пользователи не найдены.</p>}
        </div>
        </div>
      ) : (
        <div>
        <label className="inline-search admin-search"><Search size={18} /><input value={lectureQuery} onChange={e => setLectureQuery(e.target.value)}
          placeholder="Название, автор, курс или статус" aria-label="Поиск всех лекций" /></label>
        <div className="admin-lecture-list">
          {lectures.filter(l => `${l.title} ${l.author} ${l.course || ""} ${statusLabel[l.status]}`.toLocaleLowerCase().includes(lectureQuery.toLocaleLowerCase().trim())).map((l) => (
            <a className="mini-lecture" href={"#/lecture/" + l.id} key={l.id}>
              <img src={coverImage(l.cover)} alt="" />
              <div>
                <strong>{l.title}</strong>
                <span>
                  {l.author} · {statusLabel[l.status]}
                </span>
                {l.error && <small className="danger">{l.error}</small>}
              </div>
              <ChevronRight size={17} />
            </a>
          ))}
          {!lectures.some(l => `${l.title} ${l.author} ${l.course || ""} ${statusLabel[l.status]}`.toLocaleLowerCase().includes(lectureQuery.toLocaleLowerCase().trim())) && <p className="muted admin-empty">Лекции не найдены.</p>}
        </div>
        </div>
      )}
      {deletingSuggestion && <DeleteSuggestionModal suggestion={deletingSuggestion} onClose={() => setDeletingSuggestion(null)} onDeleted={() => { setDeletingSuggestion(null); load(); notify("Заявка удалена"); }} />}
      {approve && <ReviewSuggestionModal key={approve.id} suggestion={approve} lectures={lectures} busy={busy === approve.id} error={error}
        onClose={() => setApprove(null)} onApprove={async fields => { if (await review(approve.id, "approved", "", fields)) setApprove(null); }} />}
      {reject && (
        <Modal
          title="Почему видео не подходит?"
          onClose={() => setReject(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              void review(reject.id, "rejected", fd.get("reason") as string);
            }}
          >
            <label>
              Причина отклонения
              <textarea
                name="reason"
                required
                rows={4}
                maxLength={1000}
                placeholder="Автор предложения увидит эту причину"
              />
            </label>
            <button
              className="button primary full"
              disabled={busy === reject.id}
            >
              Отклонить предложение
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
