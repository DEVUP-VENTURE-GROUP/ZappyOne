import { Flame, Navigation, UserX } from 'lucide-react';
import { useWorkerHotZonesQuery } from '../../services/api';

/**
 * Where to be: zones where surge is on (or nobody is) for the services this
 * worker does, near them, refreshed every minute (server jobs/surge). Going
 * there is how they earn the surge — and how customers there get served.
 * Shows nothing when nothing is hot.
 */
export default function HotZonesCard({ coords, className = '' }) {
  const [lng, lat] = coords?.length === 2 ? coords : [];
  const { data } = useWorkerHotZonesQuery({ lat, lng }, { pollingInterval: 60000 });
  const zones = data?.zones || [];
  if (!data?.on || !zones.length) return null;
  return (
    <section className={`overflow-hidden rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white ${className}`}>
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <p className="flex items-center gap-1.5 text-[14px] font-black text-orange-900"><Flame size={16} className="text-orange-500" /> Surge near you</p>
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-800">You keep {data.sharePct}% of surge</span>
      </div>
      <ul className="mt-2 divide-y divide-orange-100">
        {zones.map((z) => (
          <li key={`${z.line}-${z.lat}-${z.lng}`} className="flex items-center gap-3 px-4 py-2.5">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${z.nobody && z.multiplier <= 1 ? 'bg-slate-100 text-slate-600' : 'bg-orange-500 text-white'}`}>
              {z.nobody && z.multiplier <= 1 ? <UserX size={16} /> : <Flame size={16} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold text-slate-900">{z.service}</span>
              <span className="block text-[12px] text-slate-500">
                {z.multiplier > 1 ? `Surge ${z.multiplier.toFixed(2)}×` : 'No pro nearby yet'}
                {z.km != null ? `, ${z.km} km away` : ''}{z.demand ? `, ${z.demand} looking` : ''}
              </span>
            </span>
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${z.lat},${z.lng}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-[12px] font-semibold text-white">
              <Navigation size={12} /> Go
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
