import { CircleCheck, Clock3, CreditCard } from 'lucide-react';
import { useMyBookingPaymentQuery } from '../../services/api';
import { formatPaise } from '../../utils/money';

const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

// What was paid online for a booking and exactly where its refund is, with the bank reference; nothing when it was paid in cash.
export default function RefundStatus({ source, id }) {
  const { data } = useMyBookingPaymentQuery({ source, id }, { skip: !id });
  const p = data?.payment;
  if (!p) return null;
  const r = p.refund;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="flex items-center gap-2 text-[13px] font-bold text-slate-800"><CreditCard size={15} className="text-zappy-600" /> Paid online {formatPaise(p.amountPaise)}{p.paidAt ? ` on ${day(p.paidAt)}` : ''}</p>
      {r && (
        <div className={`mt-2 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12.5px] ${r.status === 'processed' ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
          {r.status === 'processed' ? <CircleCheck size={15} className="mt-0.5 shrink-0" /> : <Clock3 size={15} className="mt-0.5 shrink-0" />}
          <div className="min-w-0">
            <p className="font-bold">{r.status === 'processed' ? `Refund of ${formatPaise(r.amountPaise)} sent to your account` : `Refund of ${formatPaise(r.amountPaise)} on its way`}</p>
            <p>{r.status === 'processed' ? 'It shows in your bank or UPI app within a day.' : `Started ${day(r.at)}. Banks usually take 5 to 7 working days.`}</p>
            {r.reference && <p className="mt-0.5 break-all font-mono text-[11.5px]">Reference: {r.reference}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
