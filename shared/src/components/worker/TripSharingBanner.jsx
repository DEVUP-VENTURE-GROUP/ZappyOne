import { Navigation } from 'lucide-react';

/**
 * What the pro sees while on a trip: whether the customer can follow them,
 * and one tap to navigate.
 *
 * `sharing` is the state from usePublishTripLocation — "pending" (waiting for
 * a first GPS fix) is not "denied", and the copy never confuses the two.
 */
export default function TripSharingBanner({ sharing, to, toCustomer = true }) {
  const live = sharing === 'sharing';
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-blue-100 bg-blue-50 p-3">
      <span className="relative mt-0.5 flex h-2.5 w-2.5 shrink-0">
        {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${live ? 'bg-blue-600' : 'bg-slate-300'}`} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-bold text-blue-900">
          {live ? 'Customer can see you on the map'
            : sharing === 'denied' ? 'Location access is blocked'
              : 'Getting your location…'}
        </p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-blue-700">
          {live
            ? (toCustomer ? 'It stops by itself the moment you mark yourself arrived.' : 'It stops by itself when this leg of the trip ends.')
            : sharing === 'denied'
              ? 'Allow location for this site in your browser so the customer can follow your trip.'
              : 'Waiting for the first GPS fix. This can take a few seconds.'}
        </p>
      </div>
      {to && (
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-2.5 py-1.5 text-[11px] font-bold text-white"
        >
          <Navigation size={11} /> Directions
        </a>
      )}
    </div>
  );
}
