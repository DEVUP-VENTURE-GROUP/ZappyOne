import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, ChevronRight, Loader2, Zap } from 'lucide-react';
import { useMyJobs } from '../hooks/useMyJobs';
import { useT } from '@shared/i18n/I18nProvider';

/**
 * This tab is a redirect: if something is happening, go and watch it.
 *
 * It used to decide "is anything happening" from its own two status lists, and
 * carried a third list of labels it never rendered. `useMyJobs` already answers
 * the question for orders AND repairs — and answers it the same way the Home
 * and Activity screens do, which is the point.
 */
export default function TrackPage() {
  const nav = useNavigate();
  const t = useT();
  const { current, isLoading } = useMyJobs();

  useEffect(() => {
    if (current) nav(current.href, { replace: true });
  }, [current, nav]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center pb-24">
        <Loader2 size={24} className="text-zappy-600 animate-spin" />

      </div>
    );
  }

  if (current) return null;

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-40">
      <header className="page-header">
        <div className="page-header-inner">
          <h1 className="h-card">{t('track.title', 'Track Order')}</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 flex flex-col items-center justify-center h-[62vh] gap-6 text-center">
        <div className="w-20 h-20 rounded-card bg-zappy-50 flex items-center justify-center">
          <MapPin size={36} strokeWidth={1.5} className="text-zappy-600" />
        </div>
        <div>
          <h2 className="font-bold text-xl text-[#0F172A]">{t('track.noActive', 'No active order')}</h2>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed max-w-xs">
            {t('track.hint', 'Live tracking appears here while a booking is in progress. Book a service to get started.')}
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button onClick={() => nav('/services')} className="btn-primary w-full">
            <Zap size={15} strokeWidth={2.5} />
            {t('track.bookService', 'Book a Service')}
          </button>
          <button onClick={() => nav('/orders')} className="btn-secondary w-full flex items-center justify-center gap-1.5">
            {t('track.viewPast', 'View Past Bookings')}
            <ChevronRight size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>


    </div>
  );
}
