import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { CalendarDays, Check, ClipboardList, Loader2, Pause, Play, Plus, Repeat, Send, Users, X } from 'lucide-react';
import {
  useProviderPlanCatalogQuery, useProviderPlansQuery, useSaveProviderPlanMutation, useSubmitProviderPlanMutation, useSetProviderPlanLiveMutation,
  useProviderPlanSubscriptionsQuery, useProviderPlanVisitsQuery,
} from '@shared/services/api';
import VisitRow from '../components/PlanVisitRow';

const rupees = (p) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS = { draft: ['Draft', 'bg-slate-100 text-slate-700'], pending: ['In review', 'bg-amber-100 text-amber-800'], live: ['Live', 'bg-emerald-100 text-emerald-800'], paused: ['Paused', 'bg-slate-200 text-slate-700'], rejected: ['Not approved', 'bg-red-100 text-red-700'] };
const errOf = (e) => e?.data?.error || 'That did not go through. Try again.';
const dayLabel = (d) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

function PlanForm({ services, onClose }) {
  const [save, { isLoading: saving }] = useSaveProviderPlanMutation();
  const [submit, { isLoading: sending }] = useSubmitProviderPlanMutation();
  const [vertical, setVertical] = useState(services[0]?.vertical || '');
  const service = services.find((s) => s.vertical === vertical);
  const [f, setF] = useState({ name: '', type: 'monthly', visitsPerMonth: '26', weekdays: [1, 2, 3, 4, 5, 6], price: '', d3: '8', d5: '12', pauses: '4', description: '' });
  const [picked, setPicked] = useState({});
  const items = Object.entries(picked).filter(([, v]) => v).map(([k]) => { const [repairCode, brandCode] = k.split('|'); return { repairCode, brandCode }; });
  const perVisitStd = items.reduce((a, i) => a + (service?.items.find((x) => x.repairCode === i.repairCode)?.options.find((o) => o.brandCode === i.brandCode)?.totalPaise || 0), 0);
  const visits = f.type === 'pack' ? 1 : Number(f.visitsPerMonth) || 1;
  const price = Math.round(Number(f.price) * 100) || 0;
  const vsYours = perVisitStd ? Math.round((price / (perVisitStd * visits)) * 100) : null;

  async function go(andSubmit) {
    try {
      const body = { vertical, name: f.name.trim(), description: f.description.trim(), type: f.type, items, pricePaise: price, weekdays: f.type === 'pack' ? [] : f.weekdays,
        ...(f.type === 'monthly' && { visitsPerMonth: visits, durations: [{ months: 1, discountPct: 0 }, { months: 3, discountPct: Number(f.d3) || 0 }, { months: 5, discountPct: Number(f.d5) || 0 }], pauseDaysPerMonth: Number(f.pauses) || 0 }) };
      const { plan } = await save(body).unwrap();
      if (andSubmit) {
        const r = await submit(plan._id).unwrap();
        toast.success(r.plan.status === 'live' ? 'Your plan is live. Customers near you can subscribe now.' : 'Sent to ZappyOne for review.');
      } else toast.success('Saved as a draft');
      onClose();
    } catch (e) { toast.error(errOf(e)); }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }} onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:max-w-xl sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-extrabold text-slate-900">New plan</h3><button onClick={onClose} aria-label="Close" className="text-slate-400"><X size={20} /></button></div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[['monthly', 'Monthly plan', Repeat], ['pack', 'One-day pack', CalendarDays]].map(([k, l, I]) => (
              <button key={k} type="button" onClick={() => setF({ ...f, type: k })} className={`flex items-center gap-2 rounded-2xl border p-3 text-left text-sm font-bold ${f.type === k ? 'border-zappy-500 bg-zappy-50 text-zappy-800' : 'border-slate-200'}`}><I size={16} />{l}</button>
            ))}
          </div>
          <select className="input w-full text-sm" value={vertical} onChange={(e) => { setVertical(e.target.value); setPicked({}); }} aria-label="Service">
            {services.map((s) => <option key={s.vertical} value={s.vertical}>{s.name}</option>)}
          </select>
          <input className="input w-full text-sm" placeholder="Plan name, e.g. Daily clean 2 BHK" value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">{f.type === 'pack' ? 'Jobs in this pack' : 'Done on every visit'}</p>
            <div className="space-y-1.5">
              {service?.items.map((i) => (
                <div key={i.repairCode} className="rounded-xl border border-slate-200 p-2.5">
                  <p className="text-sm font-semibold text-slate-800">{i.name}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {i.options.map((o) => { const k = `${i.repairCode}|${o.brandCode}`; const on = !!picked[k]; return (
                      <button key={k} type="button" onClick={() => setPicked({ ...picked, [k]: !on })} aria-pressed={on} className={`rounded-full px-2.5 py-1 text-xs font-bold ${on ? 'bg-zappy-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                        {on && <Check size={11} className="mr-0.5 inline" />}{o.typeName} · {rupees(o.totalPaise)}
                      </button>
                    ); })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {f.type === 'monthly' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-600">Visits a month<input className="input mt-1 w-full text-sm" inputMode="numeric" value={f.visitsPerMonth} onChange={(e) => setF({ ...f, visitsPerMonth: e.target.value.replace(/\D/g, '') })} /></label>
                <label className="text-xs font-semibold text-slate-600">Pause days a month<input className="input mt-1 w-full text-sm" inputMode="numeric" value={f.pauses} onChange={(e) => setF({ ...f, pauses: e.target.value.replace(/\D/g, '') })} /></label>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-slate-600">Days you visit</p>
                <div className="flex gap-1">{DAYS.map((d, i) => { const on = f.weekdays.includes(i); return <button key={d} type="button" aria-pressed={on} onClick={() => setF({ ...f, weekdays: on ? f.weekdays.filter((x) => x !== i) : [...f.weekdays, i].sort() })} className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${on ? 'bg-[#0F172A] text-white' : 'bg-slate-100 text-slate-600'}`}>{d}</button>; })}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-600">Off for 3 months (%)<input className="input mt-1 w-full text-sm" inputMode="numeric" value={f.d3} onChange={(e) => setF({ ...f, d3: e.target.value.replace(/\D/g, '') })} /></label>
                <label className="text-xs font-semibold text-slate-600">Off for 5 months (%)<input className="input mt-1 w-full text-sm" inputMode="numeric" value={f.d5} onChange={(e) => setF({ ...f, d5: e.target.value.replace(/\D/g, '') })} /></label>
              </div>
            </>
          )}
          <label className="block text-xs font-semibold text-slate-600">{f.type === 'pack' ? 'Pack price (₹)' : 'Price a month (₹)'}<input className="input mt-1 w-full text-sm" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^\d.]/g, '') })} /></label>
          {vsYours != null && price > 0 && <p className="text-xs text-slate-500">That is {vsYours}% of your own single-visit prices for the same visits{f.type === 'monthly' ? ` (${rupees(Math.round(price / visits))} a visit)` : ''}.</p>}
          <textarea rows={2} className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="What the customer gets (optional)" maxLength={500} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <div className="flex gap-2">
            <button type="button" disabled={saving || sending || !items.length || f.name.trim().length < 3 || price < 100} onClick={() => go(false)} className="btn-secondary flex-1">Save draft</button>
            <button type="button" disabled={saving || sending || !items.length || f.name.trim().length < 3 || price < 100} onClick={() => go(true)} className="btn-primary flex-1">{sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Publish</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// A partner's plans: build them from jobs they have priced, see who subscribed, and run each visit with the customer's code and photos.
export default function ShopPlansPage() {
  const [tab, setTab] = useState('visits');
  const [creating, setCreating] = useState(false);
  const { data: catalog } = useProviderPlanCatalogQuery();
  const { data: plans, isLoading } = useProviderPlansQuery();
  const { data: subs } = useProviderPlanSubscriptionsQuery(undefined, { skip: tab !== 'customers' });
  const { data: visits } = useProviderPlanVisitsQuery({ days: 7 }, { skip: tab !== 'visits', pollingInterval: 60000 });
  const [setLive] = useSetProviderPlanLiveMutation();
  const [submit] = useSubmitProviderPlanMutation();
  const services = catalog?.services || [];
  const active = useMemo(() => (subs?.items || []).filter((s) => s.status === 'active'), [subs]);
  const TABS = [['visits', 'Visits', ClipboardList], ['plans', 'My plans', Repeat], ['customers', 'Customers', Users]];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div><h1 className="text-xl font-extrabold text-slate-900">Plans</h1><p className="text-sm text-slate-500">Monthly plans and packs at your price. Customers near you subscribe; you visit with their code.</p></div>
        <button type="button" onClick={() => setCreating(true)} disabled={!services.length} className="btn-primary shrink-0"><Plus size={16} /> New plan</button>
      </div>
      {!services.length && <p className="card text-sm text-slate-600">Price at least one job in Work &amp; prices first. Plans are built from the jobs you have priced.</p>}
      <div className="flex gap-1 rounded-2xl bg-slate-100 p-1" role="tablist">
        {TABS.map(([k, l, I]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="relative flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold">
            {tab === k && <motion.span layoutId="plans-tab" className="absolute inset-0 rounded-xl bg-white shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="relative flex items-center gap-1.5"><I size={15} />{l}</span>
          </button>
        ))}
      </div>

      {tab === 'visits' && (
        <ul className="space-y-2">
          {(visits?.items || []).map((v) => <VisitRow key={v._id} v={v} />)}
          {visits && !visits.items.length && <li className="card text-center text-sm text-slate-500">No plan visits in the next 7 days.</li>}
        </ul>
      )}

      {tab === 'plans' && (
        <ul className="space-y-2">
          {isLoading && <li className="card h-20 animate-pulse bg-slate-100" />}
          {(plans?.items || []).map((p) => {
            const [label, tone] = STATUS[p.status];
            return (
              <motion.li layout key={p._id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="font-bold text-slate-900">{p.name}</p><p className="text-xs text-slate-500">{p.type === 'pack' ? 'One-day pack' : `${p.visitsPerMonth} visits a month`} · {rupees(p.pricePaise)}{p.type === 'monthly' ? ' a month' : ''}</p></div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{label}</span>
                </div>
                {p.reviewNote && <p className="mt-1.5 text-xs text-slate-500">{p.reviewNote}</p>}
                <div className="mt-2 flex gap-2">
                  {p.status === 'live' && <button type="button" onClick={() => setLive({ id: p._id, live: false })} className="btn-secondary text-xs"><Pause size={13} /> Pause</button>}
                  {p.status === 'paused' && <button type="button" onClick={() => setLive({ id: p._id, live: true })} className="btn-secondary text-xs"><Play size={13} /> Resume</button>}
                  {['draft', 'rejected'].includes(p.status) && <button type="button" onClick={async () => { try { const r = await submit(p._id).unwrap(); toast.success(r.plan.status === 'live' ? 'Live now' : 'Sent for review'); } catch (e) { toast.error(errOf(e)); } }} className="btn-secondary text-xs"><Send size={13} /> Publish</button>}
                </div>
              </motion.li>
            );
          })}
          {plans && !plans.items.length && <li className="card text-center text-sm text-slate-500">No plans yet. Create one: customers love a fixed monthly price.</li>}
        </ul>
      )}

      {tab === 'customers' && (
        <ul className="space-y-2">
          <li className="text-xs font-semibold text-slate-500">{active.length} active {active.length === 1 ? 'customer' : 'customers'}</li>
          {(subs?.items || []).map((s) => (
            <li key={s._id} className="card flex items-center justify-between gap-2">
              <div className="min-w-0"><p className="font-bold text-slate-900">{s.snapshot.name}</p><p className="truncate text-xs text-slate-500">{s.address.text} · {s.timeSlot} · until {dayLabel(s.endDay)}</p></div>
              <div className="shrink-0 text-right"><p className="font-extrabold">{rupees(s.monthlyPaise)}</p><p className="text-[11px] capitalize text-slate-500">{s.status}</p></div>
            </li>
          ))}
        </ul>
      )}
      <AnimatePresence>{creating && <PlanForm services={services} onClose={() => setCreating(false)} />}</AnimatePresence>
    </div>
  );
}
