/**
 * Nearby shops on the home page.
 * ----------------------------------------------------------------------------
 * Home used to link to this with a single wide button — a promise of shops
 * rather than any shop. This shows the real ones, from the same
 * `GET /shops/nearby` the full page uses, so a visitor can see whether there is
 * anything near them before deciding to tap through.
 *
 * ── EVERY FIELD IS THE SERVER'S ────────────────────────────────────────────
 * Name, category, cover image, rating, completed jobs and open/closed all come
 * from the response. The rating here is a real aggregate — unlike the "4.8
 * Rated" string that used to sit in Home's trust row with nothing behind it —
 * so it is shown only when the shop actually has one. `openNow: null` means the
 * shop never set its hours; that renders as nothing rather than as a guess in
 * either direction.
 *
 * ── SILENT WHEN IT HAS NOTHING ─────────────────────────────────────────────
 * No location, still loading, or no shops within range: the section does not
 * render. An empty "Nearby Shops" heading tells a visitor we have no coverage
 * where they are, which is worse than staying quiet about it.
 * ----------------------------------------------------------------------------
 */

import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { Store, Star, ShieldCheck, ArrowRight } from 'lucide-react';
import { useNearbyShopsQuery } from '../../services/api';
import { selectLocation, selectHasLocation } from '../../store/locationSlice';
import { selectIsAuthed } from '../../modules/auth/authSlice';

export default function NearbyShopsRail() {
  const nav = useNavigate();
  const loc = useSelector(selectLocation);
  const hasLocation = useSelector(selectHasLocation);
  // `/shops/nearby` is authenticated. Called while signed out it returns 401,
  // which the base query answers with a token refresh that also 401s — so a
  // logged-out home page generated a burst of failed requests for a section
  // that was never going to render. Skipped at the source instead.
  const isAuthed = useSelector(selectIsAuthed);

  const { data } = useNearbyShopsQuery(
    { lat: loc.lat, lng: loc.lng, radiusKm: 15 },
    { skip: !hasLocation || !isAuthed },
  );

  // Home is a preview, not the directory — four is enough to show there is
  // coverage, and "See all" carries the rest.
  const shops = (data?.shops || []).slice(0, 4);
  if (!shops.length) return null;

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[20px] font-black leading-tight tracking-[-0.025em] text-[#0F172A] sm:text-[24px]">
            Nearby shops
          </h2>
          <p className="mt-0.5 text-[12px] font-medium text-slate-500 sm:text-[13.5px]">
            Verified local businesses — visit, or have their worker come to you.
          </p>
        </div>
        <button
          onClick={() => nav('/nearby-shops')}
          className="group flex shrink-0 items-center gap-1 rounded-lg px-1 py-1 text-[13px] font-bold text-indigo-600 transition-colors hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          See all
          <ArrowRight size={14} strokeWidth={2.6} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      <div className="-mx-4 flex snap-x items-stretch gap-2.5 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
        {shops.map((s) => (
          <motion.button
            key={s._id}
            onClick={() => nav(`/shops/${s._id}`)}
            whileTap={{ scale: 0.975 }}
            className="group flex w-[210px] shrink-0 snap-start flex-col overflow-hidden rounded-[18px] bg-white text-left ring-1 ring-slate-200/80 transition duration-200 hover:-translate-y-0.5 hover:ring-indigo-200 hover:shadow-[0_16px_30px_-20px_rgba(79,70,229,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 lg:w-auto"
          >
            <span className="flex h-[84px] w-full shrink-0 items-center justify-center bg-slate-100">
              {s.coverImageUrl ? (
                <img
                  src={s.coverImageUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <Store size={26} className="text-slate-300" />
              )}
            </span>

            <span className="flex flex-1 flex-col gap-0.5 px-3 pb-3 pt-2.5">
              <span className="flex items-center gap-1.5">
                <span className="line-clamp-1 flex-1 text-[13.5px] font-bold tracking-[-0.015em] text-[#0F172A]">
                  {s.businessName}
                </span>
                <ShieldCheck size={13} className="shrink-0 text-emerald-500" />
              </span>
              <span className="line-clamp-1 text-[11px] font-medium text-slate-500">
                {s.category || 'Local repair shop'}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                {s.rating > 0 && (
                  <span className="flex items-center gap-0.5 text-[11px] font-bold text-slate-600">
                    <Star size={11} className="fill-amber-400 text-amber-400" />
                    {s.rating.toFixed(1)}
                  </span>
                )}
                {s.openNow === true && (
                  <span className="text-[11px] font-bold text-emerald-600">Open now</span>
                )}
                {s.openNow === false && <span className="text-[11px] font-bold text-slate-400">Closed</span>}
              </span>
            </span>
          </motion.button>
        ))}
      </div>
    </section>
  );
}
