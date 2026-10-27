import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

type Option = { value: string; label: string };
export default function Select({ value, options, onChange, label, disabled = false }: {
  value: string; options: Option[]; onChange: (value: string) => void;
  label: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 200, maxHeight: 300 });
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const choose = (index: number) => {
    const next = options[index];
    setOpen(false);
    button.current?.focus({ preventScroll: true });
    if (next && next.value !== value) onChange(next.value);
  };
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = button.current!.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 210), window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom - 16;
      const height = Math.min(options.length * 42 + 12, 300);
      const above = below < Math.min(height, 180) && rect.top > below;
      setPosition({ left: Math.min(rect.left, window.innerWidth - width - 12), width,
        top: above ? Math.max(12, rect.top - Math.min(height, rect.top - 20) - 6) : rect.bottom + 6,
        maxHeight: above ? Math.min(300, rect.top - 20) : Math.max(80, below) });
    };
    place();
    const outside = (e: PointerEvent) => {
      if (!button.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, options.length]);
  useEffect(() => { if (open) menu.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" }); }, [active, open]);
  return <>
    <button ref={button} type="button" className="custom-select" disabled={disabled}
      role="combobox" aria-label={label} aria-expanded={open} aria-controls={id}
      aria-haspopup="listbox" aria-activedescendant={open ? `${id}-${active}` : undefined}
      onBlur={(e) => { if (!menu.current?.contains(e.relatedTarget)) setOpen(false); }}
      onClick={() => { setActive(Math.max(0, options.findIndex(o => o.value === value))); setOpen(!open); }}
      onKeyDown={(e) => {
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          if (!open) { setOpen(true); setActive(Math.max(0, options.findIndex(o => o.value === value))); }
          else setActive(i => e.key === "Home" ? 0 : e.key === "End" ? options.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
        } else if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); }
        else if (open && ["Enter", " "].includes(e.key)) { e.preventDefault(); choose(active); }
        else if (e.key === "Tab") setOpen(false);
      }}>
      <span>{options.find(o => o.value === value)?.label || "Выберите"}</span><ChevronDown size={15} />
    </button>
    {open && createPortal(<div ref={menu} id={id} className="custom-select-menu" role="listbox" aria-label={label}
      style={{ position: "fixed", ...position }}>
      {options.map((option, i) => <button type="button" role="option" id={`${id}-${i}`} key={option.value}
        aria-selected={option.value === value} data-active={active === i} tabIndex={-1}
        onPointerDown={e => e.preventDefault()} onPointerMove={() => setActive(i)} onClick={() => choose(i)}>
        <span>{option.label}</span>{option.value === value && <Check size={15} />}
      </button>)}
    </div>, button.current?.closest("dialog") || document.body)}
  </>;
}

export function CourseInput({ courses }: { courses: string[] }) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const options = courses.filter(c => c.toLocaleLowerCase().includes(value.toLocaleLowerCase())).slice(0, 30);
  const choose = (index: number) => { if (options[index]) setValue(options[index]); setOpen(false); };
  return <div className="course-combobox">
    <input name="course" maxLength={160} value={value} role="combobox" aria-label="Курс"
      aria-expanded={open && !!options.length} aria-controls={id} aria-autocomplete="list"
      aria-activedescendant={open && options.length ? `${id}-${active}` : undefined}
      placeholder="Выберите или создайте курс" autoComplete="off"
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onChange={e => { setValue(e.target.value); setActive(0); setOpen(true); }}
      onKeyDown={e => {
        if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); }
        if (["ArrowDown", "ArrowUp"].includes(e.key) && options.length) { e.preventDefault(); setOpen(true); setActive(i => (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length); }
        if (e.key === "Enter" && open && options.length) { e.preventDefault(); choose(active); }
      }} />
    {open && !!options.length && <div id={id} role="listbox" className="course-options">
      {options.map((course, i) => <button type="button" role="option" aria-selected={course === value} id={`${id}-${i}`}
        data-active={i === active} key={course} onPointerDown={e => e.preventDefault()} onClick={() => choose(i)}>{course}</button>)}
    </div>}
  </div>;
}
