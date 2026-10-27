import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Moon, Sun } from "lucide-react";

const decodedArtwork = new Map<string, Promise<void>>();

export default function ThemeSwitch() {
  const [dark, setDark] = useState(
    () => document.documentElement.dataset.theme === "dark",
  );
  const [busy, setBusy] = useState(false);
  const switching = useRef(false);

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.dataset.theme === "dark"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  async function toggle(button: HTMLButtonElement) {
    if (switching.current) return;
    switching.current = true;
    const root = document.documentElement;
    const theme = root.dataset.theme === "dark" ? "light" : "dark";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.ceil(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))) + 4;
    let applied = false;
    const apply = () => {
      if (applied) return;
      applied = true;
      flushSync(() => {
        root.dataset.theme = theme;
        setDark(theme === "dark");
        window.dispatchEvent(new Event("lectory-theme-change"));
      });
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#121113" : "#ffffff");
      try { localStorage.setItem("lectory-theme", theme); } catch { /* Тема работает и без хранилища. */ }
    };
    setBusy(true);
    let transition: ViewTransition | undefined;
    let reveal: Animation | undefined;
    try {
      if (reduced) { apply(); return; }
      // Заранее загружаем обложки новой темы.
      const covers = [...new Set([...document.querySelectorAll<HTMLImageElement>('img[src*="/art/cover-"]')]
        .map(img => img.src.replace(/-(light|dark)\.webp$/, `-${theme}.webp`)))];
      await Promise.all(covers.map(src => {
        if (!decodedArtwork.has(src)) {
          const image = new Image(); image.src = src;
          decodedArtwork.set(src, image.decode().catch(() => {}));
        }
        return decodedArtwork.get(src);
      }));
      if (!document.startViewTransition) {
        root.classList.add("theme-fallback");
        apply();
        await new Promise(resolve => setTimeout(resolve, 420));
        return;
      }
      root.classList.add("theme-changing");
      transition = document.startViewTransition(apply);
      await transition.ready;
      reveal = root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] }, {
        duration: 600, easing: "cubic-bezier(.22, 1, .36, 1)", pseudoElement: "::view-transition-new(root)",
      });
      await reveal.finished;
      await transition.finished;
    } catch {
      apply();
    } finally {
      // Освобождаем снимок после переключения.
      reveal?.cancel();
      transition?.skipTransition();
      root.classList.remove("theme-changing", "theme-fallback");
      switching.current = false;
      setBusy(false);
    }
  }

  const label = dark ? "Включить светлую тему" : "Включить тёмную тему";
  return (
    <button
      type="button"
      className="theme-switch"
      aria-label={label}
      aria-pressed={dark}
      disabled={busy}
      data-switching={busy}
      title={label}
      onClick={e => void toggle(e.currentTarget)}
    >
      <span className="theme-glyph" aria-hidden="true"><Sun className="theme-sun" size={18} /><Moon className="theme-moon" size={18} /></span>
    </button>
  );
}
