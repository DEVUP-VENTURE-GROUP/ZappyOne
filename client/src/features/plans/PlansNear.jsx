import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { CalendarCheck, Loader2, Repeat, Star, X } from 'lucide-react';
import { usePlanQuoteQuery, usePlansNearQuery, usePlansNearAnyQuery, useSubscribePlanMutation } from '@shared/services/api';
import { selectLocation, selectHasLocation } from '@shared/store/locationSlice';

const rupees = (p) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;
const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const plusDays = (n) => new Date(Date.now() + 330 * 60000 + n * 86400000).toISOString().slice(0, 10);
const SLOTS = ['07:00', '08:00', '09:00', '10:00', '11:00', '14:00', '16:00', '18:00'];

function SubscribeSheet({ plan, onClose }) {
  const nav = useNavigate();
  const loc = useSelector(selectLocation);
  const [months, setMonths] = useState(1);
  const [startDay, setStartDay] = useState(plusDays(1));
  const [timeSlot, setTimeSlot] = useState('08:00');
  const key = useMemo(() => `plan-${plan._id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, [plan._id]);
  const { data: q, isFetching } = usePlanQuoteQuery({ id: plan._id, months });
  const [subscribe, { isLoading }] = useSubscribePlanMutation();
  const address = loc.address || loc.label || '';

  async function go() {
    try {
      const r = await subscribe({ planId: plan._id, months, startDay, timeSlot, address: { text: address, lat: loc.lat, lng: loc.lng }, idempotencyKey: key }).unwrap();
      toast.success(`Subscribed. ${r.visits} visits are booked.`);
      nav('/my-plans');
    } catch (e) { toast.error(e?.data?.error || 'Could not subscribe. Try again.'); }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <motion.div initial={{ y: 48 }} animate={{ y: 0 }} exit={{ y: 48 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }} onClick={(e) => e.stopPropagation()} className="w-full space-y-4 rounded-t-3xl bg-white p-5 sm:max-w-md sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-semibold text-slate-500">{plan.provider.name}</p><h3 className="text-lg font-extrabold text-[#0F172A]">{plan.name}</h3></div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400"><X size={20} /></button>
        </div>
        {plan.type === 'monthly' && (
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="How many months">
            {plan.durations.map((d) => (
              <button key={d.months} type="button" role="radio" aria-checked={months === d.months} onClick={() => setMonths(d.months)}
                className={`relative rounded-2xl border p-2.5 text-center ${months === d.months ? 'border-zappy-500 bg-zappy-50' : 'border-slate-200'}`}>
                <span className="block text-sm font-extrabold">{d.months} {d.months === 1 ? 'month' : 'months'}</span>
                <span className={`block text-[11px] font-bold ${d.discountPct ? 'text-emerald-700' : 'text-slate-400'}`}>{d.discountPct ? `${d.discountPct}% off` : 'Monthly'}</span>
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-slate-600">Start on<input type="date" className="input mt-1 w-full text-sm" min={today()} max={plusDays(30)} value={startDay} onChange={(e) => setStartDay(e.target.value)} /></label>
          <label className="text-xs font-semibold text-slate-600">Time<select className="input mt-1 w-full text-sm" value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)}>{SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        </div>
        <p className="truncate text-xs text-slate-500">At {address || 'your saved location'}</p>
        <div className="rounded-2xl bg-slate-50 p-3 text-sm">
          {isFetching || !q ? <div className="h-12 animate-pulse rounded bg-slate-200" /> : (
            <dl className="space-y-1">
              <div className="flex justify-between"><dt className="text-slate-600">{plan.type === 'pack' ? 'Pack' : 'Plan, a month'}</dt><dd className="font-semibold">{rupees(q.monthlyPaise)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-600">Platform fee{plan.type === 'pack' ? '' : ', a month'}</dt><dd className="font-semibold">{rupees(q.platformFeePaise)}</dd></div>
              <div className="flex justify-between border-t border-slate-200 pt-1 font-extrabold"><dt>Total{months > 1 ? ` for ${months} months` : ''}</dt><dd>{rupees(q.totalPaise)}</dd></div>
            </dl>
          )}
        </div>
        <p className="text-[12px] leading-relaxed text-slate-500">Pay {plan.provider.name} in cash or UPI at the first visit of each month. Each visit starts only with the code in your app. A missed visit is made up for free{plan.pauseDaysPerMonth ? `, and you can pause ${plan.pauseDaysPerMonth} days a month` : ''}.</p>
        <button type="button" onClick={go} disabled={isLoading || !q || !address} className="btn-primary w-full">{isLoading ? <Loader2 size={15} className="animate-spin" /> : <CalendarCheck size={16} />} Subscribe</button>
      </motion.div>
    </motion.div>
  );
}

// Monthly plans and packs from verified partners who come to this address, cheapest per visit first.
export default function PlansNear({ vertical, providerId = null, title = 'Monthly plans near you' }) {
  const loc = useSelector(selectLocation);
  const hasLocation = useSelector(selectHasLocation);
  // Without a service (the home) it shows plans near the customer across every service.
  const one = usePlansNearQuery({ vertical, lat: loc.lat, lng: loc.lng }, { skip: !hasLocation || !vertical });
  const any = usePlansNearAnyQuery({ lat: loc.lat, lng: loc.lng }, { skip: !hasLocation || !!vertical });
  const data = vertical ? one.data : any.data;
  const [open, setOpen] = useState(null);
  const plans = (data?.items || []).filter((p) => !providerId || p.provider.id === providerId);
  if (!plans.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1.5 text-lg font-extrabold text-[#0F172A]"><Repeat size={18} className="text-zappy-600" /> {title}</h2>
      <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
        {plans.map((p, i) => (
          <motion.button key={p._id} type="button" onClick={() => setOpen(p)} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 6) * 0.05 }} whileTap={{ scale: 0.97 }}
            className="card w-64 shrink-0 snap-start text-left hover:shadow-md">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zappy-700">{p.type === 'pack' ? 'One-day pack' : `${p.visitsPerMonth} visits a month`}</p>
            <p className="mt-0.5 line-clamp-2 font-bold text-[#0F172A]">{p.name}</p>
            <p className="mt-1 flex items-center gap-1 text-[12px] text-slate-500">{p.provider.name}{p.provider.rating != null && <><Star size={11} className="fill-amber-400 text-amber-400" />{p.provider.rating.toFixed(1)}</>}</p>
            <div className="mt-2 flex items-end justify-between">
              <span><span className="text-xl font-extrabold text-[#0F172A]">{rupees(p.pricePaise)}</span><span className="text-[12px] text-slate-500">{p.type === 'monthly' ? '/month' : ''}</span></span>
              {p.type === 'monthly' && <span className="text-[11px] font-bold text-slate-500">{rupees(p.perVisitPaise)} a visit</span>}
            </div>
            {p.savingsPct ? <p className="mt-1 text-[11px] font-bold text-emerald-700">{p.savingsPct}% less than booking each visit</p> : null}
          </motion.button>
        ))}
      </div>
      <AnimatePresence>{open && <SubscribeSheet plan={open} onClose={() => setOpen(null)} />}</AnimatePresence>
    </section>
  );
}
