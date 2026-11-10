/**
 * The code the customer reads out when their device changes hands (the
 * website's HandoverCode). The server returns only the code for the step that
 * is due, so nothing here can leak a later one.
 */
import { useRepairHandoverCodeQuery } from '@zappy/core/api';
import { startCodeCopy } from '@zappy/core/shared/repairStatus';
import { CodeReveal } from '../../tracking/cards/CodeReveal';
import { zappy } from '@zappy/ui/theme/colors';

const CLOSED = ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED'];
const COPY: Record<string, { title: string; hint: string }> = {
  handover: { title: 'Share this when handing your device over', hint: 'Proof your device was collected. Never give it before this is asked for.' },
  return: { title: 'Share this when you get your device back', hint: 'Proof the right person received it. Check the device before reading it out.' },
};

export function HandoverCode({ booking, terms }: { booking: { _id: string; status: string }; terms?: { pro?: string } }) {
  const closed = CLOSED.includes(booking.status);
  const { data } = useRepairHandoverCodeQuery(booking._id, { skip: closed });
  if (closed || !data?.code) return null;
  const copy = data.kind === 'start' ? startCodeCopy(terms) : COPY[data.kind] || { title: 'Your code', hint: 'Share this when you are asked for it.' };
  return <CodeReveal code={data.code} title={copy.title} hint={copy.hint} color={zappy[700]} />;
}
