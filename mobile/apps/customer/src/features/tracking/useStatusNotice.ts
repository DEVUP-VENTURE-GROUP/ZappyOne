/**
 * A short notice when a job changes state (the website's
 * StatusNotificationBanner), on the app's toast: who, what changed, what to
 * do. Silent on the first paint unless the job is waiting on the customer.
 */
import { useEffect, useRef } from 'react';
import { toast } from '@zappy/ui/components/Toast';

interface Who { name?: string; rating?: number | null; jobs?: number; eta: number | null }

const COPY: Record<string, (w: Who) => string> = {
  searching: () => 'Finding a verified pro. We will tell you as soon as someone accepts.',
  assigned: (w) => `${w.name || 'Your pro'} accepted your booking${w.rating ? `, rated ${Number(w.rating).toFixed(1)}` : ''}`,
  on_the_way: (w) => `${w.name || 'Your pro'} is on the way${w.eta != null ? `, arriving in about ${w.eta} min` : ''}`,
  arrived: (w) => `${w.name || 'Your pro'} has arrived. Share your start code when you are ready.`,
  in_progress: (w) => `Work in progress. ${w.name || 'Your pro'} is working on it.`,
  approval: () => 'Your quote is ready. Review it below; nothing starts until you approve.',
  completed: () => 'Job completed. Rate the job when you are ready.',
};

export function useStatusNotice(status: string, needsYou: boolean, who: Who) {
  const key = needsYou ? 'approval' : status;
  const prev = useRef<string | null>(null);
  const latest = useRef(who);
  latest.current = who;
  useEffect(() => {
    if (!key || key === prev.current) return;
    const first = prev.current === null;
    prev.current = key;
    if ((first && key !== 'approval') || !COPY[key]) return;
    const text = COPY[key](latest.current);
    if (key === 'completed') toast.success(text); else toast(text, { duration: key === 'approval' ? 8000 : 5000 });
  }, [key]);
}
