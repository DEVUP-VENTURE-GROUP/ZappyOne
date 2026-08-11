import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { Star, Repeat2, Calendar, FileDown, Loader2, MapPin, ArrowRight,
  ChevronLeft, ChevronRight, Wrench, Sparkles } from 'lucide-react';
import { useListOrdersQuery } from '../services/api';
import { ErrorState } from '../components/common/QueryState';
import PullToRefresh from '../components/common/PullToRefresh';
import { API_BASE } from '../services/apiBase';
import { selectAuth } from '../modules/auth/authSlice';
import PageTransition from '../components/common/PageTransition';
import { categoryMap } from '../constants/categoryMap';
import { SkeletonList, SkeletonOrderCard } from '../components/common/Skeleton';
import { staggerContainer, fadeInUp } from '../lib/animations';
import toast from 'react-hot-toast';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const ACTIVE = new Set(['created', 'searching', 'assigned', 'on_the_way', 'arrived', 'in_progress']);

const STATUS_MAP = {
  created: 'Placed', searching: 'Searching', assigned: 'Assigned', on_the_way: 'On the way',
  arrived: 'Arrived', in_progress: 'In progress', completed: 'Completed',
  cancelled: 'Cancelled', failed: 'Failed',
};

// Colour tokens per terminal status. Uses subtle tints, not saturated fills,
// so pills read as metadata (like Uber/Linear) rather than alerts.
const STATUS_STYLE = {
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-100' },
  cancelled: { bg: 'bg-slate-100',  text: 'text-slate-500',   ring: 'ring-slate-200' },
  failed:    { bg: 'bg-rose-50',    text: 'text-rose-700',    ring: 'ring-rose-100' },
};

function mapSnapshot(order) {
  const c = order.pickupLocation?.coordinates;
  if (!MAPBOX_TOKEN || !c?.length) return null;
  const [lng, lat] = c;
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/`
    + `pin-l+2563eb(${lng},${lat})/${lng},${lat},14.5,0/640x320@2x`
    + `?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`;
}

function fmtTime(d) {
  return new Date(d).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Human-readable date bucket: "Today", "Yesterday", "14 Jul", or "Older".
// Used as sticky section headers instead of repeating a full date on every row.
function dateBucket(d) {
  const date = new Date(d);
  const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayMs = 86_400_000;
  const diffDays = Math.round((startOf(now) - startOf(date)) / dayMs);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)   return date.toLocaleString('en-IN', { weekday: 'long' });
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleString('en-IN', { day: 'numeric', month: 'short' });
  }
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Service-type character for the compact rows (like Uber's auto/bike thumbnails).
// Reuses the shared categoryMap so order history matches the catalog/Home characters.
function serviceVisual(code = '') {
  const s = code.toLowerCase();
  const byId = (id) => categoryMap.find((c) => c.id === id);
  if (/bike|puncture|chain|brake|scooter|car|wash|detail|fuel|jump|breakdown|auto|van|fleet|vehicle/.test(s)) return byId('cars');
  if (/screen|battery|charging|phone|mic|speaker|camera|water|software|device|data_recovery/.test(s))          return byId('phones');
  if (/laptop/.test(s))                                                                                        return byId('laptops');
  if (/cctv|tv|router|smart|home_automation|lock/.test(s))                                                     return byId('home');
  if (/elder|medicine|grocery|hospital|companion|doctor|bill|document/.test(s))                                return byId('elders');
  if (/event/.test(s))                                                                                         return byId('events');
  if (/pet/.test(s))                                                                                           return byId('pets');
  return null;
}

/* ─── Status pill ────────────────────────────────────────────────────────── */
function StatusPill({ status }) {
  const style = STATUS_STYLE[status];
  const label = STATUS_MAP[status] || status;
  if (!style) return <span className="text-xs font-semibold text-slate-500">{label}</span>;
  return (
    <span className={`inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full ring-1 ${style.bg} ${style.text} ${style.ring}`}>
      {label}
    </span>
  );
}

/* ─── Compact past-trip row — clean, scannable, one line ──────────────────── */
function CompactRow({ order, nav }) {
  const character = serviceVisual(order.service);
  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-slate-100 last:border-0">
      <button
        onClick={() => nav(`/orders/${order._id}`)}
        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: character?.tint || 'rgba(100, 116, 139, 0.08)' }}
      >
        {character ? (
          <img src={character.thumb} alt="" width={36} height={36} loading="lazy" className="w-9 h-9 object-contain" />
        ) : (
          <Wrench size={22} className="text-slate-500" />
        )}
      </button>
      <button onClick={() => nav(`/orders/${order._id}`)} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <p className="font-bold text-[#0F172A] capitalize leading-tight truncate">{order.service?.replace(/_/g, ' ')}</p>
          <StatusPill status={order.status} />
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {fmtTime(order.createdAt)} · <span className="font-semibold text-[#0F172A]">₹{order.pricing?.total ?? 0}</span>
          {order.userRating ? <span className="ml-1.5 inline-flex items-center gap-0.5"><Star size={10} className="fill-amber-400 text-amber-400" />{order.userRating}</span> : null}
        </p>
      </button>
      <button
        onClick={() => nav(`/book/${order.service}`)}
        aria-label={`Rebook ${order.service?.replace(/_/g, ' ')}`}
        className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 shrink-0 active:bg-slate-50">
        <Repeat2 size={16} />
      </button>
    </div>
  );
}

/* ─── Hero past-trip card — ONLY for completed orders (no map on cancelled) ─ */
function PastHero({ order, nav, onInvoice, downloadingId }) {
  const url = mapSnapshot(order);
  return (
    <motion.div variants={fadeInUp} className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden shadow-sm">
      <button onClick={() => nav(`/orders/${order._id}`)} className="block w-full text-left relative">
        {url ? (
          <img src={url} alt="trip map" className="w-full h-40 object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-40 bg-slate-800 flex items-center justify-center">
            <MapPin size={28} className="text-slate-500" />
          </div>
        )}
        <div className="absolute top-3 left-3 inline-flex items-center gap-1 bg-white/95 backdrop-blur-sm text-[10px] font-bold text-emerald-700 uppercase tracking-wider px-2 py-1 rounded-full ring-1 ring-emerald-100">
          <Sparkles size={10} strokeWidth={2.5} /> Last completed
        </div>
      </button>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-[#0F172A] text-lg capitalize leading-tight">{order.service?.replace(/_/g, ' ')}</h3>
          <StatusPill status={order.status} />
        </div>
        <p className="text-sm text-slate-500 mt-1">
          {dateBucket(order.createdAt)} · {fmtTime(order.createdAt)}
        </p>
        <p className="text-sm text-slate-500 mt-0.5">
          <span className="font-bold text-[#0F172A]">₹{order.pricing?.total ?? '0.00'}</span>
          {order.userRating ? <span className="ml-1.5 inline-flex items-center gap-0.5"><Star size={11} className="fill-amber-400 text-amber-400" />{order.userRating}</span> : null}
        </p>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {order.userRating == null && (
            <button onClick={() => nav(`/orders/${order._id}`)}
              className="flex items-center gap-1.5 border border-slate-200 rounded-full px-4 py-2 text-sm font-semibold text-[#0F172A] active:bg-slate-50">
              <Star size={14} /> Rate
            </button>
          )}
          <button onClick={() => nav(`/book/${order.service}`)}
            className="flex items-center gap-1.5 border border-slate-200 rounded-full px-4 py-2 text-sm font-semibold text-[#0F172A] active:bg-slate-50">
            <Repeat2 size={14} /> Rebook
          </button>
          <button onClick={(e) => onInvoice(e, order._id)} disabled={downloadingId === order._id}
            className="flex items-center gap-1.5 border border-slate-200 rounded-full px-4 py-2 text-sm font-semibold text-slate-500 active:bg-slate-50 disabled:opacity-50 ml-auto">
            {downloadingId === order._id ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            Invoice
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Active/upcoming card ────────────────────────────────────────────────── */
function UpcomingCard({ order, nav }) {
  return (
    <motion.button variants={fadeInUp} onClick={() => nav(`/orders/${order._id}`)}
      className="block w-full text-left rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[#0F172A] capitalize">{order.service?.replace(/_/g, ' ')}</p>
          <p className="text-xs text-slate-400 truncate mt-0.5">{order.pickupLocation?.address}</p>
        </div>
        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full shrink-0">{STATUS_MAP[order.status]}</span>
      </div>
      <div className="flex items-center justify-between mt-3">
        <span className="font-black text-[#0F172A]">₹{order.pricing?.total ?? '—'}</span>
        <span className="flex items-center gap-1 text-xs font-bold text-blue-600">Track <ArrowRight size={13} /></span>
      </div>
    </motion.button>
  );
}

/* ─── Empty-upcoming card ─ gradient + quick-book shortcuts ───────────────── */
function EmptyUpcoming({ nav, suggestions }) {
  return (
    <div className="space-y-3">
      <button onClick={() => nav('/services')}
        className="relative w-full text-left rounded-2xl p-5 md:p-6 overflow-hidden ring-1 ring-slate-200/80 active:scale-[0.995] transition-transform"
        style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)' }}>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-bold text-[#0F172A] text-base">No upcoming bookings</p>
            <p className="text-sm text-slate-500 mt-1">Book a service in under a minute.</p>
            <p className="text-sm text-blue-600 font-semibold mt-2 flex items-center gap-1">
              Browse services <ArrowRight size={14} />
            </p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-white/70 ring-1 ring-white shadow-sm flex items-center justify-center shrink-0">
            <Calendar size={26} className="text-blue-500" strokeWidth={2} />
          </div>
        </div>
      </button>

      {suggestions.length > 0 && (
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-2">Book again</p>
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 no-scrollbar">
            {suggestions.map((s) => (
              <button key={s.service} onClick={() => nav(`/book/${s.service}`)}
                className="shrink-0 flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full bg-white ring-1 ring-slate-200 active:bg-slate-50">
                <span className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: s.character?.tint || 'rgba(100, 116, 139, 0.08)' }}>
                  {s.character
                    ? <img src={s.character.thumb} alt="" width={22} height={22} className="w-5.5 h-5.5 object-contain" />
                    : <Wrench size={14} className="text-slate-500" />}
                </span>
                <span className="text-xs font-bold text-[#0F172A] capitalize">{s.service.replace(/_/g, ' ')}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Filter chip row ─────────────────────────────────────────────────────── */
function FilterChips({ filter, setFilter, counts }) {
  const opts = [
    { key: 'all',       label: 'All',       n: counts.all },
    { key: 'completed', label: 'Completed', n: counts.completed },
    { key: 'cancelled', label: 'Cancelled', n: counts.cancelled },
  ];
  return (
    <div className="flex gap-1.5 mb-3" role="tablist">
      {opts.map((o) => {
        const active = filter === o.key;
        return (
          <button key={o.key} role="tab" aria-selected={active} onClick={() => setFilter(o.key)}
            className={`text-xs font-bold px-3.5 py-1.5 rounded-full ring-1 transition-colors ${
              active ? 'bg-[#0F172A] text-white ring-[#0F172A]' : 'bg-white text-slate-600 ring-slate-200 active:bg-slate-50'
            }`}>
            {o.label}
            <span className={`ml-1.5 ${active ? 'text-white/60' : 'text-slate-400'}`}>{o.n}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function OrdersListPage() {
  const nav = useNavigate();
  const { accessToken: token } = useSelector(selectAuth);
  const [page, setPage] = useState(1);
  const [downloadingId, setDownloadingId] = useState(null);
  const [filter, setFilter] = useState('all');
  const { data, isLoading, isFetching, isError, refetch } = useListOrdersQuery(page);

  async function downloadInvoice(e, orderId) {
    e.stopPropagation();
    if (downloadingId) return;
    setDownloadingId(orderId);
    try {
      const res = await fetch(`${API_BASE}/api/orders/${orderId}/invoice`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed to download invoice'); }
      const blob = new Blob([await res.text()], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank', 'noopener');
      if (!win) { const a = document.createElement('a'); a.href = url; a.download = `invoice-${orderId.slice(-8)}.html`; a.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { toast.error(err.message || 'Could not download invoice'); }
    finally { setDownloadingId(null); }
  }

  const allOrders  = data?.orders || [];
  const totalPages = data?.totalPages || 1;
  const upcoming   = allOrders.filter((o) => ACTIVE.has(o.status));
  const past       = allOrders.filter((o) => !ACTIVE.has(o.status));

  // Hero (map card) only makes sense for a completed order — showing a big
  // pickup pin for a service that never happened misleads and gives cancelled
  // orders undue weight. Everything else, including cancelled, uses compact rows.
  const lastCompleted = past.find((o) => o.status === 'completed');

  // Always exclude the featured order from the compact list so it never
  // appears twice. Counts stay stable across filters (better trust in tab labels).
  const restPast = lastCompleted ? past.filter((o) => o._id !== lastCompleted._id) : past;

  const filteredRest = restPast.filter((o) =>
    filter === 'all' ? true :
    filter === 'completed' ? o.status === 'completed' :
    filter === 'cancelled' ? (o.status === 'cancelled' || o.status === 'failed') :
    true,
  );

  const counts = {
    all:       restPast.length,
    completed: restPast.filter((o) => o.status === 'completed').length,
    cancelled: restPast.filter((o) => o.status === 'cancelled' || o.status === 'failed').length,
  };

  // Under "Completed" with an empty list and a hero present, users would
  // otherwise see "No completed bookings yet" while a completed one sits
  // right above. Explain the split.
  const heroExplainsEmpty = filter === 'completed' && filteredRest.length === 0 && lastCompleted;

  // Group filtered rows by day so ten "14 Jul" rows collapse under one header.
  const grouped = useMemo(() => {
    const map = new Map();
    for (const o of filteredRest) {
      const key = dateBucket(o.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(o);
    }
    return [...map.entries()];
  }, [filteredRest]);

  // "Book again" quick chips — top 3 unique services from past orders.
  const suggestions = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const o of past) {
      if (!o.service || seen.has(o.service)) continue;
      seen.add(o.service);
      out.push({ service: o.service, character: serviceVisual(o.service) });
      if (out.length >= 3) break;
    }
    return out;
  }, [past]);

  return (
    <PageTransition>
      <div className="min-h-screen bg-slate-50 pb-40">
       <div className="mx-auto w-full max-w-[480px] md:max-w-[960px]">
        <PullToRefresh onRefresh={() => refetch()}>
        <header className="px-5 md:px-8 pt-8 pb-2" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2rem)' }}>
          <h1 className="text-3xl font-black text-[#0F172A] tracking-tight">Activity</h1>
          <p className="text-sm text-slate-500 mt-1">Track live bookings and revisit what you've done.</p>
        </header>

        {isError ? (
          <ErrorState onRetry={refetch} />
        ) : isLoading ? (
          <div className="px-5 md:px-8 pt-4"><SkeletonList count={4} Item={SkeletonOrderCard} /></div>
        ) : allOrders.length === 0 ? (
          <div className="px-5 md:px-8 pt-6">
            <h2 className="text-lg font-bold text-[#0F172A] mb-3">Upcoming</h2>
            <EmptyUpcoming nav={nav} suggestions={[]} />
          </div>
        ) : (
          <motion.div className="px-5 md:px-8 pt-4 space-y-7" variants={staggerContainer} initial="initial" animate="animate">
            {/* Upcoming */}
            <section>
              <h2 className="text-lg font-bold text-[#0F172A] mb-3">Upcoming</h2>
              {upcoming.length === 0 ? (
                <EmptyUpcoming nav={nav} suggestions={suggestions} />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  {upcoming.map((o) => <UpcomingCard key={o._id} order={o} nav={nav} />)}
                </div>
              )}
            </section>

            {/* Past — hero (only if completed) + filterable, date-grouped compact list */}
            {past.length > 0 && (
              <section>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-lg font-bold text-[#0F172A]">Past</h2>
                  <span className="text-xs font-semibold text-slate-400">{past.length} total</span>
                </div>

                <div className="space-y-4">
                  {lastCompleted && (
                    <PastHero order={lastCompleted} nav={nav} onInvoice={downloadInvoice} downloadingId={downloadingId} />
                  )}

                  {restPast.length > 0 && (
                    <>
                      <FilterChips filter={filter} setFilter={setFilter} counts={counts} />

                      {grouped.length === 0 ? (
                        <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 text-center">
                          <p className="text-sm font-semibold text-slate-500">
                            {heroExplainsEmpty ? 'Your only completed booking is featured above.' : `No ${filter} bookings yet`}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {grouped.map(([label, rows]) => (
                            <div key={label}>
                              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1.5">{label}</p>
                              <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm px-4 md:px-6">
                                {rows.map((o) => <CompactRow key={o._id} order={o} nav={nav} />)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </section>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1 pb-4">
                <button disabled={page === 1 || isFetching} onClick={() => setPage((p) => p - 1)}
                  className="flex items-center gap-1.5 border border-slate-200 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-40">
                  <ChevronLeft size={14} /> Previous
                </button>
                <span className="text-xs font-semibold text-slate-400">Page {page} of {totalPages}</span>
                <button disabled={page >= totalPages || isFetching} onClick={() => setPage((p) => p + 1)}
                  className="flex items-center gap-1.5 border border-slate-200 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-40">
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </motion.div>
        )}
        </PullToRefresh>
       </div>


      </div>
    </PageTransition>
  );
}
