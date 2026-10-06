/**
 * Keeping an open tab on the current version of the app.
 *
 * Every deploy renames the app's page files (the names carry a hash of their
 * contents). A tab opened before a deploy still runs the old app; the first
 * time it opens a section it has not loaded yet, it asks for an old file that
 * no longer exists, and the screen breaks. That is what "Something went wrong
 * when I click something, in every panel" was.
 *
 * The fix is the standard one: when loading part of the app fails because the
 * file is gone, reload once onto the new version. A guard stops a reload loop
 * if something else is wrong. Tabs left open also check for a new version when
 * they come back to the screen, and reload at the next page change rather than
 * mid-task.
 */
const RELOAD_KEY = 'zappy_reloaded_for_update';

/** Failed to load a piece of the app (the old file is gone after a deploy). */
export function isStaleChunkError(err) {
  const msg = String(err?.message || err || '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .* failed|ChunkLoadError|Unable to preload CSS/i.test(msg);
}

/** Reload onto the new version, at most once in a short while. Returns whether it reloaded. */
export function reloadForUpdate() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 15000) return false; // just reloaded: something else is wrong
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch { /* storage blocked: reload anyway, once per page life */ }
  window.location.reload();
  return true;
}

/** The script file this page was built with, e.g. /assets/index-AbC123.js. */
function entryOf(html) {
  const m = /<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(html);
  return m ? m[1] : null;
}

let current = null;
let updateWaiting = false;

/** Is a newer version deployed than the one this tab is running? */
async function checkForUpdate() {
  try {
    const res = await fetch('/', { cache: 'no-store', headers: { Accept: 'text/html' } });
    if (!res.ok) return;
    const latest = entryOf(await res.text());
    if (current && latest && latest !== current) updateWaiting = true;
  } catch { /* offline: try next time */ }
}

/** Wire it up once, at app start. */
export function watchForUpdates() {
  if (typeof window === 'undefined') return;
  current = entryOf(document.documentElement.outerHTML);

  // Vite's own signal that a page file failed to load.
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault?.();
    reloadForUpdate();
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (isStaleChunkError(event.reason)) reloadForUpdate();
  });

  // Back to a tab left open: look for a new version (cheap; at most every 5 minutes).
  let lastCheck = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 300000) return;
    lastCheck = Date.now();
    checkForUpdate();
  });
  // Every half hour for tabs that stay on screen (admin dashboards).
  setInterval(checkForUpdate, 30 * 60 * 1000);
}

/** Called on every route change: a waiting update is applied between screens, never mid-form. */
export function applyUpdateIfWaiting() {
  if (updateWaiting) reloadForUpdate();
}
