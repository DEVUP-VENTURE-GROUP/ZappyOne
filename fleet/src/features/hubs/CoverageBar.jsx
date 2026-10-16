import { areaKm2, distanceKm, fmtKm, fmtKm2 } from './geo';

const PRESETS = [3, 5, 10, 15, 20, 25];

// Under the hub map: pick how far the hub serves (chips, slider or the map handle), with the live distance and area.
export default function CoverageBar({ center, place, serviceKm, liveKm, area = [], places = [], onServiceKm }) {
  const km = liveKm ?? serviceKm;
  const drawn = area.length >= 3;
  if (!center) return <p className="text-[12px] text-slate-500">Search a place or click the map to set the meeting point; coverage is measured from there.</p>;

  if (drawn || places.length) {
    const far = drawn ? Math.max(...area.map(([lng, lat]) => distanceKm(center, { lat, lng }))) : null;
    return (
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] text-slate-700">
        Covering {[drawn && `a drawn area of about ${fmtKm2(areaKm2(area))} km² (farthest edge ${fmtKm(far)} km from the meeting point)`, places.length && `${places.length} pincode${places.length === 1 ? '' : 's'} or area${places.length === 1 ? '' : 's'}`].filter(Boolean).join(' and ')}.
        <span className="block text-[11.5px] text-slate-500">The radius is not used while these are set. Clear them to cover by distance.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg bg-slate-50 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-semibold text-slate-600">Serve within</span>
        {PRESETS.map((p) => (
          <button key={p} type="button" onClick={() => onServiceKm(p)} aria-pressed={Number(serviceKm) === p}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${Number(serviceKm) === p ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'}`}>{p} km</button>
        ))}
      </div>
      <input type="range" min={1} max={50} step={0.5} value={km || 1} onChange={(e) => onServiceKm(Number(e.target.value))} aria-label="Service radius in km" className="w-full accent-blue-600" />
      <p className="text-[13px] text-slate-800">
        <span className="font-bold tabular-nums">{fmtKm(Number(km) || 0)} km</span> around {place || 'the meeting point'}
        <span className="text-slate-500">, about {fmtKm2(Math.PI * (Number(km) || 0) ** 2)} km². Drag the handle on the circle to adjust.</span>
      </p>
    </div>
  );
}
