// The app's version of the websites' useFormDraft: a form's unsaved edits survive the app being closed or crashing.
import { useCallback, useEffect, useRef, useState } from 'react';
import { clearDraft, readDraft, saveDraft } from '../lib/drafts';

export function useFormDraft<T extends object>(key: string | null | undefined, form: T | null, setForm: (f: T) => void) {
  const k = key ? `form:${key}` : null;
  const base = useRef<string | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (!k || form == null || base.current == null) return undefined;
    const t = setTimeout(() => { if (JSON.stringify(form) === base.current) clearDraft(k); else saveDraft(k, form); }, 400);
    return () => clearTimeout(t);
  }, [k, form]);

  const take = useCallback((fresh: T) => {
    base.current = JSON.stringify(fresh);
    setForm(fresh);
    if (!k) return;
    readDraft<T>(k).then((saved) => {
      if (!saved) return;
      const merged = { ...fresh } as Record<string, unknown>;
      // Signed photo links expire; a new upload's key is kept.
      Object.entries(saved).forEach(([f, v]) => { if (!(typeof v === 'string' && /^https?:/i.test(v))) merged[f] = v; });
      if (JSON.stringify(merged) !== base.current) { setForm(merged as T); setRestored(true); }
    });
  }, [k, setForm]);

  const saved = useCallback((now: T) => { base.current = JSON.stringify(now); if (k) clearDraft(k); setRestored(false); }, [k]);
  const discard = useCallback(() => { if (k) clearDraft(k); setRestored(false); if (base.current) setForm(JSON.parse(base.current)); }, [k, setForm]);
  return { take, saved, discard, restored };
}
