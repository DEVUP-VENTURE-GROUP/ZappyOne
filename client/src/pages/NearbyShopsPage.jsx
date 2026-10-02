import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ArrowLeft, Store, Star, MapPin, Loader2, ShieldCheck, ChevronRight, SearchX } from 'lucide-react';
import { useNearbyShopsQuery } from '@shared/services/api';
import { selectLocation, selectHasLocation } from '@shared/store/locationSlice';


export default function NearbyShopsPage() {
  const nav = useNavigate();
  const loc = useSelector(selectLocation);
  const hasLocation = useSelector(selectHasLocation);
  const [service, setService] = useState('');

  const { data, isLoading, isFetching } = useNearbyShopsQuery(
    { lat: loc.lat, lng: loc.lng, service: service || undefined, radiusKm: 15 },
    { skip: !hasLocation },
  );
  const shops = useMemo(() => data?.shops || [], [data]);
  // Chips are the live services some verified shop nearby actually offers.
  const filters = useMemo(() => [{ code: '', name: 'All' }, ...(data?.services || [])], [data]);

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-10">
      <header className="page-header"><div className="page-header-inner">
        <button onClick={() => nav(-1)} className="back-btn"><ArrowLeft size={18} strokeWidth={2.5} /></button>
        <div>
          <p className="t-label">Trusted Local Businesses</p>
          <p className="font-semibold text-[#0F172A]">Nearby Shops</p>
        </div>
      </div></header>

      <div className="max-w-lg lg:max-w-2xl mx-auto px-4 pt-4 space-y-3">

        <div className="card bg-zappy-50 ring-zappy-100">
          <p className="text-xs font-medium text-zappy-700 leading-relaxed">
            Shops near you that ZappyOne has verified for each service they offer. Open one to book it.
          </p>
        </div>

        {/* Category filter chips */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {filters.map(({ code, name }) => (
            <button key={code || 'all'} onClick={() => setService(code)}
              className={`shrink-0 px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition ${service === code ? 'bg-zappy-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
              {name}
            </button>
          ))}
        </div>

        {!hasLocation ? (
          <div className="text-center py-14">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <MapPin size={28} className="text-slate-300" />
            </div>
            <p className="font-bold text-slate-700 text-sm">Enable location</p>
            <p className="text-xs text-slate-400 mt-1">We need your location to find shops near you.</p>
          </div>
        ) : isLoading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-zappy-400" /></div>
        ) : shops.length === 0 ? (
          <div className="text-center py-14">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <SearchX size={28} className="text-slate-300" />
            </div>
            <p className="font-bold text-slate-700 text-sm">No shops found nearby</p>
            <p className="text-xs text-slate-400 mt-1">You can still book any service from the home screen — we find a verified provider for you.</p>
          </div>
        ) : (
          <div className={`space-y-3 ${isFetching ? 'opacity-60' : ''}`}>
            {shops.map((s) => (
              <button key={s._id} onClick={() => nav(`/shops/${s._id}`)}
                className="card w-full text-left flex gap-3 items-center hover:ring-2 hover:ring-zappy-100 transition">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                  {s.coverImageUrl ? (
                    <img src={s.coverImageUrl} alt={s.businessName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Store size={22} className="text-slate-300" /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-sm text-[#0F172A] truncate">{s.businessName}</p>
                    <ShieldCheck size={13} className="text-emerald-500 shrink-0" />
                  </div>
                  <p className="text-xs text-slate-400 truncate">{(s.services || []).map((x) => x.name).join(' · ') || s.category}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {s.rating > 0 && (
                      <span className="flex items-center gap-0.5 text-[11px] font-bold text-slate-600">
                        <Star size={11} className="text-amber-400 fill-amber-400" /> {s.rating.toFixed(1)}
                      </span>
                    )}
                    {s.completedJobs > 0 && <span className="text-[11px] text-slate-400">{s.completedJobs} jobs done</span>}

                    {/*
                      Whether the shop is open decides whether it is worth
                      walking to. `openNow: null` means hours were never set —
                      said plainly rather than guessed in either direction.
                    */}
                    {s.openNow === true && (
                      <span className="text-[11px] font-bold text-emerald-600">
                        Open now{s.todayHours ? ` · till ${s.todayHours.closesAt}` : ''}
                      </span>
                    )}
                    {s.openNow === false && (
                      <span className="text-[11px] font-bold text-slate-400">Closed now</span>
                    )}
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-300 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
