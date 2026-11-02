import { useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { useSafeBack } from '../../hooks/useBookingFlow';
import {
  useCancelSubscriptionMutation, useListPlansQuery, useMySubscriptionQuery, useSubscribeMutation, useVerifyPaymentMutation,
} from '@shared/services/api';
import { openCheckout } from '@shared/services/cashfree';

const rupees = (p) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;
const dateOf = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function Benefits({ items }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((b) => (
        <li key={b} className="flex items-start gap-2.5 text-[14.5px] text-ink-900">
          <Check size={17} className="mt-0.5 shrink-0 text-green-700" /> {b}
        </li>
      ))}
    </ul>
  );
}

// Customer membership: only perks the server applies at booking (jobs/member) are listed; sold only once online payment is live.
export default function PlansPage() {
  const goBack = useSafeBack('/profile');
  const { data: plansData, isLoading } = useListPlansQuery('user');
  const { data: subData, isLoading: subLoading, refetch } = useMySubscriptionQuery();
  const [subscribe] = useSubscribeMutation();
  const [verifyPayment] = useVerifyPaymentMutation();
  const [cancel, { isLoading: cancelling }] = useCancelSubscriptionMutation();
  const [buying, setBuying] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const sub = subData?.subscription;
  const plans = (plansData?.plans || []).filter((p) => p.benefits?.length);
  const purchasable = !!plansData?.purchasable;

  async function buy(plan) {
    setBuying(plan.code);
    try {
      const order = await subscribe(plan.code).unwrap();
      const paid = await openCheckout({ ...order, purpose: plan.name });
      await verifyPayment({ cfOrderId: paid.cfOrderId, cfPaymentId: paid.cfPaymentId, ...(paid.razorpaySignature && { razorpaySignature: paid.razorpaySignature }) }).unwrap();
      toast.success(`${plan.name} is active`);
      refetch();
    } catch (err) {
      const msg = err?.data?.error || err?.message || 'Payment did not go through';
      if (/cancel/i.test(msg)) toast('Payment cancelled'); else toast.error(msg);
    } finally { setBuying(null); }
  }

  async function stop() {
    try { await cancel(sub._id).unwrap(); toast.success('Membership cancelled'); setConfirming(false); refetch(); }
    catch (err) { toast.error(err?.data?.error || 'Could not cancel. Try again.'); }
  }

  return (
    <div className="min-h-screen bg-sunken">
      <div className="mx-auto min-h-screen max-w-2xl bg-white pb-12">
        <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <button type="button" onClick={() => goBack()} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full text-ink-900 hover:bg-sunken"><ArrowLeft size={21} /></button>
          <h1 className="text-[17px] font-bold text-ink-900">Membership</h1>
        </header>

        {isLoading || subLoading ? (
          <div className="grid place-items-center py-24"><Loader2 size={26} className="animate-spin text-ink-400" /></div>
        ) : sub ? (
          <section className="px-4 py-6 sm:px-6">
            <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-green-700">Active</p>
            <h2 className="mt-1 text-[24px] font-extrabold tracking-[-0.02em] text-ink-900">{plans.find((p) => p.code === sub.planCode)?.name || sub.planCode}</h2>
            <p className="mt-1 text-[14px] text-ink-500">Valid until {dateOf(sub.endAt)}</p>
            <Benefits items={sub.benefits || []} />
            {confirming ? (
              <div className="mt-6 rounded-card bg-sunken p-4">
                <p className="text-[14px] font-semibold text-ink-900">Cancel your membership? Its benefits stop now.</p>
                <div className="mt-3 flex gap-3">
                  <button type="button" onClick={() => setConfirming(false)} className="btn-outline flex-1">Keep it</button>
                  <button type="button" onClick={stop} disabled={cancelling} className="btn-primary flex-1 !bg-red-600">{cancelling && <Loader2 size={16} className="animate-spin" />} Cancel it</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="mt-6 text-[14px] font-semibold text-red-700">Cancel membership</button>
            )}
          </section>
        ) : (
          <>
            <section className="border-b-8 border-sunken px-4 py-6 sm:px-6">
              <h2 className="text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-ink-900 [text-wrap:balance]">Pay less on every booking</h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ink-500">One monthly price. The benefits apply to every repair, pet care and helper booking on its own, at checkout.</p>
              {!purchasable && <p className="mt-3 rounded-btn bg-sunken px-3 py-2.5 text-[13.5px] text-ink-700">Memberships open when online payment starts. You will see them here.</p>}
            </section>
            {plans.length === 0 ? (
              <p className="px-4 py-8 text-[14px] text-ink-500 sm:px-6">No memberships are on offer right now.</p>
            ) : plans.map((plan) => (
              <section key={plan.code} className="border-b-8 border-sunken px-4 py-5 sm:px-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[18px] font-extrabold text-ink-900">{plan.name}</h3>
                  <p className="shrink-0 text-[18px] font-bold tabular-nums text-ink-900">{rupees(plan.priceInPaise)}<span className="text-[13px] font-medium text-ink-500"> / {plan.durationDays} days</span></p>
                </div>
                <Benefits items={plan.benefits} />
                {purchasable && (
                  <button type="button" onClick={() => buy(plan)} disabled={!!buying} className="btn-primary mt-4 w-full">
                    {buying === plan.code && <Loader2 size={16} className="animate-spin" />} Join for {rupees(plan.priceInPaise)}
                  </button>
                )}
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
