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
    <div className="flex items-start gap-3 rounded-xl border-l-4 border-amber-500 bg-amber-50 px-4 py-3" role="status">
      <Moon size={18} className="mt-0.5 shrink-0 text-amber-700" />
      <div>
        <p className="text-[14px] font-semibold text-amber-900">{nextOpeningLabel(nextOpening)}</p>
        <p className="text-[13px] text-amber-900/75">The pros who cover your area are offline right now. You can still browse and schedule.</p>
      </div>
    </div>
  );
}
