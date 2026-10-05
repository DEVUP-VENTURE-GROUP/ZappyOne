import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * The step of a multi-step booking lives in the address (?step=…), so the
 * phone's back button and the browser's go back ONE STEP instead of leaving
 * the whole flow, and a refresh stays on the same step.
 *
 *   initial   the first step (kept out of the address)
 *   valid     (step) => boolean: can this step be shown with what we have?
 *             A step that is not (a shared link, a lost draft) falls back to
 *             `initial` instead of opening an empty screen.
 *
 * setStep(next, { replace }) — `replace` for a step the customer never really
 * saw (skipped because there was nothing to ask), so Back does not land on it
 * and bounce forward again.
 *
 * backTo(prev) — the on-screen back arrow. When the previous step is the page
 * before this one in history it goes back there (so the phone's Back and the
 * arrow agree); after a resume or refresh it swaps this step for `prev`.
 */
export function useFlowStep(initial, { valid } = {}) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('step');
  const step = raw && (!valid || valid(raw)) ? raw : initial;
  const current = useRef(step);
  current.current = step;

  const setStep = useCallback((s, { replace = false } = {}) => {
    const next = typeof s === 'function' ? s(current.current) : s;
    if (!next || next === current.current) return;
    const from = current.current;
    current.current = next;
    setParams((p) => {
      const q = new URLSearchParams(p);
      if (next === initial) q.delete('step'); else q.set('step', next);
      return q;
    }, {
      replace,
      // Remember which step this entry came from; a replaced entry keeps its own.
      state: replace ? window.history.state?.usr ?? null : { flowFrom: from },
    });
  }, [initial, setParams]);

  const nav = useNavigate();
  const backTo = useCallback((prev) => {
    if (window.history.state?.usr?.flowFrom === prev) nav(-1);
    else setStep(prev, { replace: true });
  }, [nav, setStep]);

  return [step, setStep, backTo];
}

const TTL_MS = 24 * 60 * 60 * 1000;

export function readDraft(key) {
  try {
    const d = JSON.parse(localStorage.getItem(`draft:${key}`) || 'null');
    if (!d || Date.now() - d.at > TTL_MS) return null;
    return d.v;
  } catch { return null; }
}

/**
 * A booking in progress, saved on this device as the customer goes, so
 * leaving (a call, another app, a refresh) and coming back resumes it.
 * Kept a day; cleared when the booking is made or they start over.
 *
 *   const [draft, clear] = useDraft('pet:grooming', { pets, address, step }, enabled)
 *
 * `draft` is what was saved when the screen opened (read once), for the
 * screen's initial state. Saving happens on every change of `values`.
 */
export function useDraft(key, values, enabled = true) {
  const [draft] = useState(() => readDraft(key));
  const json = JSON.stringify(values);
  useEffect(() => {
    if (!enabled) return;
    try { localStorage.setItem(`draft:${key}`, JSON.stringify({ at: Date.now(), v: values })); } catch { /* storage full or blocked */ }
  }, [key, json, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  const clear = useCallback(() => { try { localStorage.removeItem(`draft:${key}`); } catch { /* ignore */ } }, [key]);
  return [draft, clear];
}

/** Clear a saved booking from outside the flow (after it is placed). */
export function clearDraft(key) {
  try { localStorage.removeItem(`draft:${key}`); } catch { /* ignore */ }
}

/**
 * Back that never strands the customer: one page back when there is one in
 * this app, otherwise to `fallback` (a link opened directly, a refresh).
 */
export function useSafeBack(fallback = '/') {
  const nav = useNavigate();
  return useCallback(() => {
    const idx = window.history.state?.idx;
    if (typeof idx === 'number' && idx > 0) nav(-1);
    else nav(fallback, { replace: true });
  }, [nav, fallback]);
}
