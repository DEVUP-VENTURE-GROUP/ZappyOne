import { useNavigate } from 'react-router-dom';
import { useT } from '@shared/i18n/I18nProvider';
import { labelKey } from '@shared/i18n/translations';
import { motion } from 'framer-motion';
import { CalendarClock, ChevronRight, ClipboardList, Repeat, Wrench } from 'lucide-react';
import { useProviderPlanVisitsQuery } from '@shared/services/api';
import { useProviderJobs } from '@shared/provider/useProviderJobs';
import { workshopColumns, todaysTimeline, hourBook, timeOf } from '@shared/provider/tradeToday';

const TITLE = { workshop: ['Repairs right now', Wrench], visits: ["Today's visits", CalendarClock], appointments: ["Today's appointments", CalendarClock], tasks: ["Today's tasks", ClipboardList] };

function Row({ r, onOpen }) {
  return (
    <button type="button" onClick={() => onOpen(r.to)} className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-slate-50 ${r.past ? 'opacity-60' : ''}`}>
      <span className="w-16 shrink-0 text-[12px] font-bold tabular-nums text-slate-500">{r.at ? timeOf(r.at) : ''}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate text-[13px] font-bold capitalize text-[#0F172A]">{r.id.startsWith('plan-') && <Repeat size={12} className="shrink-0 text-zappy-600" />}{r.title}</span>
        {r.sub && <span className="block truncate text-[11.5px] text-slate-500">{r.sub}</span>}
      </span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.attention ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{r.status}</span>
    </button>
  );
}

// The top of a trade's home: its day in the shape that trade works, from the same jobs and visits as everywhere else.
export default function TradeToday({ home = 'workshop', kinds }) {
  const nav = useNavigate();
  const t = useT();
  const { mine: jobs = [] } = useProviderJobs({ kinds });
  const { data: visitData } = useProviderPlanVisitsQuery({ days: 1 }, { skip: home !== 'visits' && home !== 'appointments', pollingInterval: 60000 });
  const [titleEn, Icon] = TITLE[home] || TITLE.workshop;
  const title = t(labelKey(titleEn), titleEn);
  const open = (to) => to && nav(to);

  let body;
  if (home === 'workshop') {
    body = (
      <div className="grid gap-3 sm:grid-cols-3">
        {workshopColumns(jobs).map((c) => (
          <div key={c.key} className="min-w-0 rounded-xl bg-slate-50 p-2.5">
            <p className="flex items-center justify-between px-1 text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">
              {t(labelKey(c.label), c.label)}<span className={`rounded-full px-1.5 tabular-nums ${c.key === 'you' && c.items.length ? 'bg-amber-100 text-amber-800' : 'bg-white text-slate-600'}`}>{c.items.length}</span>
            </p>
            <div className="mt-2 space-y-1.5">
              {c.items.slice(0, 4).map((j) => (
                <motion.button layout key={`${j.kind}-${j.id}`} type="button" onClick={() => open(j.to)} className="block w-full rounded-lg bg-white px-2.5 py-2 text-left ring-1 ring-slate-100 hover:ring-zappy-200">
                  <span className="block truncate text-[12.5px] font-bold capitalize text-[#0F172A]">{j.title}</span>
                  <span className="block truncate text-[11px] text-slate-500">{j.status}</span>
                </motion.button>
              ))}
              {!c.items.length && <p className="px-1 py-2 text-[12px] text-slate-400">{t('sp.nothing_here', 'Nothing here')}</p>}
              {c.items.length > 4 && <button type="button" onClick={() => nav('/shop/orders')} className="px-1 text-[12px] font-bold text-zappy-600">{c.items.length - 4} more</button>}
            </div>
          </div>
        ))}
      </div>
    );
  } else {
    const rows = todaysTimeline(jobs, visitData?.items || []);
    if (!rows.length) body = <p className="py-6 text-center text-sm text-slate-500">Nothing booked for today yet. New bookings appear here as they come in.</p>;
    else if (home === 'appointments') {
      body = (
        <ol className="divide-y divide-slate-100">
          {hourBook(rows).filter((h, i, all) => h.items.length || (i > 0 && all[i - 1].items.length)).map((h) => (
            <li key={h.hour} className="flex gap-3 py-1.5">
              <span className="w-12 shrink-0 pt-2 text-[11px] font-bold text-slate-400">{h.label}</span>
              <div className="min-w-0 flex-1">{h.items.length ? h.items.map((r) => <Row key={r.id} r={r} onOpen={open} />) : <p className="py-2 text-[12px] text-emerald-700">{t('sp.free', 'Free')}</p>}</div>
            </li>
          ))}
        </ol>
      );
    } else body = <div className="space-y-0.5">{rows.map((r) => <Row key={r.id} r={r} onOpen={open} />)}</div>;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[15px] font-black text-[#0F172A]"><Icon size={16} className="text-zappy-600" /> {title}</h2>
        <button type="button" onClick={() => nav('/shop/orders')} className="flex items-center text-[12px] font-bold text-zappy-600">All <ChevronRight size={13} /></button>
      </div>
      {body}
    </section>
  );
}
