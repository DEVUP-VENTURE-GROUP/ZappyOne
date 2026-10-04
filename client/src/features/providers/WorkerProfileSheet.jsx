import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, BadgeCheck, Briefcase, CalendarDays, ThumbsUp, Loader2, Quote } from 'lucide-react';
import { useGetWorkerPublicProfileQuery } from '@shared/services/api';
import { serviceLabel } from '@shared/constants/services';

function timeAgo(d) {
  if (!d) return '';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function memberSince(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

/**
 * Trust profile — the pro's public reputation (rating, jobs, verified, reviews).
 * Opened from the pro picker, nearby-pros, and the live tracking screen.
 */
export default function WorkerProfileSheet({ workerId, open, onClose }) {
  const { data, isFetching } = useGetWorkerPublicProfileQuery(workerId, { skip: !open || !workerId });
  if (!open) return null;

  const w = data?.worker;
  const reviews = data?.reviews || [];
  const total = w?.ratingCount || 0;

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <div className="absolute inset-0 bg-black/50" />
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="relative w-full sm:max-w-md bg-white rounded-t-sheet sm:rounded-card max-h-[88vh] overflow-hidden flex flex-col shadow-2xl"
        >
          <button onClick={onClose} className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow">
            <X size={16} className="text-slate-600" />
          </button>

          {isFetching && !w ? (
            <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zappy-500" /></div>
          ) : !w ? (
            <div className="py-20 text-center text-slate-400 text-sm">Profile unavailable</div>
          ) : (
            <div className="overflow-y-auto">
              {/* Header */}
              <div className="px-5 pt-6 pb-5 bg-slate-900 text-white">
                <div className="flex items-center gap-3.5">
                  <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center text-2xl font-black shrink-0">
                    {(w.name || 'P').trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-lg font-black truncate">{w.name}</h2>
                      {w.verified && <BadgeCheck size={17} className="text-sky-400 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Star size={14} className="fill-amber-400 text-amber-400" />
                      <span className="font-bold">{Number(w.rating ?? 5).toFixed(1)}</span>
                      <span className="text-white/50 text-[13px]">({total} rating{total !== 1 ? 's' : ''})</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4">
                  <div className="bg-white/10 rounded-xl p-2.5 text-center">
                    <Briefcase size={14} className="mx-auto text-white/70 mb-1" />
                    <p className="text-sm font-black">{w.completedJobs || 0}</p>
                    <p className="text-[10px] text-white/50 font-semibold">Jobs done</p>
                  </div>
                  <div className="bg-white/10 rounded-xl p-2.5 text-center">
                    <ThumbsUp size={14} className="mx-auto text-white/70 mb-1" />
                    <p className="text-sm font-black">{w.acceptRate != null ? `${w.acceptRate}%` : '—'}</p>
                    <p className="text-[10px] text-white/50 font-semibold">Accept rate</p>
                  </div>
                  <div className="bg-white/10 rounded-xl p-2.5 text-center">
                    <CalendarDays size={14} className="mx-auto text-white/70 mb-1" />
                    <p className="text-sm font-black">{memberSince(w.memberSince)}</p>
                    <p className="text-[10px] text-white/50 font-semibold">Member since</p>
                  </div>
                </div>
              </div>

              <div className="px-5 py-4 space-y-5">
                {/* Top services */}
                {w.topServices?.length > 0 && (
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 mb-2">Specialises in</p>
                    <div className="flex flex-wrap gap-1.5">
                      {w.topServices.map((s) => (
                        <span key={s} className="px-2.5 py-1 rounded-full bg-zappy-50 text-zappy-600 text-[12px] font-semibold">{serviceLabel(s)}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rating breakdown */}
                {total > 0 && (
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 mb-2">Ratings</p>
                    <div className="space-y-1.5">
                      {[5, 4, 3, 2, 1].map((star) => {
                        const n = w.breakdown?.[star] || 0;
                        const pct = total ? Math.round((n / total) * 100) : 0;
                        return (
                          <div key={star} className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-500 w-6 flex items-center gap-0.5">{star}<Star size={9} className="fill-amber-400 text-amber-400" /></span>
                            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[11px] text-slate-400 w-7 text-right">{n}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Reviews */}
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 mb-2">Customer reviews</p>
                  {reviews.length === 0 ? (
                    <p className="text-sm text-slate-400 py-3 text-center">No written reviews yet — be the first!</p>
                  ) : (
                    <div className="space-y-3">
                      {reviews.map((r, i) => (
                        <div key={i} className="bg-slate-50 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1">
                              {Array.from({ length: 5 }).map((_, s) => (
                                <Star key={s} size={11} className={s < r.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} />
                              ))}
                            </div>
                            <span className="text-[10px] text-slate-400">{timeAgo(r.at)}</span>
                          </div>
                          <p className="text-[13px] text-slate-700 leading-snug flex gap-1"><Quote size={12} className="text-slate-300 shrink-0 mt-0.5" />{r.text}</p>
                          {r.service && <p className="text-[10.5px] text-slate-400 mt-1.5 pl-4">{serviceLabel(r.service)}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
