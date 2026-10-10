/**
 * The app's language (the websites' I18nProvider), from the same translation
 * table (core/shared/translations). t(key, englishFallback): the active
 * language's words, else English. The choice is kept on the phone.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LANGUAGES, translations } from '@zappy/core/shared/translations';

const STORAGE_KEY = 'zappyLang';
type T = (key: string, fallback?: string) => string;
interface I18n { lang: string; setLang: (l: string) => void; t: T; languages: typeof LANGUAGES }

const english: T = (k, f) => f ?? k;
const I18nCtx = createContext<I18n>({ lang: 'en', setLang: () => {}, t: english, languages: LANGUAGES });
const table = translations as Record<string, Record<string, string>>;

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState('en');
  useEffect(() => { AsyncStorage.getItem(STORAGE_KEY).then((l) => { if (l && table[l]) setLangState(l); }).catch(() => {}); }, []);

  const setLang = useCallback((l: string) => {
    if (!LANGUAGES.some((x: { code: string }) => x.code === l)) return;
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
    setLangState(l);
  }, []);
  const t = useCallback<T>((key, fallback) => (lang === 'en' ? fallback ?? key : table[lang]?.[key] ?? fallback ?? key), [lang]);
  const value = useMemo(() => ({ lang, setLang, t, languages: LANGUAGES }), [lang, setLang, t]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);
export const useT = () => useContext(I18nCtx).t;
