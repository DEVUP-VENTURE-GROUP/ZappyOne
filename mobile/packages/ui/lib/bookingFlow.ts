/**
 * The step of a multi-step booking (the websites' useFlowStep and useDraft):
 *
 *   useFlowStep  the current step and the trail behind it. Android's back
 *                button and the on-screen arrow go ONE STEP back; a step the
 *                customer never really saw (skipped, `replace`) is not in the
 *                trail, so Back never lands on it and bounces forward again.
 *   useDraft     saves the booking on the phone as it changes.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { saveDraft } from '@zappy/core/lib/drafts';

type SetStep = (next: string | ((current: string) => string), opts?: { replace?: boolean }) => void;

export function useFlowStep(initial: string, { onExit }: { onExit: () => void }): [string, SetStep, () => void, (step: string) => void] {
  const [trail, setTrail] = useState<string[]>([initial]);
  const step = trail[trail.length - 1];

  const setStep: SetStep = useCallback((s, { replace = false } = {}) => {
    setTrail((t) => {
      const now = t[t.length - 1];
      const next = typeof s === 'function' ? s(now) : s;
      if (!next || next === now) return t;
      return replace ? [...t.slice(0, -1), next] : [...t, next];
    });
  }, []);

  /** One step back, or out of the flow from its first step. */
  const depth = useRef(trail.length);
  depth.current = trail.length;
  const back = useCallback(() => {
    if (depth.current > 1) setTrail((t) => t.slice(0, -1));
    else onExit();
  }, [onExit]);

  /** Back to a named step (e.g. the previous non-skipped one) after a resume. */
  const backTo = useCallback((prev: string) => {
    setTrail((t) => {
      const at = t.lastIndexOf(prev);
      return at >= 0 ? t.slice(0, at + 1) : [...t.slice(0, -1), prev];
    });
  }, []);

  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; });
    return () => sub.remove();
  }, [back]));

  return [step, setStep, back, backTo];
}

/** Save `values` under `key` on every change, while `enabled`. */
export function useDraft(key: string, values: unknown, enabled = true): void {
  const json = JSON.stringify(values);
  useEffect(() => { if (enabled) saveDraft(key, values); }, [key, json, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
