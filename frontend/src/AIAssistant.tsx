import { useEffect, useRef, useState } from "react";
import { History, MessageSquare, Plus, Trash2, X } from "lucide-react";
import { api, json, type User } from "./api";
import AskBar, { type AskAction, type AskCitation, type AskImage, type AskLecture, type AskMessage } from "./components/ui/ask-bar";
import "./assistant.css";

type Conversation = { id: string; title: string; updated_at?: string; messages?: AskMessage[] };

export default function AIAssistant({ user, lectureId, lectureTitle }: { user: User; lectureId?: string; lectureTitle?: string }) {
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(() => {
    try { return localStorage.getItem('lectory-assistant-intro-seen') !== '1'; }
    catch { return true; }
  });
  function dismissHint() {
    setShowHint(false);
    try { localStorage.setItem('lectory-assistant-intro-seen', '1'); } catch { /* Подсказка скрыта до перезагрузки. */ }
  }
  const [closing, setClosing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [composerReset, setComposerReset] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const controller = useRef<AbortController | null>(null);
  const currentRef = useRef<string | null>(null);
  const run = useRef(0);
  const closeTimer = useRef<number | undefined>(undefined);
  const hydrated = useRef(false);
  const storageKey = 'lectory-chat-current:' + user.id;
  currentRef.current = current;

  function selectId(id: string | null) {
    currentRef.current = id; setCurrent(id);
    try { if (id) localStorage.setItem(storageKey, id); else localStorage.removeItem(storageKey); } catch { /* История остаётся на сервере. */ }
  }
  async function history() { const items = await api<Conversation[]>('/chat/conversations'); setConversations(items); return items; }
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    let live = true;
    void (async () => {
      setLoading(true);
      try {
        const items = await api<Conversation[]>('/chat/conversations');
        if (!live) return;
        setConversations(items);
        if (!hydrated.current) {
          hydrated.current = true;
          let remembered: string | null = null;
          try { remembered = localStorage.getItem(storageKey); } catch { /* Необязательное хранилище. */ }
          if (remembered && items.some(item => item.id === remembered)) {
            const data = await api<Conversation>('/chat/conversations/' + remembered);
            if (live) { selectId(data.id); setMessages(data.messages || []); setComposerReset(value => value + 1); }
          }
        } else if (currentRef.current && !controller.current) {
          const data = await api<Conversation>('/chat/conversations/' + currentRef.current);
          if (live) setMessages(data.messages || []);
        }
      } catch (e) { if (live) setError((e as Error).message); }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; dialog.current?.close(); document.body.style.overflow = previous; };
  }, [open]);
  useEffect(() => () => { controller.current?.abort(); window.clearTimeout(closeTimer.current); }, []);

  function close() {
    if (closing) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setOpen(false); launcher.current?.focus({ preventScroll: true }); return; }
    setClosing(true);
    closeTimer.current = window.setTimeout(() => { setOpen(false); setClosing(false); launcher.current?.focus({ preventScroll: true }); }, 180);
  }
  async function stop() {
    ++run.current;
    controller.current?.abort(); controller.current = null;
    const id = currentRef.current;
    if (id) { try { await api('/chat/conversations/' + id + '/cancel', { method: 'POST' }); } catch { /* Запрос также прекращается при разрыве соединения. */ } }
    setMessages(previous => previous.filter(message => !message.pending)); setBusy(false);
  }
  async function newChat() { if (busy) await stop(); selectId(null); setMessages([]); setError(''); setComposerReset(value => value + 1); }
  async function loadConversation(id: string) {
    if (busy) await stop();
    const token = ++run.current; setLoading(true); setError('');
    try { const data = await api<Conversation>('/chat/conversations/' + id); if (token === run.current) { selectId(id); setMessages(data.messages || []); setComposerReset(value => value + 1); } }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  async function send(text: string, images: AskImage[], lecture?: AskLecture) {
    if (busy) return;
    const token = ++run.current;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError('');
    const temporaryId = 'local-' + token;
    setMessages(previous => [...previous, { id: temporaryId, role: 'user', text, images, lecture }, { id: 'pending-' + token, role: 'assistant', text: '', pending: true }]);
    try {
      let id = currentRef.current;
      if (!id) {
        const created = await api<Conversation>('/chat/conversations', { method: 'POST', signal: abort.signal });
        if (abort.signal.aborted || token !== run.current) return;
        id = created.id; selectId(id);
      }
      const reply = await api<AskMessage>('/chat/messages', { method: 'POST', signal: abort.signal,
        body: json({ conversation_id: id, message: text, lecture_id: lecture?.id, image_ids: images.map(image => image.id) }) });
      if (token !== run.current) return;
      setMessages(previous => [...previous.filter(message => !message.pending), reply]);
      void history().catch(() => {});
    } catch (e) {
      if (token === run.current) {
        setMessages(previous => previous.filter(message => !message.pending));
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      }
    } finally { if (token === run.current) { setBusy(false); controller.current = null; } }
  }
  function navigate(route: string) {
    setOpen(false); setClosing(false);
    if (route === 'settings' || route === 'suggest') window.setTimeout(() => window.dispatchEvent(new CustomEvent('lectory-assistant-open', { detail: route })), 0);
    else if (route.startsWith('#/')) window.location.hash = route.slice(1);
  }
  function citation(item: AskCitation) { navigate(`#/lecture/${encodeURIComponent(item.lecture_id)}?t=${item.start_seconds}`); }
  async function action(item: AskAction) {
    setActionBusy(item.id); setError('');
    try {
      const result = await api<{ route?: string; completed?: boolean; message?: string }>('/chat/actions/' + item.id, { method: 'POST' });
      if (result.route) navigate(result.route);
      if (result.completed) {
        setMessages(previous => previous.map(message => ({ ...message, actions: message.actions?.map(a => a.id === item.id ? { ...a, completed: true } : a) })));
        window.dispatchEvent(new Event('lectory-library-changed'));
      }
    } catch (e) { setError((e as Error).message); }
    finally { setActionBusy(''); }
  }
  async function remove(id: string) {
    try {
      if (currentRef.current === id && busy) await stop();
      await api('/chat/conversations/' + id, { method: 'DELETE' });
      if (currentRef.current === id) { selectId(null); setMessages([]); setComposerReset(value => value + 1); }
      setDeleteId(null); await history();
    } catch (e) { setError((e as Error).message); }
  }

  return <>
    {showHint && !open && <div className="assistant-intro" role="note">
      <button type="button" className="assistant-intro-close" aria-label="Закрыть подсказку" onClick={dismissHint}><X size={14} /></button>
      <strong>Знакомьтесь, Лектория</strong>
      <span>Помогу разобраться в лекциях.</span>
      <small>Нажмите на иконку</small>
    </div>}
    <button ref={launcher} type="button" className="assistant-launcher" aria-label="Открыть чат с ИИ" title="Лектория" aria-haspopup="dialog" onClick={() => { dismissHint(); setOpen(true); }}>
      <img src="/art/lectory-ai-icon.webp" alt="" width={42} height={42} />
      <span>Лектория</span>
    </button>
    <dialog ref={dialog} className="assistant-dialog" data-closing={closing} aria-labelledby="assistant-title"
      onCancel={e => { e.preventDefault(); if (historyOpen) setHistoryOpen(false); else close(); }}
      onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="assistant-shell">
        <header className="assistant-header">
          <div className="assistant-brand"><img src="/art/lectory-ai-icon.webp" alt="" width={30} height={30} /><h2 id="assistant-title">Лектория</h2></div>
          <div className="assistant-header-actions">
            <button type="button" className="icon-button" aria-label="История диалогов" aria-expanded={historyOpen} aria-pressed={historyOpen} title="История диалогов" onClick={() => setHistoryOpen(!historyOpen)}><History size={19} /></button>
            <button type="button" className="icon-button" aria-label="Новый диалог" title="Новый диалог" onClick={() => void newChat()}><Plus size={20} /></button>
            <button type="button" className="icon-button" aria-label="Закрыть чат" title="Закрыть чат" onClick={close}><X size={20} /></button>
          </div>
        </header>
        <div className="assistant-body">
          {historyOpen && <aside className="assistant-history" aria-label="История диалогов">
            <div className="assistant-history-heading"><strong>Ваши диалоги</strong></div>
            {!conversations.length && <p>Здесь появятся ваши разговоры.</p>}
            {conversations.map(item => <div className={`assistant-history-row ${current === item.id ? 'active' : ''}`} key={item.id}>
              <button type="button" className="assistant-history-item" onClick={() => void loadConversation(item.id)}><MessageSquare size={15} /><span>{item.title}</span></button>
              <button type="button" className="icon-button" aria-label={'Удалить диалог «' + item.title + '»'} onClick={() => setDeleteId(item.id)}><Trash2 size={14} /></button>
              {deleteId === item.id && <div className="assistant-delete-confirm"><span>Удалить этот диалог?</span><button type="button" className="assistant-confirm-delete" onClick={() => void remove(item.id)}>Удалить</button><button type="button" onClick={() => setDeleteId(null)}>Отмена</button></div>}
            </div>)}
          </aside>}
          <div className="assistant-conversation">
            <AskBar key={composerReset} greeting="Привет, что разберем сегодня?" messages={messages} busy={busy} loading={loading} error={error}
              onSend={send} onStop={() => void stop()} onAction={action} onCitation={citation} actionBusy={actionBusy}
              currentLecture={lectureId ? { id: lectureId, title: lectureTitle || 'Текущая лекция' } : undefined} />
          </div>
        </div>
      </div>
    </dialog>
  </>;
}
