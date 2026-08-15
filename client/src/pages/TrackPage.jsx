import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, ChevronRight, Loader2, Zap } from 'lucide-react';
import { useListOrdersQuery } from '../services/api';
import { useT } from '../i18n/I18nProvider';

const ACTIVE_STATUSES = new Set(['created', 'searching', 'assigned', 'on_the_way', 'arrived', 'in_progress']);

const STATUS_LABELS = {
  created:     'Order placed — waiting to be assigned',
  searching:   'Finding the best worker for you',
  assigned:    'Worker assigned — preparing to leave',
  on_the_way:  'Your worker is on the way',
  arrived:     'Worker has arrived at your location',
  in_progress: 'Service is currently in progress',
};

export default function TrackPage() {
  const nav = useNavigate();
  const t = useT();
  const { data, isLoading } = useListOrdersQuery(1);

  const activeOrder = data?.orders?.find((o) => ACTIVE_STATUSES.has(o.status));

  useEffect(() => {
    if (activeOrder) nav(`/orders/${activeOrder._id}`, { replace: true });
  }, [activeOrder, nav]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center pb-24">
        <Loader2 size={24} className="text-zappy-600 animate-spin" />

      </div>
    );
  }

  if (activeOrder) return null;

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-40">
      <header className="page-header">
        <div className="page-header-inner">
          <h1 className="h-card">{t('track.title', 'Track Order')}</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 flex flex-col items-center justify-center h-[62vh] gap-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-zappy-50 flex items-center justify-center">
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
