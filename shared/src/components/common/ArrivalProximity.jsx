import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { metresBetween, ARRIVAL_RADIUS_M } from '../../utils/distance';
import { useGeolocation } from '../../hooks/useGeolocation';

/**
 * How close the technician is, and whether they may call themselves arrived.
 *
 * Lifted out of WorkerJobPage, where the design already existed but was welded
 * to one screen's status names and one order's shape — so the repair flow, which
 * needs exactly the same thing, had nothing.
 *
 * The radius is a real rule, not decoration: "arrived" starts the customer's
 * clock, unlocks their handover code, and on an order begins the late-penalty
 * window. Letting it be tapped from three streets away makes all three lie.
 *
 * A progress ring rather than a bare number, because "312 m away" tells a
 * technician nothing about whether they are nearly there; a ring closing tells
 * them at a glance.
 */

// Re-exported so a screen that renders this card can also read the rule it
// enforces, without importing from two places.
export { metresBetween, ARRIVAL_RADIUS_M };

/**
 * Watch the technician's own position against a destination.
 *
 * Returns `null` distance when GPS is unavailable, and callers treat that as
 * "allow it" — a technician standing at the right door with a dead GPS must not
 * be prevented from working. The rule stops casual early taps; it is not a
 * security boundary, and pretending otherwise would strand real people.
 */
export function useArrivalProximity(destination, { enabled = true } = {}) {
  const [here, setHere] = useState(null);
  // The app's tuned watch — high accuracy, cached for the next screen — rather
  // than a second set of geolocation options that would drift from it.
  const { watch } = useGeolocation();

  useEffect(() => {
    if (!enabled) return undefined;
    const stop = watch((loc) => setHere(loc), () => setHere(null));
    return stop;
  }, [enabled, watch]);

  const metres = metresBetween(here, destination);
  return {
    metres,
    // Unknown distance is permissive, deliberately — see above.
    withinRadius: metres === null || metres <= ARRIVAL_RADIUS_M,
    hasFix: here !== null,
  };
}

export default function ArrivalProximity({ metres, radius = ARRIVAL_RADIUS_M }) {
  if (metres === null || metres === undefined) return null;

  const within = metres <= radius;
  // Fills as they close the last five radii — 500 m out reads as "getting there".
  const progress = Math.max(0, Math.min(1, 1 - metres / (radius * 5)));
  const pct = Math.round(progress * 100);
  const ring = 2 * Math.PI * 16;

  return (
    <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors ${
      within ? 'bg-green-50 ring-1 ring-green-200' : 'bg-amber-50 ring-1 ring-amber-200'
    }`}>
      <div className="relative h-10 w-10 shrink-0">
        <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
          <circle cx="20" cy="20" r="16" fill="none" stroke="#e2e8f0" strokeWidth="4" />
          <circle
            cx="20" cy="20" r="16" fill="none"
            stroke={within ? '#16a34a' : '#d97706'}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${ring}`}
            strokeDashoffset={`${ring * (1 - progress)}`}
            style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center text-[9px] font-black"
          style={{ color: within ? '#16a34a' : '#d97706' }}
        >
          {pct}%
        </span>
      </div>

      <div className="min-w-0 flex-1">
        {within ? (
          <>
            <p className="text-sm font-extrabold text-green-800">You&apos;re at the location</p>
            <p className="text-xs font-medium text-green-600">
              {Math.round(metres)} m · tap to confirm arrival
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-extrabold text-amber-800">{Math.round(metres)} m away</p>
            <p className="text-xs font-medium text-amber-600">
              Get within {radius} m to mark arrived
            </p>
          </>
        )}
      </div>

      <MapPin size={16} strokeWidth={2} className={`shrink-0 ${within ? 'text-green-600' : 'text-amber-500'}`} />
    </div>
  );
}
