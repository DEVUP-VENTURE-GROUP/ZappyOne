import { useI18n } from '@shared/i18n/I18nProvider';

/**
 * Segmented language switcher. `variant="pills"` (default) renders inline pills;
 * `variant="menu"` renders a full-width list for settings screens.
 */
export default function LanguageSwitcher({ variant = 'pills', className = '' }) {
  const { lang, setLang, languages } = useI18n();

  if (variant === 'menu') {
    return (
      <div className={`grid grid-cols-3 gap-2 ${className}`}>
        {languages.map((l) => (
          <button key={l.code} onClick={() => setLang(l.code)}
            className={`py-2.5 rounded-xl text-sm font-bold border transition ${lang === l.code ? 'bg-zappy-600 text-white border-zappy-600' : 'bg-white text-slate-600 border-slate-200'}`}>
            {l.native}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={`inline-flex rounded-full bg-slate-100 p-0.5 ${className}`}>
      {languages.map((l) => (
        <button key={l.code} onClick={() => setLang(l.code)}
          className={`px-2.5 py-1 text-[11px] font-bold rounded-full transition-colors ${lang === l.code ? 'bg-white text-zappy-600 shadow-sm' : 'text-slate-500'}`}>
          {l.code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
