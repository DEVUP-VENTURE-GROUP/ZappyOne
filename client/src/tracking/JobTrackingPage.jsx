import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  CheckCircle, HeadphonesIcon, Loader2, ShieldAlert, ShieldCheck, X, Navigation,
} from 'lucide-react';
import LiveTrackingMap from '@shared/modules/tracking/LiveTrackingMap';
import { useTrackingFeed } from '@shared/hooks/useLiveTrip';
import { useSocketStatus } from '@shared/hooks/useSocket';
import PageTransition from '../components/common/PageTransition';
import StatusNotificationBanner from '../components/tracking/StatusNotificationBanner';
import {
  TrackingHeader, MapETAChip, SearchingHero, WorkerRichCard, PremiumTimeline, ActivityFeed,
  BookingSummary, ProofPhoto, RatingPanel, stepsFor, feedCopy, firstNameOf,
} from '../components/tracking/redesign';
import { staggerContainer, fadeInUp } from '../lib/animations';
import StartCodeCard from './StartCodeCard';

/**
 * Live tracking — one page for every kind of job.
 *
 * The first version's order tracking (live map, ETA, the pro's card, a
 * timeline and live feed, the start code, SOS) applied to the new flows:
 * each kind's page turns its data into the common `job` shape
 * (tracking/kinds.js) and passes its own extras — a repair quote to approve,
 * a helping item to decide on, a payment to make.
 *
 *   job          from KINDS[kind].toJob(...)
 *   extras       the kind's own cards, shown under the live status
 *   startCode    the customer's start code once the server issues it
 *   codeStage    when the code is due at a different moment than arrival (a delivery)
 *   cancel       when it can be cancelled now: { run, note } for a simple confirm,
 *                or { open } to show the kind's own sheet (a repair quotes its fee first)
 *   onRate       rate a completed job; omitted once rated
 *   onReceipt    download the receipt, when there is one
 *   onSOS        tell ZappyOne about an emergency (112 is always dialled first)
 *   onBack       where back goes
 *   live         { workerLocation, etaMinutes } to use instead of the job's own feed
 */
export default function JobTrackingPage({ job, extras = null, startCode = null, codeStage = null, cancel = null, onRate, onReceipt, onSOS, onBack, live = null }) {
  const nav = useNavigate();
  const mapRef = useRef(null);
  const [sosOpen, setSosOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
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
        workerName={job.provider?.name}
        workerRating={job.provider?.rating ?? null}
        workerJobs={job.provider?.jobs}
        etaMinutes={eta}
      />

      <div className="min-h-screen pb-[164px]" style={{
        background: 'radial-gradient(1200px 600px at 15% -10%, #DDE6FB 0%, transparent 55%), linear-gradient(#EEF2FB, #EEF2FB)',
      }}>
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
          onBack={onBack || (() => nav(-1))}
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

          {status === 'searching' && <SearchingHero etaMinutes={null} />}

          {job.provider && !job.terminal && (
            <div className="lg:[column-span:all]">
              <WorkerRichCard
                job={job} eta={eta} status={status}
                onCall={job.provider.phone ? () => { window.location.href = `tel:${job.provider.phone}`; } : undefined}
                onLive={showMap ? () => mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : undefined}
              />
            </div>
          )}

          <StartCodeCard jobKey={`${job.kind}:${job.id}`} code={startCode} stage={codeStage || status} noun={job.noun} />

          {extras}

          {!['cancelled', 'failed'].includes(status) && (
            <PremiumTimeline steps={steps} activeStepIdx={activeStepIdx} timesByStatus={timesByStatus} />
          )}
          {!['cancelled', 'failed'].includes(status) && <ActivityFeed events={feedEvents} />}

          {['cancelled', 'failed'].includes(status) && (
            <motion.div variants={fadeInUp} className="rounded-[24px] bg-white p-6 text-center ring-1 ring-slate-900/5 lg:[column-span:all]">
              <p className="text-lg font-bold text-navy">{status === 'cancelled' ? 'Booking cancelled' : 'This could not be completed'}</p>
              <p className="mx-auto mt-1.5 max-w-xs text-sm text-slate-500">{job.statusLabel || 'It is no longer being tracked.'}</p>
            </motion.div>
          )}

          <BookingSummary job={job} onReceipt={onReceipt} />

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
              <ShieldCheck size={14} className="text-[#12A150]" /> Payment protected · Verified professionals
            </p>
          )}
        </motion.div>

        {/* Bottom bar: rate when done, otherwise help and (when allowed) cancel. */}
        <div className="fixed inset-x-0 bottom-0 z-30" style={{ background: 'linear-gradient(180deg, rgba(241,243,251,0) 0%, rgba(241,243,251,.92) 26%, #F1F3FB 62%)' }}>
          <div className="mx-auto w-full max-w-2xl space-y-2.5 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:max-w-4xl">
            {status === 'completed' && onRate && <RatingPanel onRate={onRate} />}
            {job.terminal ? (
              <button type="button" onClick={() => nav('/')}
                className="flex h-14 w-full items-center justify-center rounded-[18px] text-base font-extrabold text-white"
                style={{ background: 'linear-gradient(#2E86FF, #2E86FF)' }}>
                Back to Home
              </button>
            ) : (
              <>
                <button type="button" onClick={() => nav('/support')}
                  className="flex h-14 w-full items-center justify-center gap-2.5 rounded-[18px] text-base font-extrabold text-white"
                  style={{ background: 'linear-gradient(#2E86FF, #2E86FF)' }}>
                  <HeadphonesIcon size={19} /> Need help?
                </button>
                {cancel && (
                  <button type="button" onClick={() => (cancel.open ? cancel.open() : setCancelOpen(true))}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-white/70 text-sm font-bold text-[#647084] ring-1 ring-[#DBE2EE]">
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
                <p className="text-lg font-bold text-navy">Cancel this booking?</p>
                {cancel.note && <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{cancel.note}</p>}
                <div className="mt-5 flex gap-3">
                  <button type="button" onClick={() => setCancelOpen(false)} className="h-12 flex-1 rounded-2xl border border-slate-200 font-semibold text-slate-700">Keep booking</button>
                  <button type="button" disabled={cancelling}
                    onClick={async () => { setCancelling(true); try { await cancel.run(); setCancelOpen(false); } finally { setCancelling(false); } }}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 font-semibold text-white disabled:opacity-50">
                    {cancelling && <Loader2 size={16} className="animate-spin" />} Cancel booking
                  </button>
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
      </div>
    </PageTransition>
  );
}
