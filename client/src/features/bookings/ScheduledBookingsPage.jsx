import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, CalendarDays, Clock, ChevronRight, X, Loader2, CalendarPlus, CalendarClock, Radio, Wrench, Repeat2,
  Smartphone, PawPrint, ShoppingBag, PartyPopper, MapPin,
} from 'lucide-react';
import {
  useRescheduleOrderMutation, useGetEventBookingsQuery, useJobOptionsQuery, useRescheduleJobMutation,
  useMyRepeatsQuery, useRepeatActionMutation,
} from '@shared/services/api';
import { useSafeBack } from '../../hooks/useBookingFlow';
import { useMyJobs } from '@shared/customer/useMyJobs';
import { serviceVisual } from './OrdersListPage';

/**
 * Your schedule — everything booked, in time order, in one place.
 *
 *   happening now   live bookings made for now: one tap to track them
 *   next up         the soonest booking ahead, with a live countdown
 *   by day          Today, Tomorrow, then dates: every booking ahead
 *
 * Each booking ahead can be added to the phone's calendar, and moved (repairs,
 * pet care, helping: jobs/reschedule; older service orders: their own route)
 * from a sheet of days and times. Whether it can move, and why not, is the
 * server's answer, never guessed here.
 */

const DAY_MS = 86400000;
const LEAD_MIN = 30;
const KIND_LABEL = { repair: 'Repair', pet: 'Pet care', helping: 'Helping', order: 'Service', event: 'Event' };

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
function dayLabel(d) {
  const diff = Math.round((startOfDay(d) - startOfDay(new Date())) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}
const timeLabel = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

function untilLabel(ms) {
  if (ms <= 0) return 'Starting now';
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440); const h = Math.floor((m % 1440) / 60); const mm = m % 60;
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${mm}m`;
  return `in ${mm} min`;
}

/** An .ics file for the phone's calendar: the booking at its time, one hour long. */
function addToCalendar(item) {
  const start = new Date(item.when);
  const end = new Date(start.getTime() + 60 * 60000);
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s) => String(s || '').replace(/[,;\\]/g, (c) => `\\${c}`).replace(/\n/g, ' ');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ZappyOne//Booking//EN', 'BEGIN:VEVENT',
    `UID:${item.key}@zappyone.com`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(`ZappyOne · ${item.title}`)}`,
    `DESCRIPTION:${esc(`${KIND_LABEL[item.kind] || 'Booking'}${item.reference ? ` ${item.reference}` : ''}. Track it in the ZappyOne app.`)}`,
    ...(item.address ? [`LOCATION:${esc(item.address)}`] : []),
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Your ZappyOne booking is in 30 minutes', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url; a.download = `zappyone-${item.key}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ */

export default function ScheduledBookingsPage() {
  const nav = useNavigate();
  const goBack = useSafeBack('/orders');
  const { active, isLoading } = useMyJobs();
  const { data: eventData, isLoading: eventsLoading } = useGetEventBookingsQuery(1);
  const [moving, setMoving] = useState(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const { live, ahead } = useMemo(() => {
    const items = active.map((j) => {
      const at = j.raw?.scheduledAt || j.raw?.checkInAt || null;
      return {
        key: `${j.kind}-${j.id}`, id: j.id, kind: j.kind, title: j.title, stage: j.stage, reference: j.reference,
        iconCode: j.iconCode, href: j.href, address: j.address, when: at,
        // Booked for later: a time well past when it was booked ("now" bookings carry their own moment).
        later: !!at && new Date(at).getTime() > now - 3600000
          && new Date(at).getTime() - new Date(j.raw?.createdAt || 0).getTime() > 15 * 60000,
        order: j.kind === 'order' ? j.raw : null,
      };
    });
    const events = (eventData?.bookings || [])
      .filter((b) => b.eventDate && !['cancelled', 'completed'].includes(b.status) && new Date(b.eventDate).getTime() > now - DAY_MS)
      .map((b) => ({
        key: `event-${b._id}`, id: b._id, kind: 'event', title: b.themeId?.title || 'Event décor', iconCode: 'event',
        when: b.eventDate, slot: b.eventTimeSlot, href: `/events/bookings/${b._id}`, later: true, address: b.venue?.address || '',
      }));
    return {
      live: items.filter((i) => !i.later),
      ahead: [...items.filter((i) => i.later), ...events].sort((a, b) => new Date(a.when) - new Date(b.when)),
    };
  }, [active, eventData, now]);

  const next = ahead[0] || null;
  const days = useMemo(() => {
    const out = [];
    for (const item of ahead.slice(1)) {
      const label = dayLabel(item.when);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(item); else out.push({ label, items: [item] });
    }
    return out;
  }, [ahead]);

  const { data: repeatData } = useMyRepeatsQuery();
  const repeats = repeatData?.plans || [];
  const loading = isLoading || eventsLoading;
  const empty = !loading && !live.length && !ahead.length && !repeats.length;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button type="button" onClick={() => goBack()} className="rounded-full p-1.5 hover:bg-slate-100" aria-label="Back">
            <ArrowLeft className="h-5 w-5 text-slate-700" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-bold text-navy">Your schedule</h1>
            {!loading && !empty && (
              <p className="text-[12px] text-slate-500">
                {ahead.length ? `${ahead.length} booking${ahead.length > 1 ? 's' : ''} ahead` : 'Nothing booked ahead'}
                {live.length ? ` · ${live.length} happening now` : ''}
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 pt-4">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-white ring-1 ring-slate-100" />)}
          </div>
        ) : empty ? (
          <EmptySchedule onBook={(href) => nav(href)} />
        ) : (
          <>
            {live.length > 0 && (
              <section>
                <SectionTitle Icon={Radio} tone="text-emerald-600">Happening now</SectionTitle>
                <div className="space-y-2">
                  {live.map((item) => <LiveRow key={item.key} item={item} onOpen={() => nav(item.href)} />)}
                </div>
              </section>
            )}

            {next && (
              <section>
                <SectionTitle Icon={CalendarClock}>Next up</SectionTitle>
                <NextUpCard item={next} now={now} onOpen={() => nav(next.href)} onMove={() => setMoving(next)} />
              </section>
            )}

            {days.map((day) => (
              <section key={day.label}>
                <SectionTitle>{day.label}</SectionTitle>
                <div className="space-y-2">
                  {day.items.map((item) => (
                    <BookingRow key={item.key} item={item} onOpen={() => nav(item.href)} onMove={() => setMoving(item)} />
                  ))}
                </div>
              </section>
            ))}

            {repeats.length > 0 && (
              <section>
                <SectionTitle Icon={Repeat2}>Repeats</SectionTitle>
                <div className="space-y-2">{repeats.map((p) => <RepeatRow key={p._id} plan={p} />)}</div>
              </section>
            )}

            <PlanAhead onBook={(href) => nav(href)} />
          </>
        )}
      </main>

      <AnimatePresence>
        {moving && <MoveSheet key={moving.key} item={moving} onClose={() => setMoving(null)} />}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SectionTitle({ children, Icon, tone = 'text-slate-400' }) {
  return (
    <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-slate-500">
      {Icon && <Icon size={13} className={tone} />} {children}
    </h2>
  );
}

function KindIcon({ item, size = 18, className = '' }) {
  const Icon = serviceVisual(item.iconCode || item.kind) || Wrench;
  return <Icon size={size} className={className} />;
}

function LiveRow({ item, onOpen }) {
  return (
    <button type="button" onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left ring-1 ring-emerald-100 transition hover:ring-emerald-300">
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
        <KindIcon item={item} />
        <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold capitalize text-navy">{item.title}</span>
        <span className="block truncate text-[12px] text-slate-500">{item.stage || 'In progress'}</span>
      </span>
      <span className="shrink-0 rounded-full bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white">Track</span>
    </button>
  );
}

function NextUpCard({ item, now, onOpen, onMove }) {
  const at = new Date(item.when);
  const ms = at.getTime() - now;
  const movable = item.kind !== 'event';
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-3xl bg-gradient-to-br from-zappy-600 to-zappy-800 text-white shadow-[0_18px_40px_-22px_rgba(31,79,216,0.8)]">
      <button type="button" onClick={onOpen} className="block w-full p-5 text-left">
        <div className="flex items-start gap-4">
          <span className="flex w-16 shrink-0 flex-col items-center rounded-2xl bg-white/15 py-2 ring-1 ring-white/20">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/70">{at.toLocaleDateString('en-IN', { month: 'short' })}</span>
            <span className="text-[26px] font-extrabold leading-none tabular-nums">{at.getDate()}</span>
            <span className="mt-0.5 text-[11px] font-medium text-white/70">{at.toLocaleDateString('en-IN', { weekday: 'short' })}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold">
              <KindIcon item={item} size={12} /> {KIND_LABEL[item.kind] || 'Booking'}
            </span>
            <span className="mt-1.5 block truncate text-[18px] font-bold capitalize leading-snug">{item.title}</span>
            <span className="mt-1 flex items-center gap-1.5 text-[13px] text-white/80">
              <Clock size={13} /> {dayLabel(at)} · {item.slot || timeLabel(at)}
            </span>
            {item.address && (
              <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-white/65">
                <MapPin size={12} className="shrink-0" /> <span className="truncate">{item.address}</span>
              </span>
            )}
          </span>
        </div>
        <span className="mt-4 flex items-center justify-between rounded-2xl bg-white/10 px-3.5 py-2.5">
          <span className="text-[12px] font-medium text-white/75">Starts</span>
          <span className="text-[15px] font-bold tabular-nums">{untilLabel(ms)}</span>
        </span>
      </button>
      <div className="flex border-t border-white/15">
        <button type="button" onClick={() => addToCalendar(item)}
          className="flex flex-1 items-center justify-center gap-1.5 py-3 text-[13px] font-semibold text-white/90 hover:bg-white/10">
          <CalendarPlus size={15} /> Add to calendar
        </button>
        {movable && (
          <button type="button" onClick={onMove}
            className="flex flex-1 items-center justify-center gap-1.5 border-l border-white/15 py-3 text-[13px] font-semibold text-white/90 hover:bg-white/10">
            <CalendarDays size={15} /> Change time
          </button>
        )}
      </div>
    </motion.div>
  );
}

function BookingRow({ item, onOpen, onMove }) {
  const at = new Date(item.when);
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-slate-100">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-zappy-50 py-1.5">
          <span className="text-[15px] font-bold leading-none tabular-nums text-zappy-700">{item.slot ? at.getDate() : timeLabel(at).split(' ')[0]}</span>
          <span className="mt-0.5 text-[10px] font-semibold uppercase text-zappy-500">
            {item.slot ? at.toLocaleDateString('en-IN', { month: 'short' }) : timeLabel(at).split(' ')[1]}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold capitalize text-navy">{item.title}</span>
          <span className="mt-0.5 flex items-center gap-1 text-[12px] text-slate-500">
            <KindIcon item={item} size={12} className="text-slate-400" /> {KIND_LABEL[item.kind] || 'Booking'}
            {item.slot ? ` · ${item.slot}` : ''}
          </span>
        </span>
      </button>
      <button type="button" onClick={() => addToCalendar(item)} aria-label="Add to calendar"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
        <CalendarPlus size={16} />
      </button>
      {item.kind !== 'event' ? (
        <button type="button" onClick={onMove}
          className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-zappy-700 hover:border-zappy-300">
          Change
        </button>
      ) : <ChevronRight size={16} className="shrink-0 text-slate-300" />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** The next 7 days and half-hour times from 8 am to 8 pm, from 30 minutes out. */
function useSlots() {
  return useMemo(() => {
    const earliest = Date.now() + LEAD_MIN * 60000;
    const out = [];
    for (let d = 0; d < 7; d += 1) {
      const day = startOfDay(Date.now() + d * DAY_MS);
      const times = [];
      for (let m = 8 * 60; m <= 20 * 60; m += 30) {
        const t = new Date(day.getTime() + m * 60000);
        if (t.getTime() >= earliest) times.push(t);
      }
      if (times.length) out.push({ day, times });
    }
    return out;
  }, []);
}

function MoveSheet({ item, onClose }) {
  const generic = ['repair', 'pet', 'helping'].includes(item.kind);
  const { data: options, isLoading: checking } = useJobOptionsQuery({ id: item.id, status: 'move' }, { skip: !generic });
  const [moveJob, { isLoading: movingJob }] = useRescheduleJobMutation();
  const [moveOrder, { isLoading: movingOrder }] = useRescheduleOrderMutation();
  const slots = useSlots();
  const [dayIdx, setDayIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const busy = movingJob || movingOrder;
  const rule = generic ? options?.reschedule : { allowed: true };

  async function confirm() {
    if (!picked) return;
    try {
      if (generic) {
        const r = await moveJob({ id: item.id, scheduledAt: picked.toISOString() }).unwrap();
        toast.success(r.message);
      } else {
        await moveOrder({ id: item.id, scheduledAt: picked.toISOString() }).unwrap();
        toast.success(`Moved to ${dayLabel(picked)}, ${timeLabel(picked)}`);
      }
      onClose();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not change the time');
    }
  }

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:max-w-md sm:rounded-3xl"
        initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-zappy-700">Change time</p>
            <h2 className="truncate text-[17px] font-bold capitalize text-navy">{item.title}</h2>
            <p className="text-[12.5px] text-slate-500">Now {dayLabel(item.when)}, {timeLabel(item.when)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
        </div>

        {generic && checking ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-zappy-500" /></div>
        ) : !rule?.allowed ? (
          <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-[13px] leading-relaxed text-amber-900">
            {rule?.reason || 'This booking cannot be moved now.'}
          </div>
        ) : (
          <>
            <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1">
              {slots.map((s, i) => (
                <button key={s.day.toISOString()} type="button" onClick={() => { setDayIdx(i); setPicked(null); }}
                  className={`flex w-[62px] shrink-0 flex-col items-center rounded-2xl border py-2 transition ${dayIdx === i ? 'border-zappy-600 bg-zappy-600 text-white' : 'border-slate-200 text-slate-700 hover:border-zappy-300'}`}>
                  <span className={`text-[11px] font-semibold ${dayIdx === i ? 'text-white/80' : 'text-slate-500'}`}>
                    {i === 0 && startOfDay(new Date()).getTime() === s.day.getTime() ? 'Today' : s.day.toLocaleDateString('en-IN', { weekday: 'short' })}
                  </span>
                  <span className="text-[18px] font-bold leading-tight tabular-nums">{s.day.getDate()}</span>
                  <span className={`text-[10px] font-semibold uppercase ${dayIdx === i ? 'text-white/70' : 'text-slate-400'}`}>{s.day.toLocaleDateString('en-IN', { month: 'short' })}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {(slots[dayIdx]?.times || []).map((t) => {
                const on = picked?.getTime() === t.getTime();
                return (
                  <button key={t.toISOString()} type="button" onClick={() => setPicked(t)}
                    className={`rounded-xl border py-2 text-[13px] font-semibold tabular-nums transition ${on ? 'border-zappy-600 bg-zappy-50 text-zappy-700 ring-2 ring-zappy-200' : 'border-slate-200 text-slate-700 hover:border-zappy-300'}`}>
                    {timeLabel(t)}
                  </button>
                );
              })}
            </div>
            {generic && rule?.left != null && (
              <p className="mt-3 text-[12px] text-slate-500">
                You can change the time {rule.left} more time{rule.left === 1 ? '' : 's'}. If someone is already coming, we tell them at once.
              </p>
            )}
            <button type="button" onClick={confirm} disabled={!picked || busy}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-zappy-600 text-[14px] font-bold text-white disabled:opacity-40">
              {busy && <Loader2 size={16} className="animate-spin" />}
              {picked ? `Move to ${dayLabel(picked)}, ${timeLabel(picked)}` : 'Pick a time'}
            </button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

/** A repeat (jobs/recurring): how often, the next one, and skip / pause / resume / stop. */
function RepeatRow({ plan }) {
  const [act, { isLoading }] = useRepeatActionMutation();
  const run = async (action, done) => {
    try { await act({ planId: plan._id, action }).unwrap(); toast.success(done); } catch (err) { toast.error(err?.data?.error || 'Could not change it'); }
  };
  const paused = plan.status === 'paused';
  return (
    <div className="rounded-2xl bg-white p-3.5 ring-1 ring-slate-100">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${paused ? 'bg-slate-100 text-slate-400' : 'bg-zappy-50 text-zappy-600'}`}><Repeat2 size={18} /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold capitalize text-navy">{plan.title}</span>
          <span className="block text-[12px] text-slate-500">
            {plan.everyLabel[0].toUpperCase() + plan.everyLabel.slice(1)} · {paused ? 'paused' : `next ${plan.nextLabel}`}
          </span>
          {plan.lastError && !paused && <span className="block text-[11.5px] text-amber-700">Last try did not go through; we will try again.</span>}
        </span>
        {isLoading && <Loader2 size={16} className="animate-spin text-slate-400" />}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {!paused && <button type="button" disabled={isLoading} onClick={() => run('skip', 'Next one skipped')} className="rounded-full border border-slate-200 px-3 py-1 text-[12px] font-semibold text-slate-700">Skip next</button>}
        {paused
          ? <button type="button" disabled={isLoading} onClick={() => run('resume', 'Repeat resumed')} className="rounded-full border border-zappy-300 px-3 py-1 text-[12px] font-semibold text-zappy-700">Resume</button>
          : <button type="button" disabled={isLoading} onClick={() => run('pause', 'Repeat paused')} className="rounded-full border border-slate-200 px-3 py-1 text-[12px] font-semibold text-slate-700">Pause</button>}
        <button type="button" disabled={isLoading} onClick={() => run('stop', 'Repeat stopped')} className="rounded-full border border-red-200 px-3 py-1 text-[12px] font-semibold text-red-700">Stop</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const PLAN = [
  { href: '/repair', label: 'Phone repair', Icon: Smartphone },
  { href: '/pet', label: 'Pet care', Icon: PawPrint },
  { href: '/helping', label: 'Errands', Icon: ShoppingBag },
  { href: '/events', label: 'Event décor', Icon: PartyPopper },
];

function PlanAhead({ onBook }) {
  return (
    <section className="rounded-3xl bg-white p-4 ring-1 ring-slate-100">
      <p className="text-[14px] font-bold text-navy">Book something for later</p>
      <p className="mt-0.5 text-[12.5px] text-slate-500">Choose a day and time when you book. It shows up here.</p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {PLAN.map(({ href, label, Icon }) => (
          <button key={href} type="button" onClick={() => onBook(href)}
            className="flex flex-col items-center gap-1.5 rounded-2xl bg-slate-50 px-1 py-3 text-center transition hover:bg-zappy-50">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-zappy-600 ring-1 ring-slate-100"><Icon size={18} /></span>
            <span className="text-[11.5px] font-semibold leading-tight text-slate-700">{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function EmptySchedule({ onBook }) {
  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl bg-gradient-to-br from-zappy-50 via-white to-white p-6 text-center ring-1 ring-zappy-100">
        <div className="mx-auto grid w-40 grid-cols-7 gap-1" aria-hidden>
          {Array.from({ length: 21 }).map((_, i) => (
            <motion.span key={i} className={`h-4 rounded ${i === 10 ? 'bg-zappy-500' : 'bg-zappy-100'}`}
              initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.02 }} />
          ))}
        </div>
        <p className="mt-5 text-[17px] font-bold text-navy">Your schedule is clear</p>
        <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-slate-500">
          Book a service for a day and time that suits you. It shows up here with a countdown, and you can add it to your calendar or move it.
        </p>
      </motion.div>
      <PlanAhead onBook={onBook} />
    </div>
  );
}
