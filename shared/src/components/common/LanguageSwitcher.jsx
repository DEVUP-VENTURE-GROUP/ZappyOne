import { useId } from 'react';
import { ChevronDown, Languages } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';

// One dropdown for the app's language, each shown in its own script; the same control in every panel.
export default function LanguageSwitcher({ className = '' }) {
  const { lang, setLang, languages, t } = useI18n();
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">{t('sp.language', 'Choose your language')}</label>
      <div className="relative">
        <Languages size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <select id={id} value={lang} onChange={(e) => setLang(e.target.value)}
          className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm font-semibold text-slate-800 outline-none focus:border-zappy-500 focus:ring-2 focus:ring-zappy-100">
          {languages.map((l) => <option key={l.code} value={l.code}>{l.native === l.label ? l.native : `${l.native} (${l.label})`}</option>)}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
      </div>
    </div>
  );
}
