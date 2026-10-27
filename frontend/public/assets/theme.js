(() => {
  let theme;
  try {
    theme = localStorage.getItem("lectory-theme");
  } catch { /* Используем тему системы. */ }
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content", theme === "dark" ? "#121113" : "#ffffff",
  );
})();
