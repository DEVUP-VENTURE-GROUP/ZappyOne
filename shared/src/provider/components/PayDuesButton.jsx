import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { useCreateDuesPaymentMutation, useGetPaymentAvailabilityQuery, useVerifyPaymentMutation } from '../../services/api';
import { openCheckout } from '../../services/cashfree';

const rupees = (p) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;

// Pay what is owed to ZappyOne online, all of it; cleared the moment the gateway confirms (server worker/dues-pay). Hidden until a gateway has keys.
export default function PayDuesButton({ duesPaise, onPaid, className = '' }) {
  const { data: avail } = useGetPaymentAvailabilityQuery();
  const [create] = useCreateDuesPaymentMutation();
  const [verify] = useVerifyPaymentMutation();
  const [busy, setBusy] = useState(false);
  if (!avail?.gateway || !(duesPaise > 0)) return null;

  async function pay() {
    setBusy(true);
    try {
      const order = await create({}).unwrap();
      const done = await openCheckout({ ...order, purpose: 'ZappyOne dues' });
      await verify({ cfOrderId: done.cfOrderId, cfPaymentId: done.cfPaymentId, ...(done.razorpaySignature && { razorpaySignature: done.razorpaySignature }) }).unwrap();
      toast.success('Paid. You can take new jobs.');
      onPaid?.();
    } catch (err) {
      const msg = err?.data?.error || err?.message || 'Payment did not go through';
      if (/cancel/i.test(msg)) toast('Payment cancelled'); else toast.error(msg);
    } finally { setBusy(false); }
  }

  return (
    <button type="button" onClick={pay} disabled={busy} className={`btn-primary h-11 w-full ${className}`}>
      {busy && <Loader2 size={16} className="animate-spin" />} Pay {rupees(duesPaise)} now
    </button>
  );
}
