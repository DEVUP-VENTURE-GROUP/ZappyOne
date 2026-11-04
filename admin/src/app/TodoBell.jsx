import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Bell, Check, ChevronRight } from 'lucide-react';
import { useAdminTodoQuery, useAdminOpsAlertDoneMutation } from '@shared/services/api';

const when = (at) => new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

// A short tone for urgent alerts; browsers allow it once the admin has clicked anywhere on the page.
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.35);
  } catch { /* sound is a bonus */ }
}

function notify(title, body) {
  try { if (window.Notification?.permission === 'granted') new window.Notification(title, { body }); } catch { /* notifications are a bonus */ }
}

// What is waiting on someone (server admin/todo.service) and urgent alerts (admin/ops-alerts), checked every 20 seconds; anything new pops a toast and, when allowed, a browser notification.
export default function TodoBell({ onOpen }) {
  const { data } = useAdminTodoQuery(undefined, { pollingInterval: 20000 });
  const [markDone, { isLoading: closing }] = useAdminOpsAlertDoneMutation();
  const [open, setOpen] = useState(false);
  const last = useRef(null);
  const seen = useRef(null);
  const items = data?.items || [];
  const alerts = data?.alerts || [];
  const total = data?.total || 0;
  const urgent = alerts.some((a) => a.urgent);

  useEffect(() => {
    if (data == null) return;
    const ids = new Set(alerts.map((a) => a.id));
    if (seen.current) {
      const fresh = alerts.filter((a) => !seen.current.has(a.id));
      for (const a of fresh.slice(0, 3)) {
        toast.error(a.title, { duration: 10000 });
        notify(`ZappyOne: ${a.title}`, a.body);
      }
      if (fresh.some((a) => a.urgent)) { beep(); setOpen(true); }
    }
    seen.current = ids;
    const queued = total - alerts.length;
    if (last.current != null && queued > last.current) {
      const msg = `${queued - last.current} new item${queued - last.current === 1 ? '' : 's'} waiting for you`;
      toast(msg);
      notify('ZappyOne admin', msg);
    }
    last.current = queued;
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle() {
    setOpen((v) => !v);
    try { if (window.Notification?.permission === 'default') window.Notification.requestPermission(); } catch { /* not supported */ }
  }

  async function done(a) {
    try { await markDone({ id: a.id }).unwrap(); toast.success('Marked done'); } catch (err) { toast.error(err?.data?.error || 'Could not mark it done. Try again.'); }
  }

  const tone = urgent
    ? { background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.45)' }
    : { background: total ? 'rgba(99,102,241,0.14)' : 'rgba(255,255,255,0.04)', border: `1px solid ${total ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.06)'}` };

  return (
    <div className="px-4 pt-2.5">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left" style={tone}>
        {urgent ? <AlertTriangle size={13} className="text-red-300" /> : <Bell size={13} className={total ? 'text-indigo-300' : 'text-slate-500'} />}
        <span className={`flex-1 text-[11.5px] font-semibold ${urgent ? 'text-red-100' : total ? 'text-indigo-100' : 'text-slate-500'}`}>
          {urgent ? 'Urgent' : total ? 'To do' : 'Nothing waiting'}
        </span>
        {total > 0 && <span className={`rounded-full px-1.5 text-[10.5px] font-black text-white ${urgent ? 'bg-red-500' : 'bg-indigo-500'}`}>{total > 99 ? '99+' : total}</span>}
      </button>
      {open && (alerts.length > 0 || items.length > 0) && (
        <ul className="mt-1.5 space-y-0.5 rounded-lg p-1" style={{ background: 'rgba(255,255,255,0.03)' }} aria-live="polite">
          {alerts.map((a) => (
            <li key={a.id} className={`rounded-md px-2 py-1.5 ${a.urgent ? 'bg-red-500/10' : 'bg-white/5'}`}>
              <div className="flex items-start gap-2">
                <AlertTriangle size={12} className={`mt-0.5 shrink-0 ${a.urgent ? 'text-red-300' : 'text-amber-300'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] font-bold text-white">{a.title}</p>
                  {a.body && <p className="mt-0.5 text-[11px] leading-snug text-slate-300">{a.body}</p>}
                  <p className="mt-0.5 text-[10.5px] tabular-nums text-slate-500">{when(a.at)}{a.reference ? ` · ${a.reference}` : ''}</p>
                </div>
                <button type="button" onClick={() => done(a)} disabled={closing} aria-label={`Mark done: ${a.title}`}
                  className="flex shrink-0 items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[10.5px] font-bold text-white hover:bg-white/20 disabled:opacity-50">
                  <Check size={11} /> Done
                </button>
              </div>
            </li>
          ))}
          {items.map((it) => (
            <li key={it.key}>
              <button type="button" onClick={() => { setOpen(false); onOpen(it.tab); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] text-slate-300 hover:bg-white/5">
                <span className="min-w-[22px] rounded bg-white/10 px-1 text-center text-[10.5px] font-bold text-white">{it.count}</span>
                <span className="flex-1">{it.label}</span>
                <ChevronRight size={12} className="text-slate-500" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
