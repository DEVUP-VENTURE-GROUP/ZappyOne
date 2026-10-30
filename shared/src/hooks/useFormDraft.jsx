import { useCallback, useEffect, useRef, useState } from 'react';
import { DRAFT_PREFIX as PREFIX } from '../utils/formDrafts';
const TTL_MS = 3 * 24 * 3600 * 1000;
const read = (k) => { try { const d = JSON.parse(localStorage.getItem(k)); return d && Date.now() - d.at < TTL_MS ? d.form : null; } catch { return null; } };
const drop = (k) => { try { localStorage.removeItem(k); } catch { /* storage off */ } };

/**
 * Keeps a form's unsaved edits through a refresh, a crash or a dropped connection.
 * Call take(fresh) where the form is first filled from the server; it restores the
 * edits on top. Call clear() once the save succeeds.
 */
export function useFormDraft(key, form, setForm) {
  const k = key ? PREFIX + key : null;
  const base = useRef(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (!k || form == null || base.current == null) return undefined;
    const t = setTimeout(() => {
      if (JSON.stringify(form) === base.current) drop(k);
      else try { localStorage.setItem(k, JSON.stringify({ at: Date.now(), form })); } catch { /* full or off */ }
    }, 400);
    return () => clearTimeout(t);
  }, [k, form]);

  const take = useCallback((fresh) => {
    base.current = JSON.stringify(fresh);
    const saved = k ? read(k) : null;
    // Signed photo links expire, so a restored link gives way to the server's fresh one; a new upload's key is kept.
    if (saved) Object.keys(saved).forEach((f) => { if (typeof saved[f] === 'string' && /^https?:/i.test(saved[f])) saved[f] = fresh[f]; });
    if (saved && JSON.stringify({ ...fresh, ...saved }) !== base.current) { setForm({ ...fresh, ...saved }); setRestored(true); } else setForm(fresh);
  }, [k, setForm]);

  const clear = useCallback(() => { if (k) drop(k); setRestored(false); }, [k]);
  const discard = useCallback(() => { if (k) drop(k); setRestored(false); if (base.current) setForm(JSON.parse(base.current)); }, [k, setForm]);
  // After a save the saved values are the new starting point.
  const saved = useCallback((now) => { base.current = JSON.stringify(now); if (k) drop(k); setRestored(false); }, [k]);

  return { take, clear, discard, saved, restored };
}

// Shown at the top of a form whose unsaved edits came back after a refresh.
export function DraftRestored({ show, onDiscard }) {
  if (!show) return null;
  return (
    <div role="status" className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-zappy-200 bg-zappy-50 px-3 py-2 text-[12.5px] font-semibold text-zappy-800">
      <span>Your unsaved changes are back.</span>
      <button type="button" onClick={onDiscard} className="shrink-0 font-bold underline">Discard</button>
    </div>
  );
}
