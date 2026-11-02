export const DRAFT_PREFIX = 'zdraft:';

// Sign-out on a shared phone or computer leaves no one's half-typed details behind.
export function clearFormDrafts() {
  try { Object.keys(localStorage).filter((k) => k.startsWith(DRAFT_PREFIX)).forEach((k) => localStorage.removeItem(k)); } catch { /* storage off */ }
}
