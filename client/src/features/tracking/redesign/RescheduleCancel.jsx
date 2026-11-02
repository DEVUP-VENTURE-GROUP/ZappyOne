import { useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarClock, Loader2, X } from 'lucide-react';
import { useRescheduleJobMutation } from '@shared/services/api';
import { laterSlots } from '@shared/customer/searchClock';
import { Row, Section } from './Section';

// UC's "Reschedule & cancel": move a booking made for later (jobs/reschedule, its own limits) or cancel with the fee shown first.
export default function RescheduleCancel({ job, reschedule, cancel, onCancel, onMoved }) {
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(null);
  const [move] = useRescheduleJobMutation();
  const canMove = Boolean(job.scheduledAt && reschedule?.allowed);
  const slots = canMove && open ? laterSlots(reschedule.leadMinutes) : [];
  if (!canMove && !cancel && !(job.scheduledAt && reschedule?.reason)) return null;

  async function to(at) {
    setMoving(at);
    try { const r = await move({ id: job.id, scheduledAt: at }).unwrap(); toast.success(r.message); setOpen(false); onMoved?.(); }
    catch (err) { toast.error(err?.data?.error || 'Could not move it. Try again.'); }
    setMoving(null);
  }

  return (
    <Section title={canMove || reschedule?.reason ? 'Reschedule and cancel' : 'Cancel booking'}>
      <div className="divide-y divide-line">
        {job.scheduledAt && (canMove ? (
          <div>
            <Row Icon={CalendarClock} title="Change the time"
              sub={`You can move it ${reschedule.left} more ${reschedule.left === 1 ? 'time' : 'times'}, up to ${reschedule.aheadDays} days ahead.`}
              onClick={() => setOpen((v) => !v)} />
            {open && (
              <div className="flex flex-wrap gap-2 pb-4 pl-[54px]">
                {slots.map((s) => (
                  <button key={s.at} type="button" disabled={Boolean(moving)} onClick={() => to(s.at)}
                    className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-[13px] font-semibold text-ink-900 hover:border-zappy-600 disabled:opacity-50">
                    {moving === s.at && <Loader2 size={12} className="animate-spin" />} {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : reschedule?.reason ? <Row Icon={CalendarClock} title="Change the time" sub={reschedule.reason} /> : null)}
        {cancel && <Row Icon={X} title="Cancel this booking" sub={cancel.note || 'You see any fee before you confirm.'} onClick={onCancel} tone="danger" />}
      </div>
    </Section>
  );
}
