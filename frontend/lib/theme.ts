export type ConsoleTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "borderlens.console.theme";

export function getStoredTheme(): ConsoleTheme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  // Preserve the existing light blue tactical theme until the operator
  // explicitly chooses dark mode.
  return "light";
}

export function applyTheme(theme: ConsoleTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const previousTheme = root.dataset.theme as ConsoleTheme | undefined;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  // ThemeController listens for this event. Only emit when the value really
  // changed; otherwise the listener would call applyTheme again forever.
  if (previousTheme !== theme) {
    window.dispatchEvent(new CustomEvent("borderlens-theme-change", { detail: theme }));
  }
}
