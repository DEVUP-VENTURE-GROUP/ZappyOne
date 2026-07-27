import { useState } from 'react';
import { Star, CheckCircle2, Sparkles, Users, Info, MapPin, Clock, Award } from 'lucide-react';
import { useGetNearbyProsQuery } from '../../services/api';
import WorkerProfileSheet from '../worker/WorkerProfileSheet';

/**
 * Worker-choice: lets the customer optionally pick a specific pro before booking.
 * Default is "Auto-match" (recommended) — the platform's ranked assignment. If the
 * customer picks a pro, dispatch offers that pro first (server: dispatch.customerPreferredWorkerId).
 *
 * Ranking comes straight from the dispatch scorer, so "Recommended" here is the
 * same worker the system would prioritise anyway.
 */
export default function ProPicker({ service, lat, lng, value, onChange }) {
  const [profileId, setProfileId] = useState(null);
  const skip = !service || lat == null || lng == null;
  const { data, isLoading, isError } = useGetNearbyProsQuery(
    { service, lat, lng },
    { skip, refetchOnMountOrArgChange: true },
  );

  const pros = data?.pros || [];
  // Nothing useful to choose from — hide entirely (auto-match still applies).
  if (skip || isError || (!isLoading && pros.length === 0)) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <Users size={16} className="text-indigo-600" />
        <p className="text-sm font-bold text-slate-900">Choose your pro</p>
        <span className="text-[11px] font-semibold text-slate-400">optional</span>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Pick someone you trust, or let us auto-match the best available pro.
      </p>

      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
        {/* Auto-match (default) */}
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`shrink-0 w-44 rounded-xl border p-3 text-left transition-colors ${
            !value ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-400' : 'border-slate-200 bg-white'
          }`}
        >
          <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center mb-2">
            <Sparkles size={16} className="text-indigo-600" />
          </div>
          <p className="text-[13px] font-bold text-slate-900 leading-tight">Auto-match</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Best available pro</p>
          {!value && <CheckCircle2 size={15} className="text-indigo-600 mt-2" />}
        </button>

        {isLoading && (
          <div className="shrink-0 w-44 rounded-xl border border-slate-100 p-3 animate-pulse">
            <div className="w-9 h-9 rounded-full bg-slate-200 mb-2" />
            <div className="h-3 bg-slate-200 rounded w-4/5 mb-1.5" />
            <div className="h-2.5 bg-slate-100 rounded w-3/5" />
          </div>
        )}

        {pros.map((p) => {
          const active = value === p.workerId;
          const initials = (p.name || 'P').trim().charAt(0).toUpperCase();
          return (
            <div
              key={p.workerId}
              role="button"
              tabIndex={0}
              onClick={() => onChange(active ? null : p.workerId)}
              className={`relative shrink-0 w-44 rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                active ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-400' : 'border-slate-200 bg-white'
              }`}
            >
              {/* Tap ⓘ to view the pro's trust profile + reviews */}
              <button type="button" onClick={(e) => { e.stopPropagation(); setProfileId(p.workerId); }}
                className="absolute top-1.5 right-1.5 text-slate-300 hover:text-indigo-500" aria-label="View profile">
                <Info size={14} />
              </button>
              <div className="flex items-center gap-1.5 mb-2">
                {p.photo ? (
                  <img src={p.photo} alt="" className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-slate-800 text-white flex items-center justify-center text-sm font-bold">
                    {initials}
                  </div>
                )}
                {p.recommended && (
                  <span className="text-[9px] font-black uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">Top</span>
                )}
              </div>
              <p className="text-[13px] font-bold text-slate-900 leading-tight truncate">{p.name}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Star size={11} className="text-amber-400 fill-amber-400" />
                <span className="text-[11px] font-semibold text-slate-600">{p.rating}</span>
                <span className="text-[11px] text-slate-400">· {p.completedJobs} jobs</span>
              </div>
              {/* Comparison metrics (#3): experience, distance + ETA, specialties */}
              <div className="mt-1.5 space-y-1">
                {p.yearsExperience > 0 && (
                  <div className="flex items-center gap-1 text-[11px] text-slate-500">
                    <Award size={11} className="text-indigo-400 shrink-0" />
                    <span>{p.yearsExperience}+ yr{p.yearsExperience > 1 ? 's' : ''} experience</span>
                  </div>
                )}
                {p.distanceKm != null && (
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1"><MapPin size={11} className="text-rose-400 shrink-0" />{p.distanceKm} km</span>
                    {p.etaMin != null && <span className="flex items-center gap-1"><Clock size={11} className="text-emerald-500 shrink-0" />~{p.etaMin} min</span>}
                  </div>
                )}
                {p.specialties?.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {p.specialties.slice(0, 3).map((b) => (
                      <span key={b} className="text-[9px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{b}</span>
                    ))}
                  </div>
                )}
              </div>
              {active && <CheckCircle2 size={15} className="text-indigo-600 mt-2" />}
            </div>
          );
        })}
      </div>

      <WorkerProfileSheet workerId={profileId} open={!!profileId} onClose={() => setProfileId(null)} />
    </div>
  );
}
