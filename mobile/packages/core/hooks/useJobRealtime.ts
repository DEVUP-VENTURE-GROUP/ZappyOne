/**
 * Lists refresh themselves when a job changes — the app's version of the
 * websites' useJobRealtime (shared/src/hooks/useSocket): a status change or
 * update refreshes that kind's lists, an open job refreshes the open list,
 * a repair quote refreshes repairs. `onTip` hears a tip put on the bill.
 */
import { useEffect, useRef } from 'react';
import { useAppDispatch } from '../store/hooks';
import { api } from '../api/sharedApi';
import { useSocketEvent } from './useSocketEvent';
import type { JobStatusEvent } from '../socket/events';
import { NOTIFICATION_TAGS } from '../shared/realtimeTags';

const JOB_TAGS: Record<string, string> = { pet: 'PetBookings', helping: 'HelpingTasks', repair: 'RepairBookings', event: 'EventBooking' };
const OPEN_TAGS: Record<string, string> = { pet: 'PetAvailable', helping: 'HelpingAvailable' };

export function useJobRealtime({ enabled = true, onTip, onAvailable }: {
  enabled?: boolean;
  onTip?: (tipPaise: number) => void;
  onAvailable?: (area?: string) => void;
} = {}): void {
  const dispatch = useAppDispatch();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refresh = (tags: any[]) => dispatch(api.util.invalidateTags(tags as never));

  const onJob = (p: JobStatusEvent & { tipPaise?: number }) => {
    const type = JOB_TAGS[p?.kind];
    if (type) refresh([type, { type, id: p.id }, ...(OPEN_TAGS[p.kind] ? [OPEN_TAGS[p.kind]] : [])]);
    if ((p?.tipPaise ?? 0) > 0) onTip?.(p.tipPaise as number);
  };
  // A notification means something changed for this person; bursts collapse into one refresh.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useSocketEvent('notification', () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => refresh(NOTIFICATION_TAGS), 250);
  }, enabled);
  useSocketEvent('job.status', onJob, enabled);
  useSocketEvent('job.update', onJob, enabled);
  useSocketEvent('job.available', (p) => {
    if (OPEN_TAGS[p?.kind]) refresh([OPEN_TAGS[p.kind]]);
    onAvailable?.(p?.area);
  }, enabled);
  useSocketEvent('repair.quote', () => refresh(['RepairBookings']), enabled);
  useSocketEvent('repair.quote_decision', () => refresh(['RepairBookings']), enabled);
}
