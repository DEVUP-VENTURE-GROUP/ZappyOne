import { useState } from 'react';
import { to12h } from '@shared/customer/opening';
import { partsQuotedSeparately, PARTS_NOTE } from '@shared/utils/partsRule';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ArrowLeft, BadgeCheck, BadgeIndianRupee, ChevronDown, Clock3, MapPin, Share2, ShieldCheck, Star, ThumbsUp } from 'lucide-react';
import { useGetShopProfileQuery, useGetWorkerPublicProfileQuery, useRepairVerticalsQuery, useStorefrontMenuQuery } from '@shared/services/api';
import { useSafeBack } from '../../hooks/useBookingFlow';
import Avatar from '../tracking/redesign/Avatar';
import PlansNear from '../plans/PlansNear';

const rupees = (p) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const monthYear = (d) => new Date(d).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

function MenuItem({ item, onBook }) {
  const single = item.options.length === 1;
  const [open, setOpen] = useState(false);
  return (
    <li className="py-4">
      <button type="button" onClick={() => (single ? onBook(item.options[0]) : setOpen((o) => !o))} aria-expanded={single ? undefined : open} className="flex w-full items-center gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-[15.5px] font-bold text-ink-900">{item.name}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-ink-500">
            <span className="font-semibold tabular-nums text-ink-900">{single ? '' : 'from '}{rupees(item.fromPaise)}</span>
            {item.minutes && <span className="flex items-center gap-1"><Clock3 size={13} /> about {item.minutes} min</span>}
            {item.quoted && <span>Final price after a look</span>}
          </span>
          {item.includes?.length > 0 && <span className="mt-1.5 block text-[12.5px] leading-snug text-ink-500">Includes {item.includes.join(' · ')}</span>}
        </span>
        {item.photoUrl && <img src={item.photoUrl} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-btn object-cover sm:h-24 sm:w-24" />}
        {single
          ? <span className="shrink-0 rounded-btn border border-zappy-600 px-4 py-1.5 text-[14px] font-bold text-zappy-700">Book</span>
          : <span className="flex shrink-0 items-center gap-1 rounded-btn border border-line px-3 py-1.5 text-[13.5px] font-semibold text-ink-700">{item.options.length} options <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} /></span>}
      </button>
      <AnimatePresence initial={false}>
        {open && !single && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 grid grid-cols-2 gap-2">
              {item.options.map((o) => (
                <button key={o.brandCode} type="button" onClick={() => onBook(o)}
                  className="rounded-btn border border-line px-3 py-2.5 text-left hover:border-zappy-600">
                  <span className="block text-[13px] text-ink-500">{o.typeName}</span>
                  <span className="block text-[15px] font-bold tabular-nums text-ink-900">{rupees(o.totalPaise)}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function Stars({ value }) {
  return (
    <span className="flex gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={13} className={n <= value ? 'fill-amber-400 text-amber-400' : 'fill-line text-line'} />)}
    </span>
  );
}

// One provider's storefront for one service: who they are, why to trust them, and their own prices; a tap books them.
export default function StorefrontPage() {
  const nav = useNavigate();
  const goBack = useSafeBack('/');
  const { kind, id } = useParams();
  const [params] = useSearchParams();
  const [picked, setPicked] = useState(params.get('service') || '');
  const [viewing, setViewing] = useState(null);
  // Opened from the provider's own shared link: kept for this tab so the booking that follows counts as their customer.
  const via = params.get('via');
  if (via && /^[a-z0-9]{8,24}$/.test(via)) { try { sessionStorage.setItem(`zappy:via:${kind}:${id}`, via); } catch { /* private mode */ } }
  const passed = useLocation().state?.storefront || null;
  const { data: shopData } = useGetShopProfileQuery(id, { skip: kind !== 'shop' });
  const { data: workerData } = useGetWorkerPublicProfileQuery(id, { skip: kind !== 'worker' });
  const { data: services } = useRepairVerticalsQuery();
  const shop = shopData?.shop;
  const pro = workerData?.worker;
  // Every service this provider is verified for that books on the repair engine; a link without one opens the first.
  const lines = shop ? (shop.services || []).map((x) => x.code || x) : (pro?.verifiedServices || []).map((v) => v.code);
  const offered = (services?.items || []).filter((i) => lines.includes(i.line));
  const vertical = picked || offered[0]?.vertical || '';
  const { data: menu, isLoading } = useStorefrontMenuQuery({ kind, id, vertical }, { skip: !vertical });
  const service = services?.items?.find((i) => i.vertical === vertical);
  // The name they registered for this service comes first (a dance school inside a repair shop's account).
  const name = menu?.serviceName || shop?.businessName || pro?.name || passed?.name || 'Provider';
  const rating = shop ? (shop.reviewCount ? shop.rating : null) : pro ? pro.rating : passed?.rating ?? null;
  const reviewCount = shop?.reviewCount ?? pro?.ratingCount ?? passed?.reviewCount ?? 0;
  const jobs = shop?.completedJobs ?? pro?.completedJobs ?? passed?.completedJobs ?? 0;
  const cover = menu?.serviceImageUrl || shop?.coverImageUrl || null;
  const photo = pro?.photo || passed?.imageUrl || null;
  const verified = shop ? true : pro ? pro.verified : true;
  const items = menu?.items || [];
  const reviews = (workerData?.reviews || []).filter((r) => r.text).slice(0, 3);
  const gallery = [cover, ...(shop?.galleryImages || [])].filter((u, i, a) => u && u.startsWith('http') && a.indexOf(u) === i);
  const week = [...(shop?.hours || [])].sort((x, y) => x.day - y.day);
  const today = new Date(Date.now() + 330 * 60000).getUTCDay();

  async function share() {
    const url = window.location.href.split('#')[0];
    try {
      if (navigator.share) await navigator.share({ title: name, text: `${name} on ZappyOne`, url });
      else { await navigator.clipboard.writeText(url); toast.success('Link copied'); }
    } catch { /* closed the share sheet */ }
  }

  return (
    <div className="min-h-screen bg-sunken">
      <div className="mx-auto min-h-screen max-w-2xl bg-white pb-16">
        <div className="relative h-36 overflow-hidden bg-zappy-700 sm:h-44">
          {cover
            ? <><img src={cover} alt="" className="h-full w-full object-cover" /><div className="absolute inset-0 bg-black/25" /></>
            : <img src="/branding/zappy-mark.webp" alt="" className="pointer-events-none absolute -right-8 -top-10 h-56 w-56 rotate-12 object-contain opacity-[0.12] brightness-0 invert" />}
          <button type="button" onClick={() => goBack()} aria-label="Back" className="absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white text-ink-900"><ArrowLeft size={19} strokeWidth={2.4} /></button>
          <button type="button" onClick={share} aria-label="Share" className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white text-ink-900"><Share2 size={17} /></button>
        </div>

        <section className="border-b-8 border-sunken px-4 pb-5 sm:px-6">
          <div className="relative z-10 -mt-12 flex items-end justify-between gap-3">
            <span className="rounded-[30px] bg-white p-1"><Avatar name={name} photo={photo} size={96} radius={26} /></span>
          </div>
          <h1 className="mt-3 text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-ink-900 [text-wrap:balance]">{name}</h1>
          <p className="mt-0.5 text-[14px] text-ink-500">
            {service?.name || 'Service'}{pro?.memberSince ? ` · on ZappyOne since ${monthYear(pro.memberSince)}` : ''}{shop?.address?.city ? ` · ${shop.address.city}` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[12.5px] font-semibold">
            {verified && <span className="flex items-center gap-1 rounded-full bg-zappy-50 px-2.5 py-1 text-zappy-700"><BadgeCheck size={14} /> Verified</span>}
            {pro?.neverCancels && <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-green-800"><ThumbsUp size={13} /> Never cancels</span>}
            {shop?.todayHours && <span className="flex items-center gap-1 rounded-full bg-sunken px-2.5 py-1 text-ink-700"><Clock3 size={13} /> {shop.openNow ? 'Open now' : 'Closed now'} · {to12h(shop.todayHours.opensAt)} – {to12h(shop.todayHours.closesAt)}</span>}
          </div>

          <dl className="mt-5 grid grid-cols-3 divide-x divide-line rounded-card border border-line py-3 text-center">
            <div>
              <dd className="flex items-center justify-center gap-1 text-[18px] font-extrabold tabular-nums text-ink-900">{rating != null ? <><Star size={16} className="fill-amber-400 text-amber-400" />{Number(rating).toFixed(1)}</> : 'New'}</dd>
              <dt className="text-[12.5px] text-ink-500">{reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}</dt>
            </div>
            <div>
              <dd className="text-[18px] font-extrabold tabular-nums text-ink-900">{Number(jobs).toLocaleString('en-IN')}</dd>
              <dt className="text-[12.5px] text-ink-500">jobs done</dt>
            </div>
            <div>
              <dd className="text-[18px] font-extrabold tabular-nums text-ink-900">{passed?.arrivalMinutes != null ? `${passed.arrivalMinutes} min` : pro?.acceptRate != null ? `${pro.acceptRate}%` : '-'}</dd>
              <dt className="text-[12.5px] text-ink-500">{passed?.arrivalMinutes != null ? 'to arrive' : 'jobs accepted'}</dt>
            </div>
          </dl>
          {shop?.bio && <p className="mt-4 text-[14.5px] leading-relaxed text-ink-700">{shop.bio}</p>}
          {Number.isFinite(shop?.yearsActive) && shop.yearsActive > 0 && <p className="mt-2 text-[13px] font-semibold text-ink-500">{shop.yearsActive} {shop.yearsActive === 1 ? 'year' : 'years'} in this work</p>}
        </section>

        {gallery.length > 0 && (
          <section className="border-b-8 border-sunken py-5">
            <h2 className="px-4 text-[17px] font-extrabold text-ink-900 sm:px-6">Their work</h2>
            <div className="no-scrollbar mt-3 flex snap-x gap-2.5 overflow-x-auto px-4 sm:px-6">
              {gallery.map((src, i) => (
                <button key={src} type="button" onClick={() => setViewing(i)} aria-label={`Photo ${i + 1} of ${gallery.length}`} className="h-32 w-44 shrink-0 snap-start overflow-hidden rounded-card bg-sunken">
                  <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </section>
        )}
        <AnimatePresence>
          {viewing != null && (
            <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setViewing(null)} role="dialog" aria-label="Photo">
              <img src={gallery[viewing]} alt="" className="max-h-[85vh] max-w-full rounded-xl object-contain" />
            </motion.div>
          )}
        </AnimatePresence>

        {week.length > 0 && (
          <section className="border-b-8 border-sunken px-4 py-5 sm:px-6">
            <h2 className="text-[17px] font-extrabold text-ink-900">Opening hours</h2>
            <dl className="mt-3 divide-y divide-line">
              {week.map((h) => (
                <div key={h.day} className={`flex justify-between py-2 text-[14px] ${h.day === today ? 'font-bold text-ink-900' : 'text-ink-700'}`}>
                  <dt>{DAY_NAMES[h.day]}{h.day === today ? ' (today)' : ''}</dt>
                  <dd className="tabular-nums">{h.isClosed || !h.opensAt ? 'Closed' : `${to12h(h.opensAt)} – ${to12h(h.closesAt)}`}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="border-b-8 border-sunken px-4 py-2 sm:px-6">
          {[
            [ShieldCheck, 'Checked by ZappyOne', 'ID and skills verified before their first job'],
            [BadgeIndianRupee, 'Price agreed before work', 'Nothing extra is charged without your OK'],
            ...(shop?.address?.city ? [[MapPin, shop.address.city, 'Where they work from']] : []),
          ].map(([Icon, t, sub]) => (
            <div key={t} className="flex items-center gap-3.5 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sunken text-ink-900"><Icon size={19} /></span>
              <span className="min-w-0"><span className="block text-[15px] font-semibold text-ink-900">{t}</span><span className="block text-[13px] text-ink-500">{sub}</span></span>
            </div>
          ))}
        </section>

        <section className="border-b-8 border-sunken px-4 pt-5 sm:px-6">
          <h2 className="text-[19px] font-extrabold text-ink-900">Their prices</h2>
          {offered.length > 1 && (
            <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6" role="tablist" aria-label="Services">
              {offered.map((o) => (
                <button key={o.vertical} type="button" role="tab" aria-selected={o.vertical === vertical} onClick={() => setPicked(o.vertical)}
                  className={`shrink-0 rounded-full px-4 py-2 text-[13.5px] font-semibold ${o.vertical === vertical ? 'bg-ink-900 text-white' : 'border border-line text-ink-700'}`}>{o.name}</button>
              ))}
            </div>
          )}
          {partsQuotedSeparately(vertical, services?.items) && <p className="mt-3 rounded-btn bg-sunken px-3 py-2.5 text-[13px] text-ink-700">{PARTS_NOTE.customer}</p>}
          {isLoading && <div className="mt-3 space-y-3 pb-4">{[0, 1, 2].map((k) => <div key={k} className="h-14 animate-pulse rounded-btn bg-sunken" />)}</div>}
          {!isLoading && !items.length && <p className="py-5 text-[14px] text-ink-500">{vertical ? 'No bookable prices for this service right now.' : 'This provider has no services you can book here yet.'}</p>}
          <ul className="divide-y divide-line">
            {items.map((item) => <MenuItem key={item.repairCode} item={item} onBook={(o) => nav(o.path)} />)}
          </ul>
        </section>

        <PlansNear vertical={vertical} providerId={id} title="Their monthly plans" />

        {reviews.length > 0 && (
          <section className="border-b-8 border-sunken px-4 py-5 sm:px-6">
            <h2 className="text-[19px] font-extrabold text-ink-900">What customers say</h2>
            <ul className="mt-2 divide-y divide-line">
              {reviews.map((r, i) => (
                <li key={i} className="py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <Stars value={r.rating} />
                    {r.at && <span className="text-[12px] text-ink-400">{monthYear(r.at)}</span>}
                  </div>
                  <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-900">{r.text}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="px-6 pt-5 text-center text-[12.5px] text-ink-500">Anything extra on the day is sent to you in the app first, with a photo. You pay only what you approve.</p>
      </div>
    </div>
  );
}
