import { useState } from 'react';
import { partsQuotedSeparately, PARTS_NOTE } from '@shared/utils/partsRule';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, BadgeCheck, ChevronDown, Clock3, MapPin, ShieldCheck, Star, Store, Timer } from 'lucide-react';
import { useGetShopProfileQuery, useRepairVerticalsQuery, useStorefrontMenuQuery } from '@shared/services/api';
import { useSafeBack } from '../../hooks/useBookingFlow';
import PlansNear from '../plans/PlansNear';

const rupees = (p) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

function MenuItem({ item, index, onBook }) {
  const [open, setOpen] = useState(item.options.length === 1);
  const single = item.options.length === 1;
  return (
    <motion.li initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 10) * 0.035 }} className="card">
      <button type="button" onClick={() => (single ? onBook(item.options[0]) : setOpen((o) => !o))} aria-expanded={single ? undefined : open} className="flex w-full items-start gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-[#0F172A]">{item.name}</span>
          <span className="mt-0.5 flex items-center gap-2 text-[12px] text-slate-500">
            {item.minutes && <span className="flex items-center gap-1"><Clock3 size={12} /> about {item.minutes} min</span>}
            {item.quoted && <span>Final price after a look</span>}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[11px] font-semibold text-slate-500">{single ? '' : 'from'}</span>
          <span className="block font-extrabold text-[#0F172A]">{rupees(item.fromPaise)}</span>
        </span>
        {single ? <span className="shrink-0 self-center rounded-xl bg-zappy-600 px-3 py-1.5 text-[12.5px] font-bold text-white">Book</span> : <ChevronDown size={18} className={`mt-1 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      <AnimatePresence initial={false}>
        {open && !single && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 grid grid-cols-2 gap-2">
              {item.options.map((o) => (
                <motion.button key={o.brandCode} type="button" whileTap={{ scale: 0.96 }} onClick={() => onBook(o)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-left hover:border-zappy-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zappy-400">
                  <span className="block text-[12.5px] font-semibold text-slate-600">{o.typeName}</span>
                  <span className="block font-extrabold text-[#0F172A]">{rupees(o.totalPaise)}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

// One provider's storefront for one service: who they are, why to trust them, and their own prices; a tap books them.
export default function StorefrontPage() {
  const nav = useNavigate();
  const goBack = useSafeBack('/');
  const { kind, id } = useParams();
  const [params] = useSearchParams();
  const [picked, setPicked] = useState(params.get('service') || '');
  // Opened from the provider's own shared link: kept for this tab so the booking that follows counts as their customer.
  const via = params.get('via');
  if (via && /^[a-z0-9]{8,24}$/.test(via)) { try { sessionStorage.setItem(`zappy:via:${kind}:${id}`, via); } catch { /* private mode */ } }
  const passed = useLocation().state?.storefront || null;
  const { data: shopData } = useGetShopProfileQuery(id, { skip: kind !== 'shop' });
  const { data: services } = useRepairVerticalsQuery();
  const shop = shopData?.shop;
  // Every service this provider is verified for that books on the repair engine; a link without one opens the first.
  const offered = (services?.items || []).filter((i) => (shop?.services || []).some((x) => (x.code || x) === i.line));
  const vertical = picked || offered[0]?.vertical || '';
  const { data: menu, isLoading } = useStorefrontMenuQuery({ kind, id, vertical }, { skip: !vertical });
  const service = services?.items?.find((i) => i.vertical === vertical);
  const name = shop?.businessName || passed?.name || 'Provider';
  const rating = shop ? (shop.reviewCount ? shop.rating : null) : passed?.rating ?? null;
  const cover = shop?.coverImageUrl || passed?.imageUrl || null;
  const items = menu?.items || [];

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-20">
      <div className="relative h-56 overflow-hidden bg-zappy-100">
        {cover
          ? <motion.img initial={{ scale: 1.08 }} animate={{ scale: 1 }} transition={{ duration: 0.8 }} src={cover} alt="" className="h-full w-full object-cover" />
          : <div className="flex h-full w-full items-center justify-center"><Store size={44} className="text-zappy-300" /></div>}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-black/40" />
        <button onClick={() => goBack()} aria-label="Back" className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/95 shadow"><ArrowLeft size={18} strokeWidth={2.5} /></button>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="absolute inset-x-4 bottom-4 text-white">
          <p className="text-[12px] font-semibold text-white/85">{service?.name || 'Service'}</p>
          <h1 className="text-2xl font-extrabold leading-tight">{name}</h1>
        </motion.div>
      </div>

      <div className="mx-auto -mt-3 max-w-lg space-y-3 px-4 lg:max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card relative grid grid-cols-3 gap-2 text-center">
          <div><p className="flex items-center justify-center gap-1 font-extrabold text-[#0F172A]">{rating != null ? <><Star size={14} className="fill-amber-400 text-amber-400" />{rating.toFixed(1)}</> : 'New'}</p><p className="text-[11px] text-slate-500">{shop?.reviewCount || passed?.reviewCount || 0} reviews</p></div>
          <div><p className="font-extrabold text-[#0F172A]">{(shop?.completedJobs ?? passed?.completedJobs ?? 0).toLocaleString('en-IN')}</p><p className="text-[11px] text-slate-500">jobs done</p></div>
          <div><p className="flex items-center justify-center gap-1 font-extrabold text-[#0F172A]"><Timer size={14} />{passed?.arrivalMinutes != null ? `${passed.arrivalMinutes}m` : '-'}</p><p className="text-[11px] text-slate-500">to arrive</p></div>
        </motion.div>

        <div className="flex flex-wrap gap-2 text-[12px] font-semibold">
          <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-zappy-700 ring-1 ring-zappy-100"><BadgeCheck size={13} /> Verified for this service</span>
          <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200"><ShieldCheck size={13} /> Price fixed before they arrive</span>
          {shop?.address?.city && <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200"><MapPin size={13} /> {shop.address.city}</span>}
          {shop?.todayHours && <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200"><Clock3 size={13} /> {shop.openNow ? 'Open now' : 'Closed now'} · {shop.todayHours}</span>}
        </div>
        {shop?.bio && <p className="text-sm leading-relaxed text-slate-600">{shop.bio}</p>}
        {offered.length > 1 && (
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Services">
            {offered.map((o) => <button key={o.vertical} type="button" role="tab" aria-selected={o.vertical === vertical} onClick={() => setPicked(o.vertical)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold ${o.vertical === vertical ? 'bg-[#0F172A] text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>{o.name}</button>)}
          </div>
        )}

        <PlansNear vertical={vertical} providerId={id} title="Their monthly plans" />
        <h2 className="pt-2 text-lg font-extrabold text-[#0F172A]">Menu</h2>
        {partsQuotedSeparately(vertical, services?.items) && <p className="rounded-xl bg-zappy-50 px-3 py-2 text-[12.5px] font-semibold text-zappy-800">{PARTS_NOTE.customer}</p>}
        {isLoading && [0, 1, 2].map((k) => <div key={k} className="card h-16 animate-pulse bg-slate-100" />)}
        {!isLoading && !items.length && <p className="card text-sm text-slate-600">This provider has no bookable prices for this service right now.</p>}
        <ul className="space-y-2">
          {items.map((item, i) => <MenuItem key={item.repairCode} item={item} index={i} onBook={(o) => nav(o.path)} />)}
        </ul>
        <p className="pt-2 text-center text-[12px] text-slate-500">Anything extra on the day is sent to you in the app first, with a photo. You pay only what you approve.</p>
      </div>
    </div>
  );
}
