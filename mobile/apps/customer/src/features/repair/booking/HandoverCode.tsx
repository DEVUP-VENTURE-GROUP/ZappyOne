/**
 * The code the customer reads out when their device changes hands (the
 * website's HandoverCode). The server returns only the code for the step that
 * is due, so nothing here can leak a later one.
 */
import { useRepairHandoverCodeQuery } from '@zappy/core/api';
import { CodeReveal } from '../../tracking/cards/CodeReveal';

const CLOSED = ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED'];
const COPY: Record<string, { title: string; hint: string }> = {
  start: { title: 'Share this to start the repair', hint: 'Your technician needs this before any work begins.' },
  handover: { title: 'Share this when handing your device over', hint: 'Proof your device was collected. Never give it before this is asked for.' },
  return: { title: 'Share this when you get your device back', hint: 'Proof the right person received it. Check the device before reading it out.' },
};

export function HandoverCode({ booking }: { booking: { _id: string; status: string } }) {
  const closed = CLOSED.includes(booking.status);
  const { data } = useRepairHandoverCodeQuery(booking._id, { skip: closed });
  if (closed || !data?.code) return null;
  const copy = COPY[data.kind] || { title: 'Your handover code', hint: 'Share this with your technician.' };
  return <CodeReveal code={data.code} title={copy.title} hint={copy.hint} color="#7C3AED" />;
}
