import { useRef, useState, useCallback, useEffect } from 'react';

/**
 * Thin wrapper around the Web Speech API (SpeechRecognition).
 * Works in Chrome / Edge / most Android browsers; gracefully reports
 * `supported: false` elsewhere so the UI can hide the mic.
 *
 * Usage:
 *   const { supported, listening, start, stop } = useSpeechRecognition({
 *     onResult: (text) => setQuery(text),
 *   });
 */
export default function useSpeechRecognition({ lang = 'en-IN', onResult, onInterim, onError } = {}) {
  const SR = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;
  const supported = !!SR;

  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const onInterimRef = useRef(onInterim);
  useEffect(() => { onInterimRef.current = onInterim; }, [onInterim]);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!supported) return;
    try {
      const rec = new SR();
      rec.lang = lang;
      // Interim results so the words appear as they are spoken.
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.continuous = false;

      rec.onresult = (e) => {
        let interim = '';
        let final = '';
        for (let i = e.resultIndex; i < e.results.length; i += 1) {
          const t = e.results[i][0]?.transcript || '';
          if (e.results[i].isFinal) final += t; else interim += t;
        }
        if (interim) onInterimRef.current?.(interim.trim());
        if (final.trim()) onResultRef.current?.(final.trim());
      };
      rec.onend = () => setListening(false);
      rec.onerror = (e) => {
        setListening(false);
        onErrorRef.current?.(e?.error || 'error');
      };

      recRef.current = rec;
      setListening(true);
      rec.start();
    } catch (err) {
      setListening(false);
      onErrorRef.current?.(err?.message || 'error');
    }
  }, [supported, lang, SR]);

  // Abort any active recognition on unmount.
  useEffect(() => () => { try { recRef.current?.abort(); } catch { /* noop */ } }, []);

  return { supported, listening, start, stop };
}
