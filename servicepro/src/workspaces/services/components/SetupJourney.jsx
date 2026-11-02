import { useNavigate } from 'react-router-dom';
import { useT } from '@shared/i18n/I18nProvider';
import { motion } from 'framer-motion';
import { ArrowRight, CircleCheck, CircleDashed, Clock3 } from 'lucide-react';
import { useProviderSetupJourneyQuery } from '@shared/services/api';

// Where the shop is on the way to taking work: done, waiting on ZappyOne, and the one thing to do next. Gone once the shop is live.
export default function SetupJourney() {
  const nav = useNavigate();
  const t = useT();
  const { data } = useProviderSetupJourneyQuery();
  if (!data || data.live) return null;
  const pct = Math.round((data.done / data.total) * 100);
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-zappy-600">Your setup · {data.done} of {data.total}</p>
          <h2 className="mt-1 text-[17px] font-extrabold text-[#0F172A]">{data.next ? `Next: ${data.next.label.toLowerCase()}` : 'ZappyOne is checking your details'}</h2>
        </div>
        {data.next && (
          <button type="button" onClick={() => nav(data.next.path)} className="btn-primary flex items-center gap-1.5 px-4 py-2.5 text-[13px]">
            {t('sp.continue', 'Continue')} <ArrowRight size={15} />
          </button>
        )}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <motion.div className="h-full bg-zappy-600" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} />
      </div>
      <ol className="mt-3 grid gap-1.5 sm:grid-cols-5">
        {data.steps.map((s) => {
          const Icon = s.done ? CircleCheck : s.waiting ? Clock3 : CircleDashed;
          return (
            <li key={s.key}>
              <button type="button" onClick={() => nav(s.path)} className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[12.5px] font-semibold hover:bg-slate-50">
                <Icon size={16} className={`shrink-0 ${s.done ? 'text-emerald-600' : s.waiting ? 'text-amber-600' : 'text-slate-300'}`} />
                <span className={`min-w-0 ${s.done ? 'text-slate-500' : 'text-slate-800'}`}>{s.label}{s.waiting ? ' · in review' : ''}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </motion.section>
  );
}
