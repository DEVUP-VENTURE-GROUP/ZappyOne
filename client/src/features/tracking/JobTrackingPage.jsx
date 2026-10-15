import { useSafeBack } from '../../hooks/useBookingFlow';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  CheckCircle, HeadphonesIcon, Loader2, ShieldAlert, ShieldCheck, X, Navigation, Repeat2, Clock,
} from 'lucide-react';
import LiveTrackingMap from '@shared/modules/tracking/LiveTrackingMap';
import { useTrackingFeed } from '@shared/hooks/useLiveTrip';
import { useSocketStatus } from '@shared/hooks/useSocket';
import PageTransition from '../../components/common/PageTransition';
import StatusNotificationBanner from './cards/StatusNotificationBanner';
import {
  TrackingHeader, MapETAChip, SearchingHero, WorkerRichCard, PremiumTimeline, ActivityFeed,
  BookingSummary, ProofPhoto, RatingPanel, stepsFor, feedCopy, firstNameOf,
} from './redesign';
import { staggerContainer, fadeInUp } from '../../lib/animations';
import StartCodeCard from './StartCodeCard';
import JobBoostCard from './cards/JobBoostCard';
import SlowSearchCard from './cards/SlowSearchCard';
import JobTipCard from './cards/JobTipCard';
import RepeatCard from './cards/RepeatCard';
import JobChat from '@shared/components/jobs/JobChat';
import { useJobOptionsQuery, useReportProviderAbsentMutation } from '@shared/services/api';
import { useSelector } from 'react-redux';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { API_BASE } from '@shared/services/apiBase';
import { fetchOk } from '@shared/utils/fetchOk';

const rupees = (p) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;

/**
 * Live tracking — one page for every kind of job.
 *
 * The first version's order tracking (live map, ETA, the pro's card, a
 * timeline and live feed, the start code, SOS) applied to the new flows:
 * each kind's page turns its data into the common `job` shape
 * (shared/customer/jobKinds.js) and passes its own extras — a repair quote to approve,
 * a helping item to decide on, a payment to make.
 *
 *   job          from KINDS[kind].toJob(...)
 *   extras       the kind's own cards, shown under the live status
 *   startCode    the customer's start code once the server issues it
 *   codeStage    when the code is due at a different moment than arrival (a delivery)
 *   cancel       when it can be cancelled now: { run(reason) }. The sheet shows what it
 *                costs first (GET /jobs/:id/options), the same for every kind
 *   onRate       rate a completed job; omitted once rated
 *   onReceipt    download the receipt, when there is one
 *   onSOS        tell ZappyOne about an emergency (112 is always dialled first)
 *   onBack       where back goes
 *   live         { workerLocation, etaMinutes } to use instead of the job's own feed
 */
export default function JobTrackingPage({ job, extras = null, startCode = null, codeStage = null, cancel = null, onRate, onReceipt, onSOS, onBack, live = null, rebookHref = null }) {
  const nav = useNavigate();
  // Back to the previous page, or to /orders when this page was opened directly.
  const goBack = useSafeBack('/orders');
  const mapRef = useRef(null);
  const [sosOpen, setSosOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  // The cancel fee, a changed provider, and "not coming": the server's answer for this moment.
  // Live jobs (cancel, boost, provider changed) and finished ones (tip).
  const optionsOn = ['repair', 'pet', 'helping'].includes(job.kind) && (!job.terminal || job.status === 'completed');
  const { data: options, isFetching: optionsLoading, refetch: refetchOptions } = useJobOptionsQuery({ id: job.id, status: job.status }, { skip: !optionsOn });
  const [reportAbsent, { isLoading: reportingAbsent }] = useReportProviderAbsentMutation();
  const cancelQuote = options?.cancel;
  const { accessToken } = useSelector(selectAuth);

  // The receipt PDF for a finished job (the same one the "job done" email carries).
  const downloadReceipt = async () => {
    try {
      const res = await fetchOk(`${API_BASE}/api/jobs/${job.id}/receipt`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `ZappyOne-receipt-${job.reference || job.id}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      toast.error(err.message || 'Could not get the receipt');
    }
  };
  const receiptHandler = onReceipt || (job.status === 'completed' && ['repair', 'pet', 'helping'].includes(job.kind) ? downloadReceipt : undefined);
  const socketStatus = useSocketStatus();

  // In the job's room for as long as it's live; positions only while someone travels.
  const feed = useTrackingFeed(job.kind === 'order' ? null : job.id, { enabled: Boolean(job.trip), live: !job.terminal });
  const workerLocation = live?.workerLocation ?? feed.workerLocation;
  const eta = live?.etaMinutes ?? feed.etaMinutes;
  const status = job.status;
  const steps = useMemo(() => stepsFor(job.noun), [job.noun]);
  const activeStepIdx = steps.findIndex((s) => s.key === status);
  const timesByStatus = useMemo(() => Object.fromEntries(job.history.map((h) => [h.stage, h.at])), [job.history]);
  const feedEvents = useMemo(() => {
    const fn = firstNameOf(job.provider?.name);
    return job.history
      .map((h) => ({ status: h.stage, at: h.at, text: feedCopy(h.stage, fn, job.noun) }))
      .filter((e) => e.text)
      .sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [job.history, job.provider?.name, job.noun]);

  // Where the pro is heading: the trip's destination, else the job's place.
  const target = job.trip?.to || (job.place?.lat != null ? job.place : null);
  const showMap = !job.terminal && ['assigned', 'on_the_way', 'arrived'].includes(status) && target;
  const route = workerLocation && target
    ? `https://www.google.com/maps/dir/?api=1&origin=${workerLocation.lat},${workerLocation.lng}&destination=${target.lat},${target.lng}&travelmode=driving`
    : null;

  async function sos() {
    setSosOpen(false);
    // The dialler first: 112 is what actually brings help, and it must not wait on our network.
    window.location.href = 'tel:112';
    if (!onSOS) return;
    try {
      await onSOS();
      toast('112 dialled, and our safety team has been alerted', { icon: '🚨', duration: 8000 });
    } catch {
      // Never claim we were told when we were not.
      toast.error('112 dialled. We could not reach ZappyOne support. Please call us too.', { duration: 10000 });
    }
  }

  return (
    <PageTransition>
      <StatusNotificationBanner
        status={status}
        needsYou={['CUSTOMER_APPROVAL_PENDING', 'AWAITING_CUSTOMER_APPROVAL', 'APPROVAL_REQUIRED'].includes(job.rawStatus)}
        workerName={job.provider?.name}
        workerRating={job.provider?.rating ?? null}
        workerJobs={job.provider?.jobs}
        etaMinutes={eta}
      />

      <div className="min-h-screen bg-canvas pb-[164px]">
        <AnimatePresence>
          {socketStatus !== 'connected' && !job.terminal && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white ${socketStatus === 'offline' ? 'bg-red-600' : 'bg-amber-500'}`}>
                <Loader2 size={12} className="shrink-0 animate-spin" />
                {socketStatus === 'offline' ? 'Live updates unavailable. Showing the last known state' : 'Reconnecting live updates…'}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <TrackingHeader
          job={job} status={status} eta={eta} terminal={job.terminal}
          onBack={onBack || (() => goBack())}
          onSOS={() => setSosOpen(true)}
          onSupport={() => nav('/support')}
        />

        <motion.div
          className="mx-auto w-full max-w-2xl space-y-3.5 px-4 pt-4 sm:px-6 lg:max-w-4xl lg:columns-2 lg:gap-4 lg:space-y-0 lg:[&>*]:mb-3.5 lg:[&>*]:break-inside-avoid"
          variants={staggerContainer} initial="initial" animate="animate"
        >
          {showMap && (
            <motion.div variants={fadeInUp} ref={mapRef} className="relative lg:[column-span:all]">
              <LiveTrackingMap
                pickup={target}
                workerLocation={workerLocation}
                status={status === 'arrived' ? 'arrived' : 'on_the_way'}
                height="42vh"
                pickupLabel={job.trip && !job.trip.toCustomer ? 'Drop-off' : "You're here"}
              />
              <MapETAChip eta={eta} status={status} />
              {route && (
                <a href={route} target="_blank" rel="noopener noreferrer"
                  className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-semibold text-navy shadow-md ring-1 ring-slate-200">
                  <Navigation size={13} className="text-zappy-600" /> Open in Maps
                </a>
              )}
            </motion.div>
          )}

          {status === 'searching' && <SearchingHero etaMinutes={null} search={options?.search} noun={job.noun} />}

          {job.provider && !job.terminal && (
            <div className="lg:[column-span:all]">
              <WorkerRichCard
                job={job} eta={eta} status={status}
                onCall={job.provider.phone ? () => { window.location.href = `tel:${job.provider.phone}`; } : undefined}
                onChat={job.kind !== 'order' ? () => setChatOpen(true) : undefined}
                onLive={showMap ? () => mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : undefined}
              />
            </div>
          )}

          {/* The arrival promise (jobs/promise): due by when, said plainly when it slips. */}
          {options?.arrival && !options.arrival.arrivedAt && job.provider && !job.terminal && (
            <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 ring-1 lg:[column-span:all] ${options.arrival.late ? 'bg-amber-50 ring-amber-200' : 'bg-white ring-slate-100'}`}>
              <Clock size={18} className={options.arrival.late ? 'text-amber-600' : 'text-zappy-600'} />
              <p className="text-[13px] text-slate-700">
                {options.arrival.late
                  ? <>Running late. We have told your {job.noun}; follow them live below, or call them.</>
                  : <>Your {job.noun} is due by <b className="text-navy">{new Date(options.arrival.dueBy).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</b>{options.arrival.scheduled ? ' (your booked time)' : ''}.</>}
              </p>
            </div>
          )}

          <StartCodeCard jobKey={`${job.kind}:${job.id}`} code={startCode} stage={codeStage || status} noun={job.noun} />

          {options?.providerChangedAt && !job.provider && (
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900 ring-1 ring-amber-100">
              <p className="font-semibold">Your {job.noun} could not make it</p>
              <p className="mt-0.5">We are finding the next one now. If you would rather not wait, you can cancel free.</p>
            </div>
          )}
          {!job.provider && !job.terminal && options?.search && (
            <SlowSearchCard jobId={job.id} noun={job.noun} search={options.search} reschedule={options.reschedule}
              onCancel={cancel ? () => { setCancelReason(''); setCancelOpen(true); refetchOptions(); } : null} onMoved={refetchOptions} />
          )}
          {!job.provider && !job.terminal && (
            <JobBoostCard jobId={job.id} boost={options?.boost} since={job.createdAt} noun={job.noun} onBoosted={refetchOptions} />
          )}
          {options?.providerAbsent?.open && job.provider && (
            <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-100">
              <p className="text-[13px] font-semibold text-navy">Is your {job.noun} not coming?</p>
              <p className="mt-0.5 text-[12.5px] text-slate-500">Try calling them first. If they still are not on their way, we will find someone else.</p>
              <button type="button" disabled={reportingAbsent}
                onClick={async () => {
                  try { const r = await reportAbsent(job.id).unwrap(); toast.success(r.message); refetchOptions(); }
                  catch (err) { toast.error(err?.data?.error || 'Could not report that'); }
                }}
                className="mt-2.5 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-700 disabled:opacity-50">
                {reportingAbsent && <Loader2 size={14} className="animate-spin" />} Find me someone else
              </button>
            </div>
          )}

          {extras}

          {/* The same booking on a schedule (jobs/recurring): repairs/services and helping. */}
          {['repair', 'helping'].includes(job.kind) && status === 'completed' && (
            <RepeatCard jobId={job.id} noun={job.noun === 'helper' ? 'task' : 'booking'} />
          )}

          {/* At the bill (optional tip, total with it in), or after the job. */}
          {(status === 'completed' || options?.tip?.beforePayment) && (
            <JobTipCard jobId={job.id} tip={options?.tip} name={job.provider?.name ? firstNameOf(job.provider.name) : null} onTipped={refetchOptions} />
          )}

          {!['cancelled', 'failed'].includes(status) && (
            <PremiumTimeline steps={steps} activeStepIdx={activeStepIdx} timesByStatus={timesByStatus} />
          )}
          {!['cancelled', 'failed'].includes(status) && <ActivityFeed events={feedEvents} live={!job.terminal} />}

          {['cancelled', 'failed'].includes(status) && (
            <motion.div variants={fadeInUp} className="rounded-[24px] bg-white p-6 text-center ring-1 ring-slate-900/5 lg:[column-span:all]">
              <p className="text-lg font-bold text-navy">{status === 'cancelled' ? 'Booking cancelled' : 'This could not be completed'}</p>
              <p className="mx-auto mt-1.5 max-w-xs text-sm text-slate-500">{job.statusLabel || 'It is no longer being tracked.'}</p>
            </motion.div>
          )}

          <BookingSummary job={job} onReceipt={receiptHandler} />

          {status === 'completed' && job.proofs.length > 0 && (
            <motion.div variants={fadeInUp} className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
              <p className="mb-3 flex items-center gap-2 text-sm font-bold text-navy"><CheckCircle size={15} className="text-emerald-600" /> Photos of the work</p>
              <div className={`grid gap-2 ${job.proofs.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {job.proofs.map((url, i) => <ProofPhoto key={i} url={url} index={i} />)}
              </div>
            </motion.div>
          )}

          {!job.terminal && (
            <p className="flex items-center justify-center gap-2 pt-1 text-[11.5px] font-semibold text-[#647084]">
              <ShieldCheck size={14} className="text-[#12A150]" /> Payment protected, Verified professionals
            </p>
          )}
        </motion.div>

        {/* Bottom bar: rate when done, otherwise help and (when allowed) cancel. */}
        <div className="fixed inset-x-0 bottom-0 z-30" style={{ background: 'linear-gradient(180deg, rgba(245,246,248,0) 0%, rgba(245,246,248,.94) 26%, #F5F6F8 62%)' }}>
          <div className="mx-auto w-full max-w-2xl space-y-2.5 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:max-w-4xl">
            {status === 'completed' && onRate && <RatingPanel onRate={onRate} />}
            {job.terminal ? (
              <>
                {/* The same job again, one tap: the booking opens with it already chosen. */}
                {rebookHref && status === 'completed' && (
                  <button type="button" onClick={() => nav(rebookHref)} className="btn-primary w-full">
                    <Repeat2 size={18} /> Book again
                  </button>
                )}
                <button type="button" onClick={() => nav('/')} className={rebookHref && status === 'completed' ? 'btn-outline w-full' : 'btn-primary w-full'}>
                  Back to home
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => nav('/support')} className="btn-outline w-full">
                  <HeadphonesIcon size={18} /> Get help
                </button>
                {cancel && (
                  <button type="button" onClick={() => { setCancelReason(''); setCancelOpen(true); if (optionsOn) refetchOptions(); }}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-btn text-[14px] font-semibold text-ink-500 hover:text-red-600">
                    <X size={16} /> Cancel booking
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <AnimatePresence>
          {cancelOpen && cancel?.run && (
            <motion.div className="fixed inset-0 z-50 flex flex-col justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-black/50" onClick={() => setCancelOpen(false)} />
              <motion.div className="relative rounded-t-[28px] bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3"
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}>
                <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />
                <p className="text-lg font-bold text-navy">{cancelQuote?.allowed === false ? 'This one needs us' : 'Cancel this booking?'}</p>
                {optionsLoading && !cancelQuote ? (
                  <div className="flex justify-center py-5"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
                ) : (
                  <>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{cancelQuote?.message || cancel.note || 'You can cancel this booking.'}</p>
                    {cancelQuote?.allowed !== false && (cancelQuote?.feePaise > 0 || cancelQuote?.earnedPaise > 0) && (
                      <div className="mt-3 space-y-1.5 rounded-2xl bg-slate-50 p-3 text-[13px]">
                        {cancelQuote.earnedPaise > 0 && <div className="flex justify-between"><span className="text-slate-500">Inspection already done</span><span className="tabular-nums">{rupees(cancelQuote.earnedPaise)}</span></div>}
                        {cancelQuote.feePaise > 0 && <div className="flex justify-between"><span className="text-slate-500">Cancellation fee</span><span className="tabular-nums">{rupees(cancelQuote.feePaise)}</span></div>}
                        {cancelQuote.paidPaise > 0 && <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold"><span>Back to you</span><span className="tabular-nums">{rupees(cancelQuote.refundPaise)}</span></div>}
                        <p className="pt-1 text-[11px] leading-relaxed text-slate-400">Cancellation fees go to the providers whose time was lost.</p>
                      </div>
                    )}
                    {cancelQuote?.allowed !== false && (options?.reasons || []).length > 0 && (
                      <div className="mt-4">
                        <p className="text-[12.5px] font-semibold text-slate-700">Why are you cancelling?</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {options.reasons.map((r) => (
                            <button key={r} type="button" onClick={() => setCancelReason(r)}
                              className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium ${cancelReason === r ? 'border-zappy-600 bg-zappy-50 text-zappy-700' : 'border-slate-200 text-slate-600'}`}>
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div className="mt-5 flex gap-3">
                  <button type="button" onClick={() => setCancelOpen(false)} className="h-12 flex-1 rounded-2xl border border-slate-200 font-semibold text-slate-700">
                    {cancelQuote?.allowed === false ? 'Close' : 'Keep booking'}
                  </button>
                  {cancelQuote?.allowed === false ? (
                    <button type="button" onClick={() => nav('/support')} className="h-12 flex-1 rounded-2xl bg-navy font-semibold text-white">Get help</button>
                  ) : (
                    <button type="button" disabled={cancelling || (optionsOn && (!cancelQuote || optionsLoading)) || (options?.reasons?.length > 0 && !cancelReason)}
                      onClick={async () => { setCancelling(true); try { await cancel.run(cancelReason || 'Cancelled by customer'); setCancelOpen(false); } finally { setCancelling(false); } }}
                      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 font-semibold text-white disabled:opacity-50">
                      {cancelling && <Loader2 size={16} className="animate-spin" />} Cancel booking
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {sosOpen && (
            <motion.div className="fixed inset-0 z-50 flex flex-col justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-black/60" onClick={() => setSosOpen(false)} />
              <motion.div className="relative rounded-t-[28px] bg-white pb-[max(2rem,env(safe-area-inset-bottom))]"
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}>
                <div className="mx-auto mb-5 mt-3 h-1 w-10 rounded-full bg-slate-200" />
                <div className="flex flex-col items-center gap-4 px-6">
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100"><ShieldAlert size={28} className="text-red-600" /></span>
                  <p className="text-center text-xl font-bold text-navy">Emergency SOS?</p>
                  <p className="text-center text-sm leading-relaxed text-slate-500">
                    This calls <strong>112</strong> and alerts the ZappyOne safety team with this booking. Use it only in a real emergency.
                  </p>
                  <div className="mt-2 w-full space-y-2.5">
                    <button type="button" onClick={sos} className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-red-600 text-base font-extrabold text-white">
                      <ShieldAlert size={20} /> Call 112, I need help
                    </button>
                    <button type="button" onClick={() => setSosOpen(false)} className="h-12 w-full rounded-2xl border border-slate-200 text-sm font-semibold text-slate-600">
                      Cancel, I'm safe
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {chatOpen && <JobChat jobId={job.id} title={job.provider?.name || `Your ${job.noun || 'pro'}`} onClose={() => setChatOpen(false)} />}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}
