import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, ArrowUpRight, Bookmark, BookOpen, Check, ChevronLeft, FileText, ImagePlus, LayoutGrid, Loader2, Mic, Play, Plus, Search, Square, X } from "lucide-react";
import { api, coverImage, duration, timecode } from "../../api";
import "./ask-bar-utils/ask-bar.css";

export type AskCitation = { lecture_id: string; title: string; start_seconds: number; end_seconds: number; text: string };
export type AskAction = { id: string; kind: string; label: string; lecture_title?: string; text?: string; completed?: boolean };
export type AskImage = { id: string; name: string; url: string };
export type AskLecture = { id: string; title: string; author?: string; course?: string | null; cover?: string; duration?: number };
export type AskMessage = { id: string; role: "user" | "assistant"; text: string; citations?: AskCitation[]; actions?: AskAction[]; pending?: boolean; images?: AskImage[]; lecture?: AskLecture | null };
type Speech = { start: () => void; stop: () => void; abort: () => void; lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
export type AskBarProps = {
  greeting: string; messages: AskMessage[]; busy: boolean; loading: boolean; error: string;
  onSend: (text: string, images: AskImage[], lecture?: AskLecture) => Promise<void>; onStop: () => void; onAction: (action: AskAction) => Promise<void>;
  onCitation: (citation: AskCitation) => void; actionBusy: string; placeholder?: string;
  currentLecture?: AskLecture;
};

function MessageText({ text }: { text: string }) {
  return <div className="askb__text">{text.split('\n').map((line, i) => <p key={i}>{line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={j}>{part.slice(2, -2)}</strong> : <span key={j}>{part}</span>)}</p>)}</div>;
}

export function AskBar({ greeting, messages, busy, loading, error, onSend, onStop, onAction, onCitation, actionBusy,
  currentLecture, placeholder = "Спросите о лекции или Лектории…" }: AskBarProps) {
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const [note, setNote] = useState("");
  const [listening, setListening] = useState(false);
  const [images, setImages] = useState<AskImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [choosingLecture, setChoosingLecture] = useState(false);
  const [lectures, setLectures] = useState<AskLecture[]>([]);
  const [lectureLoading, setLectureLoading] = useState(false);
  const [lectureQuery, setLectureQuery] = useState("");
  const [lectureCount, setLectureCount] = useState(12);
  const [selectedLecture, setSelectedLecture] = useState<AskLecture | undefined>(() => [...messages].reverse().find(message => message.role === 'user')?.lecture || undefined);
  const area = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const plus = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lectureSearch = useRef<HTMLInputElement>(null);
  const lecturesLoaded = useRef(0);
  const mounted = useRef(true);
  const speech = useRef<Speech | null>(null);
  const pinned = useRef(true);
  const menuId = useId();

  useLayoutEffect(() => {
    const input = area.current;
    if (!input) return;
    input.style.height = "24px";
    input.style.height = `${Math.min(192, Math.max(24, input.scrollHeight))}px`;
  }, [text]);
  useEffect(() => { if (pinned.current && log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, busy]);
  useEffect(() => { mounted.current = true; area.current?.focus(); return () => { mounted.current = false; speech.current?.abort(); }; }, []);
  useEffect(() => { if (choosingLecture) lectureSearch.current?.focus(); }, [choosingLecture]);
  useEffect(() => { setLectureCount(12); }, [lectureQuery]);
  useEffect(() => {
    if (!menu) return;
    if (!choosingLecture) menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const away = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node) && !plus.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [menu]);
  useEffect(() => { if (!note) return; const timer = setTimeout(() => setNote(""), 4000); return () => clearTimeout(timer); }, [note]);
  async function send() {
    if ((!text.trim() && !images.length) || busy || loading || uploading) return;
    const value = text.trim() || 'Объясни изображение в контексте лекций и Лектория.';
    const attached = images;
    speech.current?.stop(); setText(""); setImages([]); setMenu(false); pinned.current = true;
    await onSend(value, attached, selectedLecture); area.current?.focus();
  }
  async function attachFiles(files: FileList | null) {
    if (!files?.length || uploading || busy) return;
    const selected = [...files].slice(0, Math.max(0, 3 - images.length));
    if (selected.length < files.length) setNote('Можно прикрепить до трёх изображений к сообщению.');
    setUploading(true);
    try {
      for (const file of selected) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
          setNote('Выберите JPG, PNG или WebP размером до 5 МБ.'); continue;
        }
        const body = new FormData(); body.set('file', file);
        const image = await api<AskImage>('/chat/images', { method: 'POST', body });
        if (!mounted.current) return;
        setImages(previous => [...previous, image].slice(0, 3));
      }
    } catch (e) { if (mounted.current) setNote((e as Error).message); }
    finally { if (mounted.current) { setUploading(false); area.current?.focus(); } }
  }
  async function chooseLecture() {
    setChoosingLecture(true); setLectureQuery(''); setLectureCount(12);
    if (Date.now() - lecturesLoaded.current < 60_000) return;
    setLectureLoading(true);
    try {
      const items = await api<AskLecture[]>('/lectures');
      if (mounted.current) { setLectures(items); lecturesLoaded.current = Date.now(); }
    } catch (e) { if (mounted.current) setNote((e as Error).message); }
    finally { if (mounted.current) setLectureLoading(false); }
  }
  function selectLecture(lecture?: AskLecture) { setSelectedLecture(lecture); setMenu(false); setChoosingLecture(false); area.current?.focus(); }
  function listen() {
    if (listening) { speech.current?.stop(); return; }
    const w = window as unknown as { SpeechRecognition?: new () => Speech; webkitSpeechRecognition?: new () => Speech };
    const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Recognition) { setNote("Голосовой ввод недоступен в этом браузере. Напишите вопрос текстом."); return; }
    const recognition = new Recognition(); recognition.lang = 'ru-RU'; recognition.interimResults = true; recognition.continuous = false;
    const before = text.trim() ? text.trimEnd() + ' ' : '';
    recognition.onresult = e => setText(before + Array.from(e.results).map(result => result[0].transcript).join(''));
    recognition.onend = () => { setListening(false); area.current?.focus(); };
    recognition.onerror = () => { setListening(false); setNote("Не удалось распознать речь. Попробуйте текстовый ввод."); };
    speech.current = recognition;
    try { recognition.start(); setListening(true); } catch { setNote("Микрофон сейчас недоступен."); }
  }
  function menuKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target instanceof HTMLInputElement && e.key !== 'Escape') return;
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(index + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMenu(false); plus.current?.focus(); }
  }
  const filteredLectures = lectures.filter(lecture => `${lecture.title} ${lecture.author || ''} ${lecture.course || ''}`.toLocaleLowerCase().includes(lectureQuery.trim().toLocaleLowerCase()));
  const openedLecture = lectures.find(lecture => lecture.id === currentLecture?.id) || currentLecture;
  const listLectures = filteredLectures.filter(lecture => !!lectureQuery.trim() || lecture.id !== openedLecture?.id);
  function lectureOption(lecture: AskLecture) {
    const selected = selectedLecture?.id === lecture.id;
    return <button type="button" className="askb__lecture-card" key={lecture.id} aria-pressed={selected} onClick={() => selectLecture(lecture)}>
      <span className="askb__lecture-cover"><BookOpen size={21} />{lecture.cover && <img src={coverImage(lecture.cover)} alt="" loading="lazy" onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />}</span>
      <span className="askb__lecture-details"><strong>{lecture.title}</strong><small>{[lecture.author, lecture.course].filter(Boolean).join(' · ') || 'Видеолекция'}{lecture.duration ? <span> · {duration(lecture.duration)}</span> : null}</small></span>
      <span className="askb__lecture-radio" aria-hidden="true">{selected && <Check size={12} strokeWidth={3} />}</span>
    </button>;
  }
  return <section className="askb" data-started={messages.length > 0 || undefined} aria-label="Чат с Лекторией">
    {loading ? <div className="askb__loading" role="status"><Loader2 className="spin" />Загружаем диалог…</div> : !messages.length ? <div className="askb__welcome">
      <img src="/art/lectory-ai-icon.webp" alt="" width={78} height={78} />
      <h2 className="askb__hello">{greeting.split(' ').map((word, i) => <span key={i} style={{ animationDelay: `${80 + i * 45}ms` }}>{word} </span>)}</h2>
    </div> : <div className="askb__log" ref={log} role="log" aria-label="Переписка" aria-live="polite"
      onScroll={e => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90; }}>
      {messages.map(message => <article key={message.id} className={message.role === 'user' ? 'askb__me' : 'askb__ai'}>
        {message.role === 'assistant' && <img className="askb__avatar" src="/art/lectory-ai-icon.webp" alt="Лектория" width={30} height={30} />}
        <div className="askb__message-body">
          {!!message.images?.length && <div className="askb__message-images">{message.images.map(image => <a key={image.id} href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={image.name} loading="lazy" /></a>)}</div>}
          {message.lecture && <div className="askb__message-lecture"><BookOpen size={12} />{message.lecture.title}</div>}
          {message.pending ? <span className="askb__dots" role="status" aria-label="Лектория думает"><i /><i /><i /></span> : <MessageText text={message.text} />}
          {!!message.citations?.length && <div className="askb__sources" aria-label="Источники в лекциях">{message.citations.map((citation, i) => <button key={`${citation.lecture_id}-${citation.start_seconds}-${i}`} type="button" onClick={() => onCitation(citation)} title={citation.text}>
            <Play size={11} /><span>{citation.title}</span><strong>{timecode(citation.start_seconds)}</strong></button>)}</div>}
          {!!message.actions?.length && <div className="askb__actions">{message.actions.map(action => <div key={action.id} className="askb__action-card">
            {action.text && <blockquote>{action.text}</blockquote>}
            {action.lecture_title && <small>{action.lecture_title}</small>}
            <button type="button" disabled={!!action.completed || actionBusy === action.id} onClick={() => void onAction(action)}>
              {action.completed ? <Check size={15} /> : actionBusy === action.id ? <Loader2 className="spin" size={15} /> : action.kind === 'note' ? <FileText size={15} /> : action.kind === 'bookmark' ? <Bookmark size={15} /> : <ArrowUpRight size={15} />}
              {action.completed ? 'Сохранено' : action.label}
            </button>
          </div>)}</div>}
        </div>
      </article>)}
    </div>}
    <div className="askb__dock">
      {error && <div className="askb__error" role="alert">{error}{messages.some(m => m.role === 'user') && <button type="button" onClick={() => { const previous = [...messages].reverse().find(m => m.role === 'user'); setText(previous?.text || ''); setImages(previous?.images || []); setSelectedLecture(previous?.lecture || undefined); area.current?.focus(); }}>Вернуть вопрос в поле</button>}</div>}
      {(images.length > 0 || selectedLecture || uploading) && <div className="askb__attachments">
        {selectedLecture && <div className="askb__lecture-chip"><BookOpen size={14} /><span>{selectedLecture.title}</span><button type="button" aria-label="Убрать лекцию" onClick={() => setSelectedLecture(undefined)}><X size={13} /></button></div>}
        {images.map(image => <div className="askb__image-chip" key={image.id}><img src={image.url} alt={image.name} /><button type="button" aria-label={'Убрать изображение ' + image.name} onClick={() => setImages(previous => previous.filter(item => item.id !== image.id))}><X size={13} /></button></div>)}
        {uploading && <span className="askb__uploading" role="status"><Loader2 size={16} className="spin" />Загружаем изображение…</span>}
      </div>}
      <form className="askb__bar" onSubmit={e => { e.preventDefault(); void send(); }}>
        <input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,image/webp" multiple onChange={e => { void attachFiles(e.target.files); e.target.value = ''; }} />
        <div className="askb__plus-wrap"><button ref={plus} type="button" className="askb__icon" aria-label="Прикрепить к сообщению" aria-haspopup="dialog" aria-expanded={menu} aria-controls={menu ? menuId : undefined} disabled={busy || uploading} onClick={() => { setChoosingLecture(false); setMenu(!menu); }}><Plus size={21} /></button>
          {menu && <div id={menuId} ref={menuRef} className={`askb__menu ${choosingLecture ? 'askb__menu--lectures' : ''}`} role="dialog" aria-label={choosingLecture ? 'Выбрать лекцию' : 'Прикрепить к сообщению'} onKeyDown={menuKey}>
            {!choosingLecture ? <>
              <button type="button" disabled={images.length >= 3} onClick={() => { setMenu(false); fileInput.current?.click(); }}><ImagePlus size={17} />Прикрепить изображение</button>
              <button type="button" onClick={() => void chooseLecture()}><BookOpen size={17} />Выбрать лекцию</button>
            </> : <>
              <div className="askb__picker-heading"><button type="button" aria-label="Назад к вложениям" onClick={() => setChoosingLecture(false)}><ChevronLeft size={17} /></button><strong>Выбрать лекцию</strong><span>{lectures.length}</span></div>
              <label className="askb__lecture-search"><Search size={14} /><input ref={lectureSearch} value={lectureQuery} onChange={e => setLectureQuery(e.target.value)} placeholder="Название, автор или курс" aria-label="Найти лекцию для чата" onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} /></label>
              <button type="button" className="askb__catalog-option" aria-pressed={!selectedLecture} onClick={() => selectLecture()}><span className="askb__catalog-icon"><LayoutGrid size={18} /></span><span><strong>Весь каталог</strong><small>Искать по всем лекциям</small></span><span className="askb__lecture-radio" aria-hidden="true">{!selectedLecture && <Check size={12} strokeWidth={3} />}</span></button>
              <div className="askb__lecture-options" aria-label="Доступные лекции">
                {!lectureQuery.trim() && openedLecture && <><div className="askb__picker-section">Открыта на сайте</div>{lectureOption(openedLecture)}</>}
                {lectureLoading && !lectures.length ? <p className="askb__picker-empty"><Loader2 size={19} className="spin" />Загружаем лекции…</p> : <>
                  {listLectures.length > 0 && <div className="askb__picker-section">{lectureQuery.trim() ? `Найдено: ${listLectures.length}` : 'Лекции'}</div>}
                  {listLectures.slice(0, lectureCount).map(lectureOption)}
                  {listLectures.length > lectureCount && <button type="button" className="askb__picker-more" onClick={() => setLectureCount(count => count + 12)}>Показать ещё<span>{listLectures.length - lectureCount}</span></button>}
                </>}
                {!lectureLoading && !filteredLectures.length && <p className="askb__picker-empty"><Search size={22} />Ничего не найдено<small>Попробуйте другое название или имя автора</small></p>}
              </div>
            </>}
          </div>}
        </div>
        <label className="askb__field"><span className="sr-only">Сообщение Лектории</span><textarea ref={area} autoFocus value={text} maxLength={3000} rows={1}
          placeholder={listening ? 'Слушаю…' : placeholder} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} /></label>
        {busy ? <button type="button" className="askb__send askb__stop" aria-label="Остановить ответ" onClick={onStop}><Square size={15} fill="currentColor" /></button>
          : text.trim() || images.length ? <button type="submit" className="askb__send" aria-label="Отправить сообщение" disabled={loading || uploading}><ArrowUp size={20} /></button>
          : <button type="button" className={`askb__icon ${listening ? 'is-listening' : ''}`} aria-label={listening ? 'Остановить запись' : 'Голосовой ввод'} onClick={listen}><Mic size={19} /></button>}
      </form>
      {note && <p className="askb__note" aria-live="polite">{note}</p>}
    </div>
  </section>;
}

export default AskBar;
