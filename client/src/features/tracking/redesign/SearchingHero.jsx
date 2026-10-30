import { useEffect, useState } from 'react';
import { searchStage } from '@shared/customer/searchClock';

// What the search is doing right now, with its clock (server jobs/fast-assign); a quiet line under the headline.
export default function SearchingHero({ search = null, noun = 'pro', framed = false }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!search) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [search]);
  const stage = searchStage(search, noun, now);
  return (
    <div className={`py-3.5 ${framed ? 'rounded-card border border-line bg-white px-4' : ''}`} role="status">
      <div className="relative h-1 overflow-hidden rounded-full bg-sunken">
        {stage ? (
          <span className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ${stage.overdue ? 'bg-amber-500' : 'bg-zappy-600'}`}
            style={{ width: `${Math.round(stage.pct * 100)}%` }} />
        ) : (
          <span className="absolute inset-y-0 w-1/3 rounded-full bg-zappy-600" style={{ animation: 'zpt-scan 1.8s linear infinite' }} />
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[13px]">
        <span className="text-ink-500">{stage ? stage.line : `Sending your request to verified ${noun}s nearby`}</span>
        {stage && <span className="shrink-0 font-semibold tabular-nums text-ink-900">{stage.clock}</span>}
      </div>
    </div>
  );
}
