import { useEffect, useState } from 'react';
import { Loader2, Navigation, Phone, Star } from 'lucide-react';
import LiveTrackingMap from '@shared/modules/tracking/LiveTrackingMap';
import { useTrackingFeed, tripOf } from '@shared/hooks/useLiveTrip';

/**
 * Where a job is, right now — the same card for a repair, a pet booking and a
 * helping task.
 *
 *   what is happening, and for how long → who is coming (call them)
 *   → the live map while they travel → the stages, in words a customer knows
 *
 * A customer's real question is never "what is the status" — it is "is someone
 * coming, and when". So this answers that first, and only takes real space for
 * a map once there is a live position to show.
 *
 * It deliberately does NOT count down to a promised finish: stages are timed
 * internally, but a clock in front of the customer turns one hard job into a
 * broken promise.
 */

const minutesSince = (t, now) => Math.max(0, Math.round((now - new Date(t).getTime()) / 60000));

/** Google Maps: the pro's route to the destination when we know where they are, else the place itself. */
function mapsUrl(from, to) {
  if (from && to) {
    return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=driving`;
  }
  const p = from || to;
  return p ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}` : null;
}

function ProviderRow({ provider, jobsNoun }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zappy-600 text-[15px] font-bold text-white">
        {provider.avatar
          ? <img src={provider.avatar} alt="" className="h-full w-full object-cover" />
          : (provider.name || '?').charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-navy">{provider.name}</span>
        <span className="mt-0.5 flex items-center gap-2 text-[12px] text-slate-500">
          {provider.rating != null && (
            <span className="flex items-center gap-0.5 font-semibold text-slate-600">
              <Star size={11} className="fill-amber-400 text-amber-400" />
              {Number(provider.rating).toFixed(1)}
            </span>
          )}
          {provider.completedJobs > 0 && <span>{provider.completedJobs} {jobsNoun} done</span>}
        </span>
      </span>
      {provider.phone && (
        <a
          href={`tel:${provider.phone}`}
          aria-label={`Call ${provider.name}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700"
        >
          <Phone size={16} strokeWidth={2.4} />
        </a>
      )}
    </div>
  );
}

/**
 * @param kind      'repair' | 'pet' | 'helping' — decides when there is a trip to follow
 * @param job       the booking or task as the API returns it
 * @param provider  the introduced provider card from the API, or null
 * @param label     the stage in plain words
 * @param hint      one line on what this stage means (optional)
 * @param steps     [{ label, reached }] — the stages a customer recognises
 * @param active    false once the job is over; the card then renders nothing
 */
export default function LiveJobCard({ kind, job, provider, label, hint, steps = [], active = true, jobsNoun = 'jobs' }) {
  const [now, setNow] = useState(Date.now());
  const trip = active ? tripOf(kind, job) : null;
  const { workerLocation, etaMinutes } = useTrackingFeed(job?._id, { enabled: Boolean(trip), live: active });

  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [active]);

  if (!active || !job) return null;

  const history = job.statusHistory || [];
  const stageMin = minutesSince(history.length ? history[history.length - 1].at : job.createdAt, now);
  const placedMin = minutesSince(job.createdAt, now);
  const route = trip && workerLocation ? mapsUrl(workerLocation, trip.to) : null;

  let timing;
  if (trip && etaMinutes != null) timing = trip.toCustomer ? `About ${etaMinutes} min away` : `About ${etaMinutes} min to the drop-off`;
  else timing = stageMin < 1 ? 'Just updated' : `${stageMin} min at this step`;

  return (
    <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/80" aria-live="polite">
      <div className="flex items-center gap-3 px-4 pt-4">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zappy-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-zappy-600" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold leading-tight text-navy">{label}</p>
          <p className="mt-0.5 text-[12.5px] text-slate-500">
            {timing}
            <span className="text-slate-300"> · </span>
            {placedMin < 1 ? 'just placed' : `placed ${placedMin} min ago`}
          </p>
        </div>
      </div>

      {hint && <p className="px-4 pt-1.5 text-[13px] leading-relaxed text-slate-500">{hint}</p>}

      {provider && (
        <div className="mx-4 mt-3">
          <ProviderRow provider={provider} jobsNoun={jobsNoun} />
        </div>
      )}

      {trip && (workerLocation ? (
        <div className="relative mt-3 border-y border-slate-100">
          <LiveTrackingMap
            pickup={trip.to}
            workerLocation={workerLocation}
            status="on_the_way"
            height="clamp(220px, 32vh, 360px)"
            pickupLabel={trip.toCustomer ? (trip.returning ? 'Drop here' : "You're here") : 'Drop-off'}
          />
          {route && (
            <a
              href={route}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-semibold text-navy shadow-md ring-1 ring-slate-200 transition hover:bg-slate-50"
            >
              <Navigation size={13} className="text-zappy-600" /> Open in Maps
            </a>
          )}
        </div>
      ) : (
        <p className="mx-4 mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[12.5px] text-slate-500">
          <Loader2 size={13} className="shrink-0 animate-spin text-slate-400" />
          The live map starts as soon as their phone reports in
        </p>
      ))}

      {steps.length > 0 && (
        <ol className="flex items-start gap-1.5 px-4 pb-4 pt-3.5">
          {steps.map((s) => (
            <li key={s.label} className="flex-1">
              <div className={`h-1.5 rounded-full transition-colors ${s.reached ? 'bg-zappy-500' : 'bg-slate-200'}`} />
              <p className={`mt-1.5 text-[11px] font-semibold ${s.reached ? 'text-zappy-700' : 'text-slate-400'}`}>{s.label}</p>
            </li>
          ))}
        </ol>
      )}
      {!steps.length && <div className="pb-4" />}
    </section>
  );
}
