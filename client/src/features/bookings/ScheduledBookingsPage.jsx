import { useSafeBack } from '../../hooks/useBookingFlow';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, ChevronRight, X } from 'lucide-react';
import { useRescheduleOrderMutation, useGetEventBookingsQuery } from '@shared/services/api';
import { useMyJobs } from './useMyJobs';
import { serviceLabel } from '@shared/constants/services';

function RescheduleSheet({ order, onClose }) {
  const [dateTime, setDateTime] = useState('');
  const [reschedule, { isLoading }] = useRescheduleOrderMutation();
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await reschedule({ id: order._id, scheduledAt: new Date(dateTime).toISOString() }).unwrap();
      onClose();
    } catch (err) {
      setError(err?.data?.error || 'Failed to reschedule');
    }
  }

  const minDateTime = new Date(Date.now() + 30 * 60000).toISOString().slice(0, 16);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-t-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Reschedule Booking</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-slate-500">{serviceLabel(order.service)}</p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">New date &amp; time</label>
            <input
              type="datetime-local"
              value={dateTime}
              min={minDateTime}
              onChange={e => setDateTime(e.target.value)}
              required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zappy-400"
            />
          </div>
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <button
            type="submit"
            disabled={!dateTime || isLoading}
            className="w-full py-2.5 rounded-xl bg-zappy-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {isLoading ? 'Saving…' : 'Confirm Reschedule'}
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Every booking with a date ahead: repairs, pet care, helping tasks and
 * events (from the same job list the rest of the app reads), soonest first.
 * Each opens its booking; older orders can still be rescheduled here.
 */
export default function ScheduledBookingsPage() {
  const nav = useNavigate();
  // Back to the previous page, or to /orders when this page was opened directly.
  const goBack = useSafeBack('/orders');
  const { active, isLoading } = useMyJobs();
  const { data: eventData, isLoading: eventsLoading } = useGetEventBookingsQuery(1);
  const [rescheduling, setRescheduling] = useState(null);

  const now = Date.now();
  const scheduled = [
    ...active.map((j) => {
      const at = j.raw?.scheduledAt || j.raw?.checkInAt || null;
      return at && new Date(at).getTime() > now - 3600000
        ? { key: `${j.kind}-${j.id}`, kind: j.kind, title: j.title, when: at, href: j.href, order: j.kind === 'order' ? j.raw : null }
        : null;
    }),
    ...(eventData?.bookings || [])
      .filter((b) => b.eventDate && !['cancelled', 'completed'].includes(b.status) && new Date(b.eventDate).getTime() > now - 86400000)
      .map((b) => ({ key: `event-${b._id}`, kind: 'event', title: b.themeId?.title || 'Event décor', when: b.eventDate, slot: b.eventTimeSlot, href: `/events/bookings/${b._id}` })),
  ].filter(Boolean).sort((a, b) => new Date(a.when) - new Date(b.when));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => goBack()} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-semibold text-slate-800">Scheduled Bookings</h1>
      </header>

      {isLoading || eventsLoading ? (
        <div className="flex items-center justify-center h-60">
          <div className="w-7 h-7 rounded-full border-2 border-zappy-200 border-t-zappy-600 animate-spin" />
        </div>
      ) : scheduled.length === 0 ? (
        <div className="text-center py-16 text-slate-400 px-6">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No upcoming scheduled bookings</p>
          <p className="text-xs mt-1">When you book a service for a later date, it appears here</p>
          <button type="button" onClick={() => nav('/services')} className="mt-4 rounded-xl bg-zappy-600 px-4 py-2 text-sm font-semibold text-white">Book a service</button>
        </div>
      ) : (
        <div className="mx-auto max-w-2xl p-4 space-y-3">
          {scheduled.map((o) => {
            const dt = new Date(o.when);
            return (
              <div key={o.key} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
                <button type="button" onClick={() => nav(o.href)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="flex-shrink-0 w-12 h-12 rounded-xl bg-zappy-50 flex flex-col items-center justify-center">
                    <span className="text-lg font-bold text-zappy-600 leading-none">{dt.getDate()}</span>
                    <span className="text-xs text-zappy-400">{dt.toLocaleDateString('en-IN', { month: 'short' })}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{o.title}</span>
                    <span className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {o.slot || dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      <span className="ml-1 capitalize">· {o.kind === 'order' ? 'service' : o.kind}</span>
                    </span>
                  </span>
                </button>
                {o.order ? (
                  <button onClick={() => setRescheduling(o.order)}
                    className="flex items-center gap-1 text-xs text-zappy-600 font-medium px-2 py-1 rounded-lg hover:bg-zappy-50">
                    Reschedule <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : <ChevronRight className="w-4 h-4 shrink-0 text-slate-300" />}
              </div>
            );
          })}
        </div>
      )}

      {rescheduling && (
        <RescheduleSheet order={rescheduling} onClose={() => setRescheduling(null)} />
      )}
    </div>
  );
}
