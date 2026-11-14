import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { mmss, waitingNow } from '../../customer/repairBill';

const rupees = (p) => `₹${(p / 100).toFixed(p % 100 ? 2 : 0)}`;

// The wait at the door, counting on the screen (the app's WaitingMeter): free time left, then what it adds. Ticks locally; no server calls.
export default function WaitingMeter({ booking, audience = 'pro', pro = 'pro' }) {
  const [now, setNow] = useState(Date.now());
  const w = waitingNow(booking, now);
  const live = !!w && !w.stopped;
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);
  if (!w || (audience === 'customer' && w.stopped && !w.paise)) return null;

  const rate = `${rupees(w.rule.perMinPaise)} a minute${w.rule.maxPaise > 0 ? `, at most ${rupees(w.rule.maxPaise)}` : ''}`;
  const free = w.freeLeftSec > 0 && !w.stopped;
  const text = audience === 'pro'
    ? (w.stopped ? ['Waiting ended at the code', w.paise ? `${rupees(w.paise)} added for you.` : 'No waiting charge.']
      : free ? [`Free waiting: ${mmss(w.freeLeftSec)} left`, `Then ${rate} is added for you.`]
        : [`Customer is late: ${w.billableMin} min`, `${rupees(w.paise)} added for you so far${w.capped ? ' (the most)' : ''}.`])
    : (w.stopped ? ['Waiting charge', `${rupees(w.paise)} for the extra minutes your ${pro} waited.`]
      : free ? [`Your ${pro} is at your door`, `Free waiting: ${mmss(w.freeLeftSec)} left, then ${rate}.`]
        : [`Your ${pro} has waited ${w.billableMin} extra min`, `${rupees(w.paise)} added to your bill${w.capped ? ' (the most)' : ''}. Give them your code to start.`]);
  const late = !free && w.paise > 0;

  return (
    <div role="status" aria-live="polite" className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${late ? 'border-amber-200 bg-amber-50' : 'border-zappy-100 bg-zappy-50'}`}>
      <Timer size={18} className={`mt-0.5 shrink-0 ${late ? 'text-amber-700' : 'text-zappy-700'}`} aria-hidden="true" />
      <span className="min-w-0">
        <span className={`block text-[14px] font-bold tabular-nums ${late ? 'text-amber-900' : 'text-zappy-900'}`}>{text[0]}</span>
        <span className={`mt-0.5 block text-[12.5px] ${late ? 'text-amber-800' : 'text-zappy-800'}`}>{text[1]}</span>
      </span>
    </div>
  );
}
