import { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ArrowLeft, CalendarX2, KeyRound, Pause, Repeat, Star } from 'lucide-react';
import { useCancelPlanMutation, useMyPlansQuery, usePausePlanDayMutation, useRatePlanVisitMutation } from '@shared/services/api';
import { useSafeBack } from '../../hooks/useBookingFlow';

const rupees = (p) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;
const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const dayLabel = (d) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const TONE = { scheduled: 'bg-slate-100 text-slate-700', started: 'bg-amber-100 text-amber-800', done: 'bg-emerald-100 text-emerald-800', missed: 'bg-red-100 text-red-700', paused: 'bg-slate-200 text-slate-600', cancelled: 'bg-slate-100 text-slate-400' };

function Visit({ v, subId, canPause }) {
  const [pause] = usePausePlanDayMutation();
  const [rate] = useRatePlanVisitMutation();
  const isToday = v.day === today();
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="w-24 shrink-0 text-sm font-semibold text-slate-700">{isToday ? 'Today' : dayLabel(v.day)}</div>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${TONE[v.status]}`}>{v.makeupFor ? 'makeup' : v.status}</span>
      <div className="ml-auto flex items-center gap-2">
        {v.status === 'scheduled' && isToday && <span className="flex items-center gap-1 rounded-lg bg-[#0F172A] px-2 py-1 font-mono text-sm font-bold tracking-widest text-white"><KeyRound size={12} />{v.startCode}</span>}
        {v.status === 'scheduled' && !isToday && v.day > today() && canPause && !v.makeupFor && (
          <button type="button" onClick={async () => { try { const r = await pause({ id: subId, day: v.day }).unwrap(); toast.success(`Paused. A makeup visit is added. ${r.pausesLeft} pauses left this month.`); } catch (e) { toast.error(e?.data?.error || 'Could not pause'); } }} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800"><Pause size={12} /> Pause</button>
        )}
        {v.status === 'done' && !v.rating?.stars && (
          <span className="flex" aria-label="Rate this visit">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${n} stars`} onClick={() => rate({ id: v._id, stars: n }).unwrap().then(() => toast.success('Thanks for rating')).catch(() => toast.error('Could not save'))}><Star size={16} className="text-amber-400 hover:fill-amber-400" /></button>)}</span>
        )}
        {v.rating?.stars && <span className="flex items-center gap-0.5 text-xs font-bold text-slate-600"><Star size={12} className="fill-amber-400 text-amber-400" />{v.rating.stars}</span>}
      </div>
    </li>
  );
}

// The customer's plans: today's start code, the coming visits, pausing a day, rating visits and cancelling.
export default function MyPlansPage() {
  const goBack = useSafeBack('/');
  const { data, isLoading } = useMyPlansQuery(undefined, { pollingInterval: 60000 });
  const [cancel, { isLoading: cancelling }] = useCancelPlanMutation();
  const [confirming, setConfirming] = useState(null);
  const items = data?.items || [];

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-16">
      <header className="page-header"><div className="page-header-inner">
        <button onClick={() => goBack()} className="back-btn" aria-label="Back"><ArrowLeft size={18} strokeWidth={2.5} /></button>
        <div><p className="t-label">Subscriptions</p><p className="font-semibold text-[#0F172A]">My plans</p></div>
      </div></header>
      <div className="mx-auto max-w-lg space-y-3 px-4 pt-4 lg:max-w-2xl">
        {isLoading && [0, 1].map((k) => <div key={k} className="card h-28 animate-pulse bg-slate-100" />)}
        {!isLoading && !items.length && <div className="card text-center"><Repeat size={28} className="mx-auto text-slate-300" /><p className="mt-2 font-bold">No plans yet</p><p className="text-sm text-slate-500">Open a service and pick a monthly plan from a provider near you.</p></div>}
        {items.map((s, i) => (
          <motion.section key={s._id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="font-extrabold text-[#0F172A]">{s.snapshot.name}</p><p className="text-xs text-slate-500">{s.timeSlot} · until {dayLabel(s.endDay)} · {rupees(s.monthlyPaise + s.platformFeePaise)} a month</p></div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold capitalize">{s.status}</span>
            </div>
            <ul className="mt-2 divide-y divide-slate-100">{s.visits.map((v) => <Visit key={v._id} v={v} subId={s._id} canPause={s.status === 'active'} />)}</ul>
            {s.status === 'active' && (confirming === s._id ? (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-red-50 p-2 text-sm">
                <span className="flex-1 text-red-800">Cancel? Visits already paid for this month stay booked.</span>
                <button type="button" disabled={cancelling} onClick={() => cancel({ id: s._id, reason: '' }).unwrap().then(() => { toast.success('Plan cancelled'); setConfirming(null); }).catch((e) => toast.error(e?.data?.error || 'Could not cancel'))} className="rounded-lg bg-red-600 px-3 py-1 text-xs font-bold text-white">Yes, cancel</button>
                <button type="button" onClick={() => setConfirming(null)} className="text-xs font-bold text-slate-600">Keep</button>
              </div>
            ) : <button type="button" onClick={() => setConfirming(s._id)} className="mt-2 flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-red-600"><CalendarX2 size={13} /> Cancel plan</button>)}
          </motion.section>
        ))}
      </div>
    </div>
  );
}
