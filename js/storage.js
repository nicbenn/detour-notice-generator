const STORAGE_KEY = "detour-notice-v1";

export function loadNotice(hydrate) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return hydrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

let timer = 0;

export function scheduleSave(notice, onError) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notice));
    } catch {
      onError?.();
    }
  }, 250);
}
