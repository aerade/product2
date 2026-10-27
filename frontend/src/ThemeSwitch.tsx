import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export default function ThemeSwitch() {
  const [dark, setDark] = useState(
    () => document.documentElement.dataset.theme === "dark",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content", dark ? "#121113" : "#ffffff",
    );
  }, [dark]);

  const label = dark ? "Включить светлую тему" : "Включить тёмную тему";
  return (
    <button
      type="button"
      className="theme-switch"
      aria-label={label}
      aria-pressed={dark}
      title={label}
      onClick={() => {
        const theme = dark ? "light" : "dark";
        try {
          localStorage.setItem("lectory-theme", theme);
        } catch { /* Тема работает и без доступа к хранилищу. */ }
        setDark(!dark);
      }}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
      <span>{dark ? "Светлая тема" : "Тёмная тема"}</span>
    </button>
  );
}
