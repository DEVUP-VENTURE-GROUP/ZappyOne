import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, BadgeCheck, Clock3, MapPin, Store, Star, Timer, Users, User, Zap } from 'lucide-react';
import { useRepairVerticalsQuery, useStorefrontsQuery } from '@shared/services/api';
import { selectLocation, selectHasLocation } from '@shared/store/locationSlice';
import { useSafeBack } from '../../hooks/useBookingFlow';
import PlansNear from '../plans/PlansNear';

const SORTS = [
  { key: 'best', label: 'Recommended' },
  { key: 'fastest', label: 'Arrives soonest' },
  { key: 'cheapest', label: 'Lowest price' },
  { key: 'rating', label: 'Top rated' },
  { key: 'nearest', label: 'Nearest' },
];
const KIND = { shop: 'Shop', agency: 'Agency', company: 'Service company', individual: 'Independent pro' };
const rupees = (p) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

function Skeleton() {
  return (
    <div className="card flex gap-3">
      <div className="h-20 w-20 shrink-0 animate-pulse rounded-2xl bg-slate-200" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}

function Card({ s, onOpen, index }) {
  const Icon = s.partnerType === 'individual' ? User : s.partnerType === 'agency' || s.partnerType === 'company' ? Users : Store;
  return (
    <motion.button
      layout type="button" onClick={onOpen}
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32, delay: Math.min(index, 8) * 0.04 }}
      whileTap={{ scale: 0.98 }}
      className="card flex w-full gap-3 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zappy-400"
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-zappy-50">
        {s.imageUrl ? <img src={s.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full w-full items-center justify-center"><Icon size={28} className="text-zappy-400" /></div>}
        {s.openNow === false && <span className="absolute inset-x-0 bottom-0 bg-slate-900/75 py-0.5 text-center text-[10px] font-bold text-white">Closed now</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-bold text-[#0F172A]">{s.name}</p>
          {s.rating != null
            ? <span className="flex shrink-0 items-center gap-0.5 rounded-lg bg-emerald-600 px-1.5 py-0.5 text-[11px] font-bold text-white"><Star size={10} className="fill-white" />{s.rating.toFixed(1)}</span>
            : <span className="shrink-0 rounded-lg bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">New</span>}
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-[12px] text-slate-500"><BadgeCheck size={13} className="text-zappy-600" /> Verified {KIND[s.partnerType] || 'provider'}{s.completedJobs ? ` · ${s.completedJobs.toLocaleString('en-IN')} jobs done` : ''}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] font-semibold text-slate-700">
          {s.arrivalMinutes != null && <span className={`flex items-center gap-1 ${s.arrivalWithinPromise ? 'text-emerald-700' : ''}`}><Timer size={13} /> Arrives in ~{s.arrivalMinutes} min</span>}
          {s.distanceKm != null && <span className="flex items-center gap-1"><MapPin size={13} /> {s.distanceKm < 1 ? `${Math.round(s.distanceKm * 1000)} m` : `${s.distanceKm.toFixed(1)} km`}</span>}
          {s.onTimeRate != null && <span className="flex items-center gap-1"><Clock3 size={13} /> {Math.round(s.onTimeRate * 100)}% on time</span>}
        </div>
        <p className="mt-1.5 text-[13px] text-slate-600">{s.jobs} {s.jobs === 1 ? 'job' : 'jobs'} on the menu · from <span className="font-extrabold text-[#0F172A]">{rupees(s.fromPaise)}</span></p>
      </div>
    </motion.button>
  );
}

// Zomato-style: everyone near you who is verified and priced for this service, sorted your way; or let ZappyOne pick the fastest.
export default function StorefrontsPage() {
  const nav = useNavigate();
  const goBack = useSafeBack('/');
  const { slug = '' } = useParams();
  const vertical = slug.replace(/-/g, '_');
  const loc = useSelector(selectLocation);
  const hasLocation = useSelector(selectHasLocation);
  const [sort, setSort] = useState('best');
  const { data: services } = useRepairVerticalsQuery();
  const service = useMemo(() => services?.items?.find((i) => i.vertical === vertical), [services, vertical]);
  const { data, isLoading, isFetching } = useStorefrontsQuery({ vertical, lat: loc.lat, lng: loc.lng, sort }, { skip: !hasLocation });
  const items = data?.items || [];
  const flowPath = service?.path || `/repair/${slug}`;

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-16">
      <header className="page-header"><div className="page-header-inner">
        <button onClick={() => goBack()} className="back-btn" aria-label="Back"><ArrowLeft size={18} strokeWidth={2.5} /></button>
        <div className="min-w-0">
          <p className="t-label">Choose who comes</p>
          <p className="truncate font-semibold text-[#0F172A]">{service?.name || 'Providers near you'}</p>
        </div>
      </div></header>

      <div className="mx-auto max-w-lg space-y-3 px-4 pt-4 lg:max-w-2xl">
        <motion.button
          type="button" onClick={() => nav(flowPath)}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} whileTap={{ scale: 0.98 }}
          className="flex w-full items-center gap-3 rounded-3xl bg-zappy-600 p-4 text-left text-white shadow-lg shadow-zappy-600/20"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15"><Zap size={22} /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-extrabold">Fastest available</span>
            <span className="block text-[12.5px] text-white/85">Pick the job, and the nearest verified pro who can take it is rung for you.</span>
          </span>
        </motion.button>

        <PlansNear vertical={vertical} />

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1" role="tablist" aria-label="Sort providers">
          {SORTS.map((o) => (
            <button key={o.key} type="button" role="tab" aria-selected={sort === o.key} onClick={() => setSort(o.key)}
              className={`relative shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors ${sort === o.key ? 'text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>
              {sort === o.key && <motion.span layoutId="sort-pill" className="absolute inset-0 rounded-full bg-[#0F172A]" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
              <span className="relative">{o.label}</span>
            </button>
          ))}
        </div>

        {!hasLocation && <p className="card text-sm text-slate-600">Set your location to see who can come to you.</p>}
        {(isLoading || (isFetching && !items.length)) && hasLocation && [0, 1, 2].map((k) => <Skeleton key={k} />)}
        {!isLoading && !isFetching && hasLocation && !items.length && (
          <div className="card text-center">
            <Store size={28} className="mx-auto text-slate-300" />
            <p className="mt-2 font-bold text-slate-800">No one listed here yet</p>
            <p className="mt-1 text-sm text-slate-500">Book Fastest available and we ring every verified pro who covers your address.</p>
          </div>
        )}
        {items.length > 0 && <p className="text-[12px] font-semibold text-slate-500">{data.total} verified {data.total === 1 ? 'provider' : 'providers'} cover your address</p>}
        <AnimatePresence mode="popLayout">
          {items.map((s, i) => <Card key={`${s.kind}:${s.id}`} s={s} index={i} onOpen={() => nav(`/storefront/${s.kind}/${s.id}?service=${vertical}`, { state: { storefront: s } })} />)}
        </AnimatePresence>
      </div>
    </div>
  );
}
