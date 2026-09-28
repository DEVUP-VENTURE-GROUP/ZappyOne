import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { Star, Repeat2, Calendar, FileDown, Loader2, MapPin, ArrowRight,
  ChevronLeft, ChevronRight, Wrench, Sparkles } from 'lucide-react';
import { useMyJobs } from '../hooks/useMyJobs';
import { ErrorState } from '../components/common/QueryState';
import PullToRefresh from '../components/common/PullToRefresh';
import { API_BASE } from '@shared/services/apiBase';
import { selectAuth } from '@shared/modules/auth/authSlice';
import PageTransition from '../components/common/PageTransition';
import { categoryMap } from '../constants/categoryMap';
import { SkeletonList, SkeletonOrderCard } from '../components/common/Skeleton';
import { staggerContainer, fadeInUp } from '../lib/animations';
import { useT, useI18n } from '@shared/i18n/I18nProvider';
import { serviceNameKey } from '@shared/i18n/translations';
import { formatPaise } from '@shared/utils/money';
import toast from 'react-hot-toast';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
// Colour tokens per terminal status. Uses subtle tints, not saturated fills,
// so pills read as metadata (like Uber/Linear) rather than alerts.
const STATUS_STYLE = {
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-100' },
  cancelled: { bg: 'bg-slate-100',  text: 'text-slate-500',   ring: 'ring-slate-200' },
  failed:    { bg: 'bg-rose-50',    text: 'text-rose-700',    ring: 'ring-rose-100' },
};

function mapSnapshot(coordinates) {
  if (!MAPBOX_TOKEN || !coordinates?.length) return null;
  const [lng, lat] = coordinates;
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/`
    + `pin-l+2563eb(${lng},${lat})/${lng},${lat},14.5,0/640x320@2x`
    + `?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`;
}

function fmtTime(d) {
  return new Date(d).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Human-readable date bucket: "Today", "Yesterday", "14 Jul", or "Older".
// Used as sticky section headers instead of repeating a full date on every row.
function dateBucket(d, t = (k, f) => f, lang = 'en') {
  const date = new Date(d);
  const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayMs = 86_400_000;
  const diffDays = Math.round((startOf(now) - startOf(date)) / dayMs);
  const loc = `${lang}-IN`;
  if (diffDays === 0) return t('date.today', 'Today');
  if (diffDays === 1) return t('date.yesterday', 'Yesterday');
  if (diffDays < 7)   return date.toLocaleString(loc, { weekday: 'long' });
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleString(loc, { day: 'numeric', month: 'short' });
  }
  return date.toLocaleString(loc, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Service-type character for the compact rows (like Uber's auto/bike thumbnails).
// Reuses the shared categoryMap so order history matches the catalog/Home characters.
function serviceVisual(code = '') {
  const s = code.toLowerCase();
  const byId = (id) => categoryMap.find((c) => c.id === id);
  if (/bike|puncture|chain|brake|scooter|car|wash|detail|fuel|jump|breakdown|auto|van|fleet|vehicle/.test(s)) return byId('cars');
  if (/screen|battery|charging|phone|mobile|mic|speaker|camera|water|software|device|data_recovery/.test(s))          return byId('phones');
  if (/laptop/.test(s))                                                                                        return byId('laptops');
  if (/cctv|tv|router|smart|home_automation|lock/.test(s))                                                     return byId('home');
  if (/elder|medicine|grocery|hospital|companion|doctor|bill|document/.test(s))                                return byId('elders');
  if (/event/.test(s))                                                                                         return byId('events');
  if (/pet/.test(s))                                                                                           return byId('pets');
  return null;
}

/* Status pill */
function StatusPill({ job }) {
  const t = useT();
  const style = STATUS_STYLE[job.outcome];
  // The job carries its own translation key, so this never asks what kind it is.
  const label = t(job.statusKey, job.stage);
  if (!style) return <span className="text-xs font-semibold text-slate-500">{label}</span>;
  return (
    <span className={`inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full ring-1 ${style.bg} ${style.text} ${style.ring}`}>
      {label}
    </span>
  );
}

/** A service name for an order, the device for a repair — translated either way. */
function useJobTitle(job) {
  return useT()(job.titleKey, job.title);
}

/* Compact past row — clean, scannable, one line */
function CompactRow({ job, nav }) {
  const t = useT();
  const character = serviceVisual(job.iconCode);
  const title = useJobTitle(job);
  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-slate-100 last:border-0">
      <button
        onClick={() => nav(job.href)}
        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: character?.tint || 'rgba(100, 116, 139, 0.08)' }}
      >
        {character ? (
          <img src={character.thumb} alt="" width={36} height={36} loading="lazy" className="w-9 h-9 object-contain" />
        ) : (
          <Wrench size={22} className="text-slate-500" />
        )}
      </button>
      <button onClick={() => nav(job.href)} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <p className="font-bold text-[#0F172A] capitalize leading-tight truncate">{title}</p>
          <StatusPill job={job} />
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {fmtTime(job.createdAt)} · <span className="font-semibold text-[#0F172A]">{formatPaise(job.totalPaise)}</span>
          {job.rating ? <span className="ml-1.5 inline-flex items-center gap-0.5"><Star size={10} className="fill-amber-400 text-amber-400" />{job.rating}</span> : null}
        </p>
      </button>
      {job.rebookHref && (
        <button
          onClick={() => nav(job.rebookHref)}
          aria-label={`${t('activity.rebook', 'Rebook')} ${title}`}
          className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 shrink-0 active:bg-slate-50">
          <Repeat2 size={16} />
        </button>
      )}
    </div>
  );
}

/* Hero past card — ONLY for a completed job (no map on cancelled) */
function PastHero({ job, nav, onInvoice, downloadingId }) {
  const t = useT();
  const { lang } = useI18n();
  const title = useJobTitle(job);
  const url = mapSnapshot(job.coordinates);
  return (
    <motion.div variants={fadeInUp} className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden shadow-sm">
      <button onClick={() => nav(job.href)} className="block w-full text-left relative">
        {url ? (
          <img src={url} alt="trip map" className="w-full h-40 object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-40 bg-slate-800 flex items-center justify-center">
            <MapPin size={28} className="text-slate-500" />
          </div>
        )}
        <div className="absolute top-3 left-3 inline-flex items-center gap-1 bg-white/95 backdrop-blur-sm text-[10px] font-bold text-emerald-700 uppercase tracking-wider px-2 py-1 rounded-full ring-1 ring-emerald-100">
          <Sparkles size={10} strokeWidth={2.5} /> {t('activity.lastCompleted', 'Last completed')}
        </div>
      </button>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-[#0F172A] text-lg capitalize leading-tight">{title}</h3>
          <StatusPill job={job} />
        </div>
        <p className="text-sm text-slate-500 mt-1">
          {dateBucket(job.createdAt, t, lang)} · {fmtTime(job.createdAt)}
        </p>
        <p className="text-sm text-slate-500 mt-0.5">
          <span className="font-bold text-[#0F172A]">{formatPaise(job.totalPaise)}</span>
          {job.rating ? <span className="ml-1.5 inline-flex items-center gap-0.5"><Star size={11} className="fill-amber-400 text-amber-400" />{job.rating}</span> : null}
        </p>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {job.rating == null && (
            <button onClick={() => nav(job.href)}
              className="flex items-center gap-1.5 border border-slate-200 rounded-full px-4 py-2 text-sm font-semibold text-[#0F172A] active:bg-slate-50">
              <Star size={14} /> {t('activity.rate', 'Rate')}
            </button>
          )}
          {job.rebookHref && (
            <button onClick={() => nav(job.rebookHref)}
              className="flex items-center gap-1.5 border border-slate-200 rounded-full px-4 py-2 text-sm font-semibold text-[#0F172A] active:bg-slate-50">
              <Repeat2 size={14} /> {t('activity.rebook', 'Rebook')}
            </button>
          )}
          {job.canInvoice && (
            <button onClick={(e) => onInvoice(e, job.id)} disabled={downloadingId === job.id}
              className="flex items-center gap-1.5 border border-slate-200 rounded-full px-4 py-2 text-sm font-semibold text-slate-500 active:bg-slate-50 disabled:opacity-50 ml-auto">
              {downloadingId === job.id ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
              {t('activity.invoice', 'Invoice')}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * A job still in flight — order or repair, one card.
 *
 * The amber treatment is not decoration: `needsYou` means the job is STOPPED
 * until the customer does something (today, approving a repair quote), so it
 * has to outrank everything else on the screen. Orders never set it, so they
 * render exactly as they always did.
 */
function UpcomingCard({ job, nav }) {
  const t = useT();
  const title = useJobTitle(job);
  // A job that is BLOCKED on the customer says so; everything else shows where it is.
  const label = job.needsYou
    ? t('activity.approve', 'Approve')
    : t(job.statusKey, job.stage);

  return (
    <motion.button variants={fadeInUp} onClick={() => nav(job.href)}
      className={`block w-full text-left rounded-2xl bg-white shadow-sm p-4 ring-1 ${
        job.needsYou ? 'ring-amber-300' : 'ring-slate-200'
      }`}>
      <div className="flex items-center gap-3">
        <span className={`w-2.5 h-2.5 rounded-full animate-pulse shrink-0 ${
          job.needsYou ? 'bg-amber-500' : 'bg-blue-500'
        }`} />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[#0F172A] capitalize truncate">{title}</p>
          <p className="text-xs text-slate-400 truncate mt-0.5">{job.address}</p>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
          job.needsYou ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-600'
        }`}>{label}</span>
      </div>
      <div className="flex items-center justify-between mt-3">
        {/* A repair's stage is the useful line before there is a final price. */}
        <span className="font-black text-[#0F172A]">
          {job.totalPaise != null
            ? formatPaise(job.totalPaise)
            : <span className="text-xs font-semibold text-slate-500">{job.stage}</span>}
        </span>
        <span className={`flex items-center gap-1 text-xs font-bold ${
          job.needsYou ? 'text-amber-700' : 'text-blue-600'
        }`}>{t('activity.track', 'Track')} <ArrowRight size={13} /></span>
      </div>
    </motion.button>
  );
}

/* Empty-upcoming card gradient + quick-book shortcuts */
function EmptyUpcoming({ nav, suggestions }) {
  const t = useT();
  return (
    <div className="space-y-3">
      <button onClick={() => nav('/services')}
        className="relative w-full text-left rounded-2xl p-5 md:p-6 overflow-hidden ring-1 ring-slate-200/80 active:scale-[0.995] transition-transform"
        style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)' }}>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-bold text-[#0F172A] text-base">{t('activity.noUpcoming', 'No upcoming bookings')}</p>
            <p className="text-sm text-slate-500 mt-1">{t('activity.bookInMinute', 'Book a service in under a minute.')}</p>
            <p className="text-sm text-blue-600 font-semibold mt-2 flex items-center gap-1">
              {t('activity.browse', 'Browse services')} <ArrowRight size={14} />
            </p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-white/70 ring-1 ring-white shadow-sm flex items-center justify-center shrink-0">
            <Calendar size={26} className="text-blue-500" strokeWidth={2} />
          </div>
        </div>
      </button>

      {suggestions.length > 0 && (
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-2">{t('activity.bookAgain', 'Book again')}</p>
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 no-scrollbar">
            {suggestions.map((s) => (
              <button key={s.href} onClick={() => nav(s.href)}
                className="shrink-0 flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full bg-white ring-1 ring-slate-200 active:bg-slate-50">
                <span className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: s.character?.tint || 'rgba(100, 116, 139, 0.08)' }}>
                  {s.character
                    ? <img src={s.character.thumb} alt="" width={22} height={22} className="w-5.5 h-5.5 object-contain" />
                    : <Wrench size={14} className="text-slate-500" />}
                </span>
                <span className="text-xs font-bold text-[#0F172A] capitalize">{t(s.labelKey, s.label)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* Filter chip row */
function FilterChips({ filter, setFilter, counts }) {
  const t = useT();
  const opts = [
    { key: 'all',       label: t('activity.filter.all', 'All'),             n: counts.all },
    { key: 'completed', label: t('activity.filter.completed', 'Completed'), n: counts.completed },
    { key: 'cancelled', label: t('activity.filter.cancelled', 'Cancelled'), n: counts.cancelled },
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
  const t = useT();
  const { lang } = useI18n();
  const { accessToken: token } = useSelector(selectAuth);
  const [page, setPage] = useState(1);
  const [downloadingId, setDownloadingId] = useState(null);
  const [filter, setFilter] = useState('all');
  /**
   * Orders AND repairs, as one list.
   *
   * The page used to query orders itself and then bolt repairs on beside them,
   * which is how history ended up rendering one kind and not the other. There
   * is now one source: if a screen can see a job at all, it can see both kinds.
   */
  const {
    jobs, active: upcoming, past, isLoading, isFetching, isError, refetch, orderPages,
  } = useMyJobs({ page });

  async function downloadInvoice(e, orderId) {
    e.stopPropagation();
    if (downloadingId) return;
    setDownloadingId(orderId);
    try {
      const res = await fetch(`${API_BASE}/api/orders/${orderId}/invoice`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || t('activity.invoiceFailed', 'Failed to download invoice')); }
      const blob = new Blob([await res.text()], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank', 'noopener');
      if (!win) { const a = document.createElement('a'); a.href = url; a.download = `invoice-${orderId.slice(-8)}.html`; a.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { toast.error(err.message || t('activity.invoiceError', 'Could not download invoice')); }
    finally { setDownloadingId(null); }
  }

  // Hero (map card) only makes sense for a completed job — showing a big
  // pickup pin for a service that never happened misleads and gives cancelled
  // jobs undue weight. Everything else, including cancelled, uses compact rows.
  const lastCompleted = past.find((j) => j.outcome === 'completed');

  // Always exclude the featured job from the compact list so it never
  // appears twice. Counts stay stable across filters (better trust in tab labels).
  const restPast = lastCompleted ? past.filter((j) => j.id !== lastCompleted.id) : past;

  // One terminal vocabulary (see useMyJobs), so a repair filters like an order.
  const filteredRest = restPast.filter((j) =>
    filter === 'all' ? true :
    filter === 'completed' ? j.outcome === 'completed' :
    filter === 'cancelled' ? (j.outcome === 'cancelled' || j.outcome === 'failed') :
    true,
  );

  const counts = {
    all:       restPast.length,
    completed: restPast.filter((j) => j.outcome === 'completed').length,
    cancelled: restPast.filter((j) => j.outcome === 'cancelled' || j.outcome === 'failed').length,
  };

  // Under "Completed" with an empty list and a hero present, users would
  // otherwise see "No completed bookings yet" while a completed one sits
  // right above. Explain the split.
  const heroExplainsEmpty = filter === 'completed' && filteredRest.length === 0 && lastCompleted;

  // Group filtered rows by day so ten "14 Jul" rows collapse under one header.
  const grouped = useMemo(() => {
    const map = new Map();
    for (const j of filteredRest) {
      const key = dateBucket(j.createdAt, t, lang);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(j);
    }
    return [...map.entries()];
  }, [filteredRest, t, lang]);

  // "Book again" quick chips — the 3 most recent distinct things they booked.
  const suggestions = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const j of past) {
      if (!j.rebookHref || seen.has(j.rebookHref)) continue;
      seen.add(j.rebookHref);
      out.push({ href: j.rebookHref, label: j.title, labelKey: j.titleKey, character: serviceVisual(j.iconCode) });
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
          <h1 className="text-3xl font-black text-[#0F172A] tracking-tight">{t('activity.title', 'Activity')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('activity.subtitle', "Track live bookings and revisit what you've done.")}</p>
        </header>

        {isError ? (
          <ErrorState onRetry={refetch} />
        ) : isLoading ? (
          <div className="px-5 md:px-8 pt-4"><SkeletonList count={4} Item={SkeletonOrderCard} /></div>
        ) : jobs.length === 0 ? (
          <div className="px-5 md:px-8 pt-6">
            <h2 className="text-lg font-bold text-[#0F172A] mb-3">{t('activity.upcoming', 'Upcoming')}</h2>
            <EmptyUpcoming nav={nav} suggestions={[]} />
          </div>
        ) : (
          <motion.div className="px-5 md:px-8 pt-4 space-y-7" variants={staggerContainer} initial="initial" animate="animate">
            {/* Upcoming */}
            <section>
              <h2 className="text-lg font-bold text-[#0F172A] mb-3">{t('activity.upcoming', 'Upcoming')}</h2>
              {upcoming.length === 0 ? (
                <EmptyUpcoming nav={nav} suggestions={suggestions} />
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
                  {/* Anything waiting on the customer leads, whatever kind it is. */}
                  {upcoming
                    .slice()
                    .sort((a, b) => Number(b.needsYou) - Number(a.needsYou))
                    .map((j) => <UpcomingCard key={j.id} job={j} nav={nav} />)}
                </div>
              )}
            </section>

            {/* Past — hero (only if completed) + filterable, date-grouped compact list */}
            {past.length > 0 && (
              <section>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-lg font-bold text-[#0F172A]">{t('activity.past', 'Past')}</h2>
                  <span className="text-xs font-semibold text-slate-400">{t('activity.total', '{n} total').replace('{n}', past.length)}</span>
                </div>

                <div className="space-y-4">
                  {lastCompleted && (
                    <PastHero job={lastCompleted} nav={nav} onInvoice={downloadInvoice} downloadingId={downloadingId} />
                  )}

                  {restPast.length > 0 && (
                    <>
                      <FilterChips filter={filter} setFilter={setFilter} counts={counts} />

                      {grouped.length === 0 ? (
                        <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 text-center">
                          <p className="text-sm font-semibold text-slate-500">
                            {heroExplainsEmpty
                              ? t('activity.featuredAbove', 'Your only completed booking is featured above.')
                              : t('activity.noneYet', 'No {x} bookings yet').replace('{x}', t(`activity.filter.${filter}`, filter))}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {grouped.map(([label, rows]) => (
                            <div key={label}>
                              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1.5">{label}</p>
                              <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm px-4 md:px-6">
                                {rows.map((j) => <CompactRow key={j.id} job={j} nav={nav} />)}
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

            {orderPages > 1 && (
              <div className="flex items-center justify-between pt-1 pb-4">
                <button disabled={page === 1 || isFetching} onClick={() => setPage((p) => p - 1)}
                  className="flex items-center gap-1.5 border border-slate-200 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-40">
                  <ChevronLeft size={14} /> {t('activity.prev', 'Previous')}
                </button>
                <span className="text-xs font-semibold text-slate-400">{t('activity.pageOf', 'Page {p} of {n}').replace('{p}', page).replace('{n}', orderPages)}</span>
                <button disabled={page >= orderPages || isFetching} onClick={() => setPage((p) => p + 1)}
                  className="flex items-center gap-1.5 border border-slate-200 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-40">
                  {t('activity.next', 'Next')} <ChevronRight size={14} />
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
