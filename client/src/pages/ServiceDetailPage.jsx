import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import {
  ArrowLeft, ArrowUpRight, BadgeCheck, BadgePercent, CalendarClock, Check,
  Clock, Heart, Info, ListChecks, MessageSquareQuote, Share2, ShieldCheck, Star, Tag, Wrench,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageTransition from '../components/common/PageTransition';
import ServiceIllustration, { illustrationFor } from '../components/catalog/ServiceIllustration';
import ServiceFaqs from '../components/catalog/ServiceFaqs';
import { RippleLayer, useRipple } from '../components/catalog/Ripple';
import useServiceCatalog from '../hooks/useServiceCatalog';
import useFavorites from '../hooks/useFavorites';
import { useGetAvailablePromosQuery } from '../services/api';
import { selectAuth } from '../modules/auth/authSlice';
import { readSelection, selectionToQuery } from '../lib/brandSelection';
import {
  brandCategoryFor,
  brandNounFor,
  getCategoryForService,
  themeVars,
  HOW_IT_WORKS,
  PLATFORM_FAQS,
} from '../constants/catalogCategories';
import { formatDuration, formatRupees, serviceBlurb } from '../lib/serviceFacets';
import { buildPromoMap, promoBadge, promoUrgency } from '../lib/servicePromos';
import { easeSoft, reducedMotion } from '../lib/animations';

/**
 * Service detail — the page between browsing and booking.
 *
 * It is category-agnostic: theme, illustration, promises and FAQs all come from
 * whichever vertical the service belongs to, so a plumbing service and a car
 * service render through exactly this file.
 *
 * Content discipline: every section is backed by a real field on the catalog
 * row (`description`, `checklist`, `guidelines`, `requiredSkills`, price range,
 * duration) or by the live promo API. Sections with no data don't render an
 * empty shell, and nothing here fabricates ratings, review text or "1,200
 * bookings this month" style social proof.
 */

/** 'mechanic_repair' → 'Mechanic repair' — worker skill codes are snake_case. */
function humanizeSkill(skill) {
  const words = String(skill).replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function Section({ title, icon: Icon, children, className = '' }) {
  return (
    <section className={className}>
      <h2 className="mb-3 flex items-center gap-2 text-[17px] font-black tracking-tight text-navy-900">
        {Icon && <Icon size={17} strokeWidth={2.6} style={{ color: 'var(--cat-accent)' }} />}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-[22px] border border-slate-200/70 bg-white p-4 sm:p-5 ${className}`}>
      {children}
    </div>
  );
}

function RelatedCard({ service, category }) {
  return (
    <Link
      to={`/service/${service.code}`}
      className="group flex w-[210px] shrink-0 snap-start flex-col rounded-[20px] border border-slate-200/70 bg-white p-4 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-[var(--cat-border)] hover:shadow-[0_18px_34px_-20px_var(--cat-glow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cat-accent)] focus-visible:ring-offset-2 motion-reduce:transform-none"
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-[14px]"
        style={{ background: 'var(--cat-tint)' }}
      >
        <ServiceIllustration name={illustrationFor(service, category)} size={32} />
      </div>
      <span className="mt-3 line-clamp-2 text-[13.5px] font-bold leading-snug text-navy-900">
        {service.name}
      </span>
      <span className="mt-auto flex items-center gap-1 pt-3 text-[12px] font-black text-navy-900">
        {service.priceRangeMinPaise > 0 ? formatRupees(service.priceRangeMinPaise) : 'On inspection'}
        <ArrowUpRight
          size={13}
          strokeWidth={3}
          className="text-[var(--cat-accent)] transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transform-none"
        />
      </span>
    </Link>
  );
}

export default function ServiceDetailPage() {
  const { code } = useParams();
  const nav = useNavigate();
  const { accessToken } = useSelector(selectAuth);
  const { services, loading } = useServiceCatalog();
  const { isFavorite, toggle } = useFavorites();
  const { ripples, spawn } = useRipple();

  // Services missing from the cached list (deactivated, or a deep link that
  // beat the list request) fall back to the single-service endpoint.
  const [fallback, setFallback] = useState(null);
  const [fallbackDone, setFallbackDone] = useState(false);

  // Brand/model of the customer's device or vehicle, carried into the booking.
  const [selection, setSelection] = useState(null);

  const service = useMemo(
    () => services.find((s) => s.code === code) || fallback,
    [services, code, fallback],
  );

  useEffect(() => {
    if (loading || service) return;
    let cancelled = false;
    const baseUrl = import.meta.env.VITE_API_URL || '';
    fetch(`${baseUrl}/api/catalog/services/${encodeURIComponent(code)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => { if (!cancelled) setFallback(data.service || null); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFallbackDone(true); });
    return () => { cancelled = true; };
  }, [loading, service, code]);

  const category = useMemo(() => getCategoryForService(service), [service]);
  const brandCategory = useMemo(
    () => (service ? brandCategoryFor(category.key) : null),
    [service, category],
  );

  // The brand step writes to device storage; this page reflects whatever it left.
  useEffect(() => {
    if (brandCategory) setSelection(readSelection(brandCategory));
  }, [brandCategory]);

  const { data: promoData } = useGetAvailablePromosQuery(undefined, { skip: !accessToken });
  const promo = useMemo(() => {
    if (!service) return null;
    const list = Array.isArray(promoData?.promos) ? promoData.promos : [];
    return buildPromoMap(list, [service])[service.code] || null;
  }, [promoData, service]);

  const related = useMemo(() => {
    if (!service) return [];
    return services
      .filter((s) => s.code !== service.code && category.match(s))
      .slice(0, 8);
  }, [services, service, category]);

  /* ── Loading / not-found ─────────────────────────────────────────────── */

  if (!service) {
    if (loading || !fallbackDone) {
      return (
        <div className="min-h-screen bg-[#F8FAFC] p-4">
          <div className="page-container space-y-4 pt-6">
            <div className="skeleton h-[210px] rounded-[28px]" />
            <div className="skeleton h-6 w-2/3 rounded-md" />
            <div className="skeleton h-4 w-full rounded-md" />
            <div className="skeleton h-4 w-4/5 rounded-md" />
            <div className="skeleton h-40 rounded-[22px]" />
          </div>
        </div>
      );
    }
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F8FAFC] px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-slate-100">
          <Wrench size={26} className="text-slate-400" />
        </div>
        <div>
          <p className="text-lg font-black text-navy-900">Service unavailable</p>
          <p className="mt-1 text-sm text-slate-500">
            This service isn’t in the catalog right now.
          </p>
        </div>
        <Link
          to="/services"
          className="rounded-xl bg-navy-900 px-5 py-2.5 text-sm font-bold text-white"
        >
          Browse all services
        </Link>
      </div>
    );
  }

  /* ── Derived content ─────────────────────────────────────────────────── */

  const saved = isFavorite(service.code);
  const illustration = illustrationFor(service, category);
  const duration = formatDuration(service.estimatedDurationMinutes);
  const checklist = Array.isArray(service.checklist) ? service.checklist : [];
  const guidelines = Array.isArray(service.guidelines) ? service.guidelines : [];
  const tools = Array.isArray(service.requiredTools) ? service.requiredTools : [];
  const skills = Array.isArray(service.requiredSkills) ? service.requiredSkills : [];
  const gallery = [service.coverImage, service.imageUrl, ...(service.galleryImages || [])]
    .filter(Boolean)
    .filter((src, i, arr) => arr.indexOf(src) === i);

  const minPaise = Number(service.priceRangeMinPaise || 0);
  const maxPaise = Number(service.priceRangeMaxPaise || 0);
  const inspection = Number(service.inspectionFeePaise || 0);
  const discount = promoBadge(promo);
  const urgency = promoUrgency(promo);

  const rating = Number(service.rating) || null;
  const ratingCount = Number(service.ratingCount ?? service.reviewCount) || null;
  const reviews = Array.isArray(service.reviews) ? service.reviews : [];

  const faqs = [
    duration && {
      q: 'How long does this take?',
      a: `Typically about ${duration} on site. The professional confirms the actual window when the job is accepted, and you can follow progress live in the app.`,
    },
    minPaise > 0 && {
      q: 'What does the price cover?',
      a:
        maxPaise > minPaise
          ? `${formatRupees(minPaise)} is the catalog starting price for this service; the listed range runs up to ${formatRupees(maxPaise)} depending on parts and condition. Your final price is calculated when you book.`
          : `${formatRupees(minPaise)} is the catalog price for this service. Your final price is calculated when you book.`,
    },
    {
      q: 'What if the job turns out to be bigger?',
      a: 'The professional can send a revised price from the job, with photos of what they found. It appears on your tracking screen and you have five minutes to approve or reject it — if you don’t respond in that window it is approved automatically, so it’s worth keeping an eye on the order while work is in progress.',
    },
    ...PLATFORM_FAQS,
  ].filter(Boolean);

  const share = async () => {
    const payload = { title: `${service.name} · Zappy`, text: serviceBlurb(service), url: window.location.href };
    try {
      if (navigator.share) return await navigator.share(payload);
      await navigator.clipboard.writeText(payload.url);
      toast.success('Link copied');
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('Could not share this service');
    }
  };

  const book = (event) => {
    spawn(event);
    // Verticals with a brand catalog get the dedicated brand step first; it
    // preselects whatever was chosen last time and can be skipped in one tap.
    // Everything else goes straight into the existing booking flow, carrying
    // brand/model as query params that BookingPage turns into `deviceBrand` /
    // `deviceModel` — what pricing and the worker's job card already read.
    const next = brandCategory
      ? `/service/${service.code}/brand`
      : `/book/${service.code}${selectionToQuery(selection)}`;
    window.setTimeout(() => nav(next), 90);
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#F8FAFC] font-sans" style={themeVars(category.theme)}>
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden pb-8"
          style={{ background: 'linear-gradient(160deg, var(--cat-deep) 0%, var(--cat-accent) 145%)' }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl"
            style={{ background: 'rgba(255,255,255,0.6)' }}
          />

          <div
            className="page-container relative"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
          >
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => nav(-1)}
                aria-label="Go back"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors hover:bg-white/25 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ArrowLeft size={18} strokeWidth={2.4} />
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const nowSaved = toggle(service.code);
                    toast.success(nowSaved ? 'Saved to wishlist' : 'Removed from wishlist');
                  }}
                  aria-pressed={saved}
                  aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors hover:bg-white/25 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <Heart size={17} strokeWidth={2.4} className={saved ? 'fill-white' : ''} />
                </button>
                <button
                  type="button"
                  onClick={share}
                  aria-label="Share this service"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors hover:bg-white/25 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <Share2 size={16} strokeWidth={2.4} />
                </button>
              </div>
            </div>

            <div className="mt-5 flex items-end gap-4">
              <div className="min-w-0 flex-1 text-white">
                <Link
                  to={`/services/${category.key}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] backdrop-blur-sm transition-colors hover:bg-white/25"
                >
                  {category.title}
                </Link>
                <h1 className="mt-2.5 text-[26px] font-black leading-[1.12] tracking-tight sm:text-[34px]">
                  {service.name}
                </h1>
                <p className="mt-2 max-w-xl text-[13.5px] font-medium leading-relaxed text-white/80 sm:text-[15px]">
                  {serviceBlurb(service)}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {discount && (
                    <span className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11.5px] font-black text-[var(--cat-deep)]">
                      <BadgePercent size={12} strokeWidth={3} />
                      {discount} with {promo.code}
                      {urgency ? ` · ${urgency}` : ''}
                    </span>
                  )}
                  {duration && (
                    <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11.5px] font-bold text-white backdrop-blur-sm">
                      <Clock size={12} strokeWidth={2.8} /> {duration}
                    </span>
                  )}
                  {checklist.length > 0 && (
                    <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11.5px] font-bold text-white backdrop-blur-sm">
                      <ListChecks size={12} strokeWidth={2.8} /> {checklist.length}-point checklist
                    </span>
                  )}
                  {rating && (
                    <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11.5px] font-bold text-white backdrop-blur-sm">
                      <Star size={12} strokeWidth={3} className="fill-white" />
                      {rating.toFixed(1)}
                      {ratingCount ? ` (${ratingCount.toLocaleString('en-IN')})` : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* Visible on phones too — at 92px it still reads, and the hero
                  is otherwise a flat colour block on mobile. */}
              <motion.div
                aria-hidden
                className="w-[92px] shrink-0 sm:w-[150px]"
                style={{
                  '--ill-ink': 'rgba(255,255,255,0.55)',
                  '--ill-body': '#FFFFFF',
                  '--ill-tint': 'rgba(255,255,255,0.30)',
                  '--ill-pale': 'rgba(255,255,255,0.75)',
                }}
                animate={reducedMotion ? {} : { y: [-6, 6, -6] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              >
                <ServiceIllustration
                  name={illustration}
                  size={150}
                  className="h-auto w-full"
                  title={service.name}
                  spotlight={false}
                />
              </motion.div>
            </div>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        {/* No negative top margin here: the hero above is `position: relative`,
            so it paints above this (non-positioned) block and would clip the
            first heading rather than letting it overlap. */}
        <div className="page-container pt-6 pb-10">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start">
            <div className="min-w-0 space-y-7">
              {gallery.length > 0 && (
                <section aria-label="Service gallery">
                  <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                    {gallery.map((src, i) => (
                      <img
                        key={src}
                        src={src}
                        alt={`${service.name} — photo ${i + 1}`}
                        loading="lazy"
                        decoding="async"
                        width={280}
                        height={180}
                        className="h-[150px] w-[240px] shrink-0 snap-start rounded-[20px] border border-slate-200/70 bg-slate-100 object-cover sm:h-[180px] sm:w-[280px]"
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Brand/model summary. The choosing happens on its own step at
                  /service/:code/brand — this is just the current answer plus a
                  way back into it. Only rendered for verticals that have a
                  Brand catalog behind them. */}
              {brandCategory && (
                <Section title={`Your ${brandNounFor(category.key)}`} icon={Tag}>
                  <Link
                    to={`/service/${service.code}/brand`}
                    className="flex items-center gap-3 rounded-[22px] border border-slate-200/70 bg-white p-4 transition-[border-color,box-shadow] hover:border-[var(--cat-border)] hover:shadow-[0_16px_30px_-22px_var(--cat-glow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cat-accent)] focus-visible:ring-offset-2 sm:p-5"
                  >
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] p-1.5"
                      style={{ background: 'var(--cat-tint)' }}
                    >
                      {selection?.brandName ? (
                        <span className="text-[13px] font-black text-navy-900">
                          {selection.brandName.slice(0, 2).toUpperCase()}
                        </span>
                      ) : (
                        <Tag size={18} strokeWidth={2.4} style={{ color: 'var(--cat-accent)' }} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-navy-900">
                        {selection?.brandName || `Select your ${brandNounFor(category.key)} brand`}
                      </span>
                      <span className="block truncate text-[12.5px] font-medium text-slate-500">
                        {selection?.modelName
                          || (selection?.brandName ? 'Model not set' : 'Optional — helps the professional prepare')}
                      </span>
                    </span>
                    <ArrowUpRight
                      size={17}
                      strokeWidth={2.6}
                      aria-hidden
                      className="shrink-0 text-slate-400"
                    />
                  </Link>
                </Section>
              )}

              {service.description && service.description !== service.shortDescription && (
                <Section title="About this service" icon={Info}>
                  <p className="text-[14px] font-medium leading-relaxed text-slate-600">
                    {service.description}
                  </p>
                </Section>
              )}

              {checklist.length > 0 && (
                <Section title="What’s included" icon={ListChecks}>
                  <Card>
                    <ul className="grid gap-2.5 sm:grid-cols-2">
                      {checklist.map((item) => (
                        <li key={item.item} className="flex items-start gap-2.5">
                          <span
                            className="mt-0.5 flex shrink-0 items-center justify-center rounded-full"
                            style={{ background: 'var(--cat-tint)', height: 18, width: 18 }}
                          >
                            <Check size={11} strokeWidth={3.5} style={{ color: 'var(--cat-accent)' }} />
                          </span>
                          <span className="text-[13.5px] font-semibold leading-snug text-slate-700">
                            {item.item}
                            {item.required === false && (
                              <span className="ml-1 text-[11px] font-medium text-slate-400">
                                (if needed)
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </Section>
              )}

              {/* The actual booking flow in this app, not a list of promises. */}
              <Section title="How it works" icon={ShieldCheck}>
                <ol className="grid gap-3 sm:grid-cols-2">
                  {HOW_IT_WORKS.map((step, i) => (
                    <li key={step.title}>
                      <Card className="flex h-full items-start gap-3">
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-black"
                          style={{ background: 'var(--cat-tint)', color: 'var(--cat-deep)' }}
                        >
                          {i + 1}
                        </span>
                        <span>
                          <span className="block text-[13.5px] font-bold text-navy-900">
                            {step.title}
                          </span>
                          <span className="mt-0.5 block text-[12.5px] font-medium leading-relaxed text-slate-500">
                            {step.body}
                          </span>
                        </span>
                      </Card>
                    </li>
                  ))}
                </ol>
              </Section>

              {guidelines.length > 0 && (
                <Section title="Good to know" icon={Info}>
                  <Card>
                    <ul className="space-y-2.5">
                      {guidelines.map((line) => (
                        <li key={line} className="flex items-start gap-2.5">
                          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                          <span className="text-[13.5px] font-medium leading-relaxed text-slate-600">
                            {line}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </Section>
              )}

              <Section title="Ratings & reviews" icon={MessageSquareQuote}>
                {reviews.length > 0 ? (
                  <div className="space-y-3">
                    {reviews.slice(0, 4).map((review, i) => (
                      <Card key={review.id || i}>
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1 text-[13px] font-black text-navy-900">
                            <Star size={13} strokeWidth={3} className="fill-accent-500 text-accent-500" />
                            {Number(review.rating).toFixed(1)}
                          </span>
                          {review.author && (
                            <span className="text-[12.5px] font-semibold text-slate-500">
                              {review.author}
                            </span>
                          )}
                        </div>
                        {review.text && (
                          <p className="mt-2 text-[13.5px] font-medium leading-relaxed text-slate-600">
                            {review.text}
                          </p>
                        )}
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card className="flex items-start gap-3">
                    <MessageSquareQuote size={18} className="mt-0.5 shrink-0 text-slate-300" />
                    <p className="text-[13.5px] font-medium leading-relaxed text-slate-500">
                      No public reviews for this service yet. Every Zappy job is rated by the
                      customer after completion, and those ratings appear here once this
                      service has enough of them.
                    </p>
                  </Card>
                )}
              </Section>

              <ServiceFaqs faqs={faqs} />
            </div>

            {/* ── Sidebar ────────────────────────────────────────────── */}
            <aside className="space-y-4 lg:sticky lg:top-6">
              <Card className="shadow-[0_18px_40px_-30px_rgba(15,23,42,0.5)]">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  {minPaise > 0 ? 'Starting at' : 'Pricing'}
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-[30px] font-black leading-none text-navy-900">
                    {minPaise > 0 ? formatRupees(minPaise) : 'On inspection'}
                  </span>
                  {maxPaise > minPaise && (
                    <span className="text-[13px] font-bold text-slate-400">
                      – {formatRupees(maxPaise)}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[12.5px] font-medium leading-relaxed text-slate-500">
                  Your final price is calculated when you book. If the job turns out to be
                  bigger, the professional sends a revised price to your tracking screen.
                </p>

                <dl className="mt-4 space-y-2.5 border-t border-slate-100 pt-3.5 text-[12.5px]">
                  {duration && (
                    <div className="flex items-center justify-between">
                      <dt className="flex items-center gap-1.5 font-semibold text-slate-500">
                        <Clock size={13} strokeWidth={2.6} className="text-slate-400" /> Typical time
                      </dt>
                      <dd className="font-bold text-navy-900">{duration}</dd>
                    </div>
                  )}
                  {inspection > 0 && (
                    <div className="flex items-center justify-between">
                      <dt className="flex items-center gap-1.5 font-semibold text-slate-500">
                        <CalendarClock size={13} strokeWidth={2.6} className="text-slate-400" /> Inspection fee
                      </dt>
                      <dd className="font-bold text-navy-900">{formatRupees(inspection)}</dd>
                    </div>
                  )}
                  {service.subcategory && (
                    <div className="flex items-center justify-between">
                      <dt className="font-semibold text-slate-500">Category</dt>
                      <dd className="font-bold text-navy-900">{service.subcategory}</dd>
                    </div>
                  )}
                </dl>
              </Card>

              {(skills.length > 0 || tools.length > 0) && (
                <Card>
                  <h2 className="flex items-center gap-2 text-[14px] font-black text-navy-900">
                    <BadgeCheck size={16} strokeWidth={2.6} style={{ color: 'var(--cat-accent)' }} />
                    Who will come
                  </h2>
                  <p className="mt-1.5 text-[12.5px] font-medium leading-relaxed text-slate-500">
                    A Zappy professional whose registered skills cover this service — that’s
                    how the job is matched. Their name, photo and rating appear once they
                    accept.
                  </p>
                  {skills.length > 0 && (
                    <div className="mt-3">
                      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                        Required skills
                      </span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {skills.map((skill) => (
                          <span
                            key={skill}
                            className="rounded-full px-2.5 py-1 text-[11.5px] font-bold"
                            style={{ background: 'var(--cat-tint)', color: 'var(--cat-deep)' }}
                          >
                            {humanizeSkill(skill)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {tools.length > 0 && (
                    <div className="mt-3">
                      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                        Tools they bring
                      </span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {tools.map((tool) => (
                          <span
                            key={tool}
                            className="rounded-full border border-slate-200 px-2.5 py-1 text-[11.5px] font-semibold text-slate-600"
                          >
                            {humanizeSkill(tool)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              )}
            </aside>
          </div>

          {related.length > 0 && (
            <section aria-label="Related services" className="mt-9">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[17px] font-black tracking-tight text-navy-900">
                  Related services
                </h2>
                <Link
                  to={`/services/${category.key}`}
                  className="text-[12.5px] font-bold text-[var(--cat-accent)] hover:underline"
                >
                  See all
                </Link>
              </div>
              <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
                {related.map((s) => (
                  <RelatedCard key={s.code} service={s} category={category} />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── Sticky booking bar ───────────────────────────────────────── */}
        <div
          className="sticky bottom-0 z-40 border-t border-slate-200/70 bg-white/90 backdrop-blur-xl"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="page-container flex items-center gap-4 py-3">
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                {minPaise > 0 ? 'Starting at' : 'Pricing'}
              </span>
              <span className="block truncate text-[19px] font-black leading-tight text-navy-900">
                {minPaise > 0 ? formatRupees(minPaise) : 'On inspection'}
                {discount && (
                  <span className="ml-2 align-middle text-[11px] font-black text-[var(--cat-accent)]">
                    {discount}
                  </span>
                )}
              </span>
              {selection?.brandName && (
                <span className="block truncate text-[11.5px] font-semibold text-slate-500">
                  {selection.brandName}
                  {selection.modelName ? ` · ${selection.modelName}` : ''}
                </span>
              )}
            </div>
            <motion.button
              type="button"
              onClick={book}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: easeSoft }}
              className="relative shrink-0 overflow-hidden rounded-2xl bg-[var(--cat-accent)] px-7 py-3.5 text-[15px] font-black text-white shadow-[0_10px_24px_-10px_var(--cat-glow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cat-accent)] focus-visible:ring-offset-2"
            >
              <RippleLayer ripples={ripples} />
              <span className="relative z-10">Book now</span>
            </motion.button>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
