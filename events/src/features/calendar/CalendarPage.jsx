import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Lock, Unlock, Loader2, X } from 'lucide-react';
import { usePartnerCalendarQuery, useBlockEventDateMutation, useUnblockEventDateMutation } from '@shared/services/api';
import { PageHeader, Spinner, Card } from '../../components/ui';
import { StatusChip } from '../bookings/status';
import { longDate, ymd } from '../../lib/format';

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * A month at a time. Booked days show what is on; blocked days stop customers
 * from picking them (the customer's date picker reads the same data). A day
 * with a booking cannot be blocked: cancel or reschedule the booking first.
 */
export default function CalendarPage() {
  const { data, isLoading } = usePartnerCalendarQuery();
  const [block, { isLoading: blocking }] = useBlockEventDateMutation();
  const [unblock, { isLoading: unblocking }] = useUnblockEventDateMutation();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [picked, setPicked] = useState(null);

  const blocked = useMemo(() => new Set((data?.blockedDates || []).map(ymd)), [data]);
  const byDay = useMemo(() => {
    const m = new Map();
    for (const b of data?.bookings || []) { const k = ymd(b.eventDate); m.set(k, [...(m.get(k) || []), b]); }
    return m;
  }, [data]);

  if (isLoading) return <Spinner />;

  const today = ymd(new Date());
  const first = new Date(month);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  const isCurrentMonth = month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth();

  const pk = picked ? ymd(picked) : null;
  const pickedBookings = pk ? byDay.get(pk) || [] : [];
  const pickedBlocked = pk ? blocked.has(pk) : false;

  async function toggle() {
    try {
      if (pickedBlocked) { await unblock(pk).unwrap(); toast.success('Date opened for bookings'); } else { await block({ date: pk }).unwrap(); toast.success('Date blocked'); }
    } catch (e) { toast.error(e?.data?.error || 'Could not update'); }
  }

  return (
    <div>
      <PageHeader title="Calendar" subtitle="Block the days you can't take bookings. Customers can't pick them." />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" aria-label="Previous month" disabled={isCurrentMonth} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              className="flex h-10 w-10 items-center justify-center rounded-btn border border-line disabled:opacity-30"><ChevronLeft size={18} /></button>
            <p className="text-[16px] font-bold text-ink-900">{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
            <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              className="flex h-10 w-10 items-center justify-center rounded-btn border border-line"><ChevronRight size={18} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[12px] font-semibold text-ink-500">{WEEK.map((d) => <span key={d} className="py-1">{d}</span>)}</div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <span key={`e${i}`} />;
              const k = ymd(d);
              const past = k < today;
              const booked = byDay.has(k);
              const isBlocked = blocked.has(k);
              const sel = k === pk;
              return (
                <button key={k} type="button" disabled={past} onClick={() => setPicked(d)} aria-pressed={sel}
                  aria-label={`${longDate(d)}${booked ? ', booked' : isBlocked ? ', blocked' : ''}`}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-btn text-[14px] font-semibold transition-colors
                    ${past ? 'text-ink-300' : booked ? 'bg-zappy-600 text-white' : isBlocked ? 'bg-sunken text-ink-400 line-through' : 'text-ink-900 hover:bg-sunken'}
                    ${sel ? 'ring-2 ring-amber-400 ring-offset-1' : ''} ${k === today && !booked ? 'border border-zappy-600' : ''}`}>
                  {d.getDate()}
                  {booked && byDay.get(k).length > 1 && <span className="absolute bottom-1 text-[9px] font-bold">{byDay.get(k).length}</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-[12px] text-ink-500">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-zappy-600" /> Booked</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-sunken" /> Blocked</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-zappy-600" /> Today</span>
          </div>
        </Card>

        <Card className="p-4">
          {!picked ? (
            <p className="text-[14px] text-ink-500">Pick a day to block it, open it again, or see what is booked.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[16px] font-bold text-ink-900">{longDate(picked)}</p>
                <button type="button" onClick={() => setPicked(null)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-btn hover:bg-sunken"><X size={16} /></button>
              </div>
              {pickedBookings.length ? (
                <>
                  <ul className="space-y-2">
                    {pickedBookings.map((b) => (
                      <li key={b._id}>
                        <Link to={`/partner/bookings/${b._id}`} className="block rounded-btn border border-line p-3 hover:border-line-strong">
                          <span className="block text-[14px] font-semibold text-ink-900">{b.themeId?.title || 'Event'}</span>
                          <span className="mt-1 flex items-center gap-2 text-[13px] text-ink-500">{b.eventTimeSlot} <StatusChip status={b.status} /></span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[12px] text-ink-500">A day with a booking can't be blocked.</p>
                </>
              ) : (
                <>
                  <p className="text-[14px] text-ink-500">{pickedBlocked ? 'Blocked: customers cannot book you on this day.' : 'Open: customers can book you on this day.'}</p>
                  <button type="button" onClick={toggle} disabled={blocking || unblocking} className={pickedBlocked ? 'btn-primary w-full' : 'btn-outline w-full'}>
                    {(blocking || unblocking) ? <Loader2 size={16} className="animate-spin" /> : pickedBlocked ? <Unlock size={16} /> : <Lock size={16} />}
                    {pickedBlocked ? 'Open this day' : 'Block this day'}
                  </button>
                </>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
