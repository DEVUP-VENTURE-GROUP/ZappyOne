/**
 * The customer watching their pro approach (the website's useTrackingFeed):
 * in the job's room for as long as it is live, so status changes arrive too;
 * positions and the ETA are kept only while someone is travelling, and are
 * cleared the moment the trip ends rather than frozen on screen.
 */
import { useEffect, useState } from 'react';
import { socketClient } from '../socket/socketClient';
import { useSocketEvent } from './useSocketEvent';

export interface FeedPoint { lat: number; lng: number; at: number }

export function useTrackingFeed(jobId: string | null, { enabled = true, live = enabled }: { enabled?: boolean; live?: boolean } = {}) {
  const [workerLocation, setWorkerLocation] = useState<FeedPoint | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const on = !!jobId && live;

  useEffect(() => {
    if (!on || !jobId) return undefined;
    void socketClient.connect();
    socketClient.subscribeOrder(jobId);
    return () => socketClient.unsubscribeOrder(jobId);
  }, [on, jobId]);

  useSocketEvent('worker.location', (p) => {
    if (p?.lat != null && p?.lng != null) setWorkerLocation({ lat: p.lat, lng: p.lng, at: p.at || Date.now() });
  }, on && enabled);
  useSocketEvent('eta.update', (p) => { if (p?.etaMinutes != null) setEtaMinutes(p.etaMinutes); }, on && enabled);

  useEffect(() => {
    if (!enabled) { setWorkerLocation(null); setEtaMinutes(null); }
  }, [enabled]);

  return { workerLocation, etaMinutes };
}
