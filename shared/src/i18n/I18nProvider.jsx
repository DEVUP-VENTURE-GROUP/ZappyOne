import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { translations, LANGUAGES } from './translations';

const I18nCtx = createContext(null);
const STORAGE_KEY = 'zappyLang';

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || 'en'; } catch { return 'en'; }
  });

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const setLang = useCallback((l) => {
    if (!LANGUAGES.some((x) => x.code === l)) return;
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
    setLangState(l);
  }, []);

  /** t(key, englishFallback): translation for the active language, else English. */
  const t = useCallback((key, fallback) => {
    if (lang === 'en') return fallback ?? key;
    return translations[lang]?.[key] ?? fallback ?? key;
  }, [lang]);

  return (
    <I18nCtx.Provider value={{ lang, setLang, t, languages: LANGUAGES }}>
      {children}
    </I18nCtx.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nCtx);
  if (!ctx) {
    // Safe fallback so a component used outside the provider still renders English.
    return { lang: 'en', setLang: () => {}, t: (k, f) => f ?? k, languages: LANGUAGES };
  }
  return ctx;
}

export function useT() {
  return useI18n().t;
}
