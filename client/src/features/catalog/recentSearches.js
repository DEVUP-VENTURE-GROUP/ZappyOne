// Recent searches — stored locally (no server round-trip). Kept small and deduped.
const KEY = 'zappy:recentSearches';
const MAX = 8;

export function getRecent() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function addRecent(term) {
  const t = String(term || '').trim();
  if (!t) return getRecent();
  try {
    const list = getRecent().filter((x) => x.toLowerCase() !== t.toLowerCase());
    list.unshift(t);
    const next = list.slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch { return getRecent(); }
}

export function clearRecent() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return [];
}
