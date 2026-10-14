import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, CalendarOff, X } from 'lucide-react';
import { useWorkerHoursQuery, useSaveWorkerHoursMutation } from '../../services/api';
import AutoAcceptCard from '../../components/provider/AutoAcceptCard';

/**
 * My hours — the week a worker takes work, and their days off (server jobs/work-hours).
 * Bookings made for later come to them inside these hours even when they are
 * offline; never on a day off. Jobs for right now still need them online.
 */
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_WEEK = DAYS.map((_, day) => ({ day, on: day !== 0, from: '09:00', to: '19:00' }));
const todayKey = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

export default function WorkerHoursPage() {
  const nav = useNavigate();
  const { data, isLoading } = useWorkerHoursQuery();
  const [save, { isLoading: saving }] = useSaveWorkerHoursMutation();
  const [week, setWeek] = useState(DEFAULT_WEEK);
  const [daysOff, setDaysOff] = useState([]);
  const [acceptLater, setAcceptLater] = useState(true);
  const [pick, setPick] = useState('');

  useEffect(() => {
    const h = data?.hours;
    if (h?.week?.length) { setWeek(h.week); setDaysOff(h.daysOff || []); setAcceptLater(h.acceptLater !== false); }
  }, [data]);

  const setDay = (day, patch) => setWeek((w) => w.map((d) => (d.day === day ? { ...d, ...patch } : d)));
  const addOff = () => { if (pick && pick >= todayKey() && !daysOff.includes(pick)) setDaysOff((d) => [...d, pick].sort()); setPick(''); };

  async function submit() {
    try { const r = await save({ week, daysOff, acceptLater }).unwrap(); toast.success(r.message); } catch (err) { toast.error(err?.data?.error || 'Could not save your hours'); }
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-28">
      <header className="page-header"><div className="page-header-inner">
        <button type="button" onClick={() => nav(-1)} className="back-btn" aria-label="Back"><ArrowLeft size={18} strokeWidth={2.5} /></button>
        <h1 className="h-card">My hours</h1>
      </div></header>

      <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 lg:max-w-2xl">
        <p className="rounded-2xl bg-zappy-50 px-4 py-3 text-[12.5px] leading-relaxed text-zappy-900">
          Customers who book for later are matched to you only inside these hours, even when you are offline, and never on your days off. Jobs for right now still need you online.
        </p>

        <AutoAcceptCard who="workers" />

        {isLoading ? <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-zappy-500" /></div> : (
          <>
            <section className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-100">
              {week.map((d) => (
                <div key={d.day} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <label className="flex w-32 items-center gap-2">
                    <input type="checkbox" checked={d.on} onChange={(e) => setDay(d.day, { on: e.target.checked })} className="h-4 w-4" />
                    <span className={`text-sm font-semibold ${d.on ? 'text-slate-900' : 'text-slate-400'}`}>{DAYS[d.day]}</span>
                  </label>
                  {d.on ? (
                    <div className="flex items-center gap-2 text-sm">
                      <input type="time" value={d.from} step={1800} onChange={(e) => setDay(d.day, { from: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1" />
                      <span className="text-slate-400">to</span>
                      <input type="time" value={d.to} step={1800} onChange={(e) => setDay(d.day, { to: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1" />
                    </div>
                  ) : <span className="text-[12.5px] text-slate-400">Not working</span>}
                </div>
              ))}
            </section>

            <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
              <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><CalendarOff size={15} /> Days off</p>
              <div className="mt-2 flex gap-2">
                <input type="date" value={pick} min={todayKey()} onChange={(e) => setPick(e.target.value)} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <button type="button" onClick={addOff} disabled={!pick} className="rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-40">Add</button>
              </div>
              {daysOff.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {daysOff.map((k) => (
                    <span key={k} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-semibold text-slate-700">
                      {new Date(`${k}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                      <button type="button" onClick={() => setDaysOff((d) => d.filter((x) => x !== k))} aria-label="Remove"><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
            </section>

            <label className="flex items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
              <input type="checkbox" checked={acceptLater} onChange={(e) => setAcceptLater(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>
                <span className="block text-sm font-semibold text-slate-900">Take bookings for later while I am offline</span>
                <span className="block text-[12px] text-slate-500">We send you a notification for each one inside your hours.</span>
              </span>
            </label>
          </>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-100 bg-white p-4">
        <button type="button" onClick={submit} disabled={saving || isLoading}
          className="mx-auto flex w-full max-w-lg items-center justify-center gap-2 rounded-2xl bg-[#0F172A] py-3.5 text-sm font-bold text-white disabled:opacity-50">
          {saving && <Loader2 size={15} className="animate-spin" />} Save my hours
        </button>
      </div>
    </div>
  );
}
