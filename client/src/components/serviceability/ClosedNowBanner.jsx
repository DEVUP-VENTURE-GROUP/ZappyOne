import { Moon } from 'lucide-react';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function to12h(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(h)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${suffix}`;
}

/** "Available from 8:00 AM" — from real provider hours; says "back soon" when hours are unknown. */
export function nextOpeningLabel(next) {
  if (!next) return 'Providers near you will be back soon';
  const when = next.daysAhead === 0 ? '' : next.daysAhead === 1 ? ' tomorrow' : ` on ${DAYS[next.day]}`;
  return `Available${when} from ${to12h(next.opensAt)}`;
}

export default function ClosedNowBanner({ nextOpening }) {
  return (
    <div className="mx-auto mt-4 w-full max-w-7xl px-4">
      <div className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200/70">
        <Moon size={18} className="mt-0.5 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-bold text-amber-900">{nextOpeningLabel(nextOpening)}</p>
          <p className="text-xs text-amber-800/80">Everyone who covers your area is offline right now. You can still browse and schedule.</p>
        </div>
      </div>
    </div>
  );
}
