import { useSafeBack } from '../../hooks/useBookingFlow';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  BadgeIndianRupee, Clock, HeadphonesIcon, Loader2, Navigation, Repeat2, ShieldAlert, ShieldCheck, UserX, X,
} from 'lucide-react';
import LiveTrackingMap from '@shared/modules/tracking/LiveTrackingMap';
import { useTrackingFeed } from '@shared/hooks/useLiveTrip';
import { useSocketStatus } from '@shared/hooks/useSocket';
import PageTransition from '../../components/common/PageTransition';
import StatusNotificationBanner from './cards/StatusNotificationBanner';
import {
  TrackingHeader, StatusBlock, Section, Row, SearchingHero, WorkerRichCard, ActivityFeed,
  BookingSummary, ProofPhoto, RatingPanel, feedCopy, firstNameOf,
} from './redesign';
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
      toast('112 dialled, and our safety team has been alerted', { duration: 8000 });
    } catch {
      // Never claim we were told when we were not.
      toast.error('112 dialled. We could not reach ZappyOne support. Please call us too.', { duration: 10000 });
    }
  }

  const stopped = ['cancelled', 'failed'].includes(status);
  const needsYou = ['CUSTOMER_APPROVAL_PENDING', 'AWAITING_CUSTOMER_APPROVAL', 'APPROVAL_REQUIRED'].includes(job.rawStatus);
  const openCancel = () => { setCancelReason(''); setCancelOpen(true); if (optionsOn) refetchOptions(); };

  return (
    <PageTransition>
      <StatusNotificationBanner
        status={status}
        needsYou={needsYou}
        workerName={job.provider?.name}
        workerRating={job.provider?.rating ?? null}
        workerJobs={job.provider?.jobs}
        etaMinutes={eta}
      />

      <div className="min-h-screen bg-sunken">
        <div className={`mx-auto min-h-screen w-full max-w-2xl bg-white ${job.terminal ? 'pb-[260px]' : 'pb-10'}`}>
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

          <TrackingHeader job={job} terminal={job.terminal} onBack={onBack || (() => goBack())} onSOS={() => setSosOpen(true)} onSupport={() => nav('/support')} />

          {showMap && (
            <div ref={mapRef} className="relative">
              <LiveTrackingMap
                pickup={target}
                workerLocation={workerLocation}
                status={status === 'arrived' ? 'arrived' : 'on_the_way'}
                height="38vh"
                pickupLabel={job.trip && !job.trip.toCustomer ? 'Drop-off' : "You're here"}
              />
              {route && (
                <a href={route} target="_blank" rel="noopener noreferrer"
                  className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-900 shadow-md">
                  <Navigation size={13} /> Open in Maps
                </a>
              )}
            </div>
          )}

          <StatusBlock job={job} status={status} eta={eta} options={options} needsYou={needsYou}>
            {status === 'searching' && <SearchingHero search={options?.search} noun={job.noun} />}
            <StartCodeCard jobKey={`${job.kind}:${job.id}`} code={startCode} stage={codeStage || status} noun={job.noun} />
            {options?.moreTime?.until && !job.terminal && status !== 'in_progress' && (
              <Row Icon={Clock} title={`Finishing by ${new Date(options.moreTime.until).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`}
                sub={`${options.moreTime.reason}. Nothing extra is charged unless you approve a new quote.`} />
            )}
          </StatusBlock>

          {job.provider && !job.terminal && (
            <WorkerRichCard job={job}
              onCall={job.provider.phone ? () => { window.location.href = `tel:${job.provider.phone}`; } : undefined}
              onChat={job.kind !== 'order' ? () => setChatOpen(true) : undefined} />
          )}

          {options?.providerAbsent?.open && job.provider && (
            <Section>
              <Row Icon={UserX} title={`Is your ${job.noun} not coming?`} sub="Call them first. If they still are not on their way, we will find someone else."
                right={(
                  <button type="button" disabled={reportingAbsent}
                    onClick={async () => {
                      try { const r = await reportAbsent(job.id).unwrap(); toast.success(r.message); refetchOptions(); }
                      catch (err) { toast.error(err?.data?.error || 'Could not report that'); }
                    }}
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-semibold text-ink-900 disabled:opacity-50">
                    {reportingAbsent && <Loader2 size={13} className="animate-spin" />} Find another
                  </button>
                )} />
            </Section>
          )}

          {!job.provider && !job.terminal && (
            <Section className="space-y-3">
              {options?.providerChangedAt && (
                <p className="text-[14px] text-ink-700"><b className="text-ink-900">Your {job.noun} could not make it.</b> We are finding the next one now. If you would rather not wait, you can cancel free.</p>
              )}
              {options?.search && (
                <SlowSearchCard jobId={job.id} noun={job.noun} search={options.search} reschedule={options.reschedule}
                  onCancel={cancel ? openCancel : null} onMoved={refetchOptions} />
              )}
              <JobBoostCard jobId={job.id} boost={options?.boost} since={job.createdAt} noun={job.noun} onBoosted={refetchOptions} />
            </Section>
          )}

          {extras && <Section className="space-y-3">{extras}</Section>}

          {(status === 'completed' || options?.tip?.beforePayment) && (
            <Section className="space-y-3">
              <JobTipCard jobId={job.id} tip={options?.tip} name={job.provider?.name ? firstNameOf(job.provider.name) : null} onTipped={refetchOptions} />
              {['repair', 'helping'].includes(job.kind) && status === 'completed' && <RepeatCard jobId={job.id} noun={job.noun === 'helper' ? 'task' : 'booking'} />}
            </Section>
          )}

          {status === 'completed' && job.proofs.length > 0 && (
            <Section title="Photos of the work">
              <div className={`mt-2 grid gap-2 ${job.proofs.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {job.proofs.map((url, i) => <ProofPhoto key={i} url={url} index={i} />)}
              </div>
            </Section>
          )}

          {!stopped && <ActivityFeed events={feedEvents} live={!job.terminal} />}

          <BookingSummary job={job} onReceipt={receiptHandler} />

          {!stopped && (
            <Section title="ZappyOne promise">
              <div className="divide-y divide-line">
                <Row Icon={ShieldCheck} title="Verified professionals" sub="ID and skills checked before their first job" />
                <Row Icon={BadgeIndianRupee} title="Price agreed before work" sub="Nothing extra is charged without your approval" />
                <Row Icon={HeadphonesIcon} title="Help when you need it" sub="Chat with ZappyOne support" onClick={() => nav('/support')} />
              </div>
            </Section>
          )}

          {cancel && !job.terminal && (
            <Section title="Cancel booking">
              <Row Icon={X} title="Cancel this booking" sub={cancel.note || 'You see any fee before you confirm.'} onClick={openCancel} tone="danger" />
            </Section>
          )}
        </div>

        {job.terminal && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white">
            <div className="mx-auto w-full max-w-2xl space-y-2.5 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
              {status === 'completed' && onRate && <RatingPanel onRate={onRate} name={job.provider?.name ? firstNameOf(job.provider.name) : null} />}
              {rebookHref && status === 'completed' && (
                <button type="button" onClick={() => nav(rebookHref)} className="btn-primary w-full"><Repeat2 size={18} /> Book again</button>
              )}
              <button type="button" onClick={() => nav('/')} className={rebookHref && status === 'completed' ? 'btn-outline w-full' : 'btn-primary w-full'}>Back to home</button>
            </div>
          </div>
        )}

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
