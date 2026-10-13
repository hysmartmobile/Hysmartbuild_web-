const STORAGE_KEY = 'hysmart.theme';
const THEMES = new Set(['light', 'dark']);

function readStoredTheme() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return THEMES.has(value) ? value : null;
  } catch {
    return null;
  }
}

export function getTheme() {
  if (typeof document !== 'undefined' && THEMES.has(document.documentElement.dataset.theme)) {
    return document.documentElement.dataset.theme;
  }
  return readStoredTheme() || 'light';
}

export function applyTheme(theme, { persist = true } = {}) {
  const next = THEMES.has(theme) ? theme : 'light';
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
  }
  if (persist) {
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Theme still works for this session. */ }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('hysmart-theme-change', { detail: { theme: next } }));
  }
  return next;
}

export function toggleTheme() {
  return applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}
