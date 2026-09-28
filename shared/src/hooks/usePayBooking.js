import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  useCreateBookingPaymentMutation, useVerifyPaymentMutation, useGetPaymentAvailabilityQuery,
} from '../services/api';
import { openCheckout } from '../services/cashfree';

/**
 * Pay a repair, pet or helping booking online.
 *
 *   server creates the Cashfree order (amount read from the booking)
 *     → Zappy sheet → Cashfree checkout
 *     → /payments/verify for an instant answer (the webhook stays the source of truth)
 *
 * Returns true only when the payment was confirmed.
 */
export function usePayBooking() {
  const [createPayment] = useCreateBookingPaymentMutation();
  const [verify] = useVerifyPaymentMutation();
  const [paying, setPaying] = useState(false);

  async function pay({ bookingSource, bookingId, label = 'Service payment' }) {
    setPaying(true);
    try {
      const order = await createPayment({ bookingSource, bookingId }).unwrap();
      const done = await openCheckout({
        paymentSessionId: order.paymentSessionId,
        cfOrderId: order.cfOrderId,
        cashfreeEnv: order.cashfreeEnv || 'sandbox',
        amountPaise: order.amountPaise,
        purpose: label,
      });
      await verify({ cfOrderId: done.cfOrderId, cfPaymentId: done.cfPaymentId }).unwrap();
      toast.success('Payment received');
      return true;
    } catch (err) {
      const msg = err?.data?.error || err?.message || 'Payment failed';
      if (/cancelled/i.test(msg)) toast('Payment cancelled. You can pay from the booking any time.');
      else toast.error(msg);
      return false;
    } finally {
      setPaying(false);
    }
  }

  return { pay, paying };
}

/** True while the server says online payment works. Unknown counts as no. */
export function useOnlinePayAvailable() {
  const { data } = useGetPaymentAvailabilityQuery();
  return !!data?.online;
}
