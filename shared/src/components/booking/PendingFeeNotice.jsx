import { Info } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useMyPendingCancelFeeQuery } from '../../services/api';
import { selectAuth } from '../../modules/auth/authSlice';

const rupees = (p) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;

/**
 * Before a customer confirms a booking: a cancellation fee they still owe from
 * an earlier booking is added to this one, as its own line on the bill. Said
 * here so nobody finds it on the bill afterwards.
 */
export default function PendingFeeNotice() {
  const { token } = useSelector(selectAuth);
  const { data } = useMyPendingCancelFeeQuery(undefined, { skip: !token });
  if (!data?.totalPaise) return null;
  const when = data.since ? new Date(data.since).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null;
  return (
    <div className="flex gap-2.5 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900 ring-1 ring-amber-100">
      <Info size={16} className="mt-0.5 shrink-0 text-amber-600" />
      <p>
        <b>{rupees(data.totalPaise)}</b> from {data.count > 1 ? `${data.count} cancelled bookings` : 'a cancelled booking'}{when ? ` (since ${when})` : ''} is
        added to this booking as its own line. It goes to the providers whose trips were cancelled.
      </p>
    </div>
  );
}
