import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Package, Star, ChevronRight, Clock, Calendar } from 'lucide-react';
import { useGetEventBookingsQuery } from '@shared/services/api';

const STATUS_COLORS = {
  pending_payment:  'bg-slate-100 text-slate-500',
  confirmed:        'bg-blue-50 text-blue-700',
  partner_assigned: 'bg-indigo-50 text-indigo-700',
  in_progress:      'bg-orange-50 text-orange-700',
  completed:        'bg-green-50 text-green-700',
  cancelled:        'bg-red-50 text-red-600',
  disputed:         'bg-amber-50 text-amber-700',
};

const STATUS_ICONS = {
  pending_payment:  Clock,
  confirmed:        Calendar,
  completed:        Star,
};

export default function EventBookingListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGetEventBookingsQuery(page);
  const bookings = data?.bookings || [];

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <ArrowLeft size={18} className="text-slate-700" />
          </button>
          <div>
            <h1 className="font-bold text-slate-900">My Event Bookings</h1>
            <p className="text-xs text-slate-400">{data?.total || 0} bookings</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 animate-pulse">
              <div className="flex gap-3"><div className="w-16 h-16 bg-slate-100 rounded-xl" /><div className="flex-1 space-y-2"><div className="h-4 bg-slate-100 rounded w-3/4" /><div className="h-3 bg-slate-100 rounded w-1/2" /></div></div>
            </div>
          ))
        ) : bookings.length === 0 ? (
          <div className="text-center py-20">
            <Package size={48} className="text-slate-200 mx-auto mb-3" />
            <p className="font-semibold text-slate-600">No event bookings yet</p>
            <p className="text-sm text-slate-400 mt-1">Browse beautiful themes and book your first event</p>
            <button onClick={() => navigate('/events')}
              className="mt-4 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-semibold">
              Explore Events
            </button>
          </div>
        ) : (
          bookings.map(b => {
            const StatusIcon = STATUS_ICONS[b.status] || Calendar;
            return (
              <motion.div key={b._id} whileTap={{ scale: 0.98 }}
                onClick={() => navigate(`/events/bookings/${b._id}`)}
                className="bg-white rounded-2xl border border-slate-100 p-4 cursor-pointer hover:shadow-sm transition-all flex gap-3 items-start">
                {b.themeId?.coverImage ? (
                  <img src={b.themeId.coverImage} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-violet-100 to-fuchsia-100 flex items-center justify-center shrink-0">
                    <span className="text-2xl">🎉</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-slate-900 truncate">{b.themeId?.title || 'Event Booking'}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[b.status] || 'bg-slate-100 text-slate-500'}`}>
                      {b.status?.replace(/_/g, ' ')}
                    </span>
                    {b.eventDate && (
                      <span className="text-xs text-slate-400 flex items-center gap-0.5">
                        <Calendar size={10} />
                        {new Date(b.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-sm font-bold text-indigo-600">₹{Math.round((b.pricing?.totalPaise || 0) / 100).toLocaleString('en-IN')}</span>
                    <span className="text-xs text-slate-400">{b.eventTimeSlot}</span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-300 shrink-0 mt-1" />
              </motion.div>
            );
          })
        )}

        {data?.pages > 1 && (
          <div className="flex gap-2 justify-center pt-2">
            {Array.from({ length: data.pages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)}
                className={`w-9 h-9 rounded-xl text-sm font-semibold ${p === page ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{p}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
