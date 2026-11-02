import { useId } from 'react';
import { useT } from '@shared/i18n/I18nProvider';
import { labelKey } from '@shared/i18n/translations';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Clock3 } from 'lucide-react';
import MyAreaChip from '@shared/components/worker/MyAreaChip';
import { Avatar } from '@shared/components/worker/PortalShell';
import { opensLabel, to12Hour } from '@shared/components/provider/weeklyHoursRules';

const time = (hhmm) => { const t = to12Hour(hhmm); return t.hour ? `${t.hour}:${t.minute} ${t.meridiem}` : ''; };

// A striped shop awning with a scalloped edge: the top of every storefront in an Indian market street.
function Awning({ live }) {
  const id = useId().replace(/:/g, '');
  const a = live ? '#1F4FD8' : '#94A3B8';
  const b = live ? '#DCE6FB' : '#E2E8F0';
  return (
    <motion.svg key={live ? 'up' : 'down'} aria-hidden="true" className="block h-[18px] w-full origin-top" preserveAspectRatio="none"
      initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
      <defs>
        <pattern id={`aw${id}`} width="32" height="18" patternUnits="userSpaceOnUse">
          <path d="M0 0h16v10a8 8 0 0 1-16 0z" fill={a} />
          <path d="M16 0h16v10a8 8 0 0 1-16 0z" fill={b} />
        </pattern>
      </defs>
      <rect width="100%" height="18" fill={`url(#aw${id})`} />
    </motion.svg>
  );
}

// Ripples go out from the dot while customers can book the shop; still otherwise.
function Signal({ live }) {
  const still = useReducedMotion();
  return (
    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden="true">
      {live && !still && [0, 0.8, 1.6].map((d) => (
        <motion.span key={d} className="absolute inset-0 rounded-full border-2 border-emerald-400"
          initial={{ scale: 0.35, opacity: 0.8 }} animate={{ scale: 1, opacity: 0 }}
          transition={{ duration: 2.4, delay: d, repeat: Infinity, ease: 'easeOut' }} />
      ))}
      <span className={`relative h-3 w-3 rounded-full ring-4 ${live ? 'bg-emerald-500 ring-emerald-100' : 'bg-slate-300 ring-slate-100'}`} />
    </span>
  );
}

// The top of a partner's home: whose shop, what trade, where, today's hours, and whether customers can book right now.
export default function ShopHeader({ shop, trade, live, isOpen, blocker }) {
  const nav = useNavigate();
  const t = useT();
  const hasPin = shop?.address?.location?.coordinates?.length === 2;
  const today = shop?.todayHours;
  const hours = isOpen === false ? opensLabel(shop?.opensNext) || 'Closed today' : today ? `Open till ${time(today.closesAt)}` : null;
  const status = live
    ? { title: t('sp.live', 'Live'), sub: t('sp.customers_can_book_you', 'Customers can book you') }
    : isOpen === false ? { title: t('sp.closed', 'Closed'), sub: hours || 'Outside your hours' } : { title: t('sp.not_live', 'Not live'), sub: blocker || 'Finish setup to go live' };
  return (
    <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <Awning live={live} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 pb-4 pt-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={shop?.businessName} photo={shop?.coverImageUrl} className="h-14 w-14 shrink-0 rounded-2xl text-[20px] ring-2 ring-white shadow-sm" />
          <div className="min-w-0">
            <p className="truncate text-[10.5px] font-black uppercase tracking-[0.14em] text-slate-400">{trade || 'Shop partner'}</p>
            <h1 className="truncate text-[20px] font-black leading-tight tracking-tight text-[#0F172A]">{shop?.businessName}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {hasPin && <MyAreaChip coordinates={shop.address.location.coordinates} live={live} />}
              {hours && (
                <button type="button" onClick={() => nav('/shop/profile')} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-600 hover:border-slate-300">
                  <Clock3 size={12} className="text-slate-400" /> {hours}
                </button>
              )}
            </div>
          </div>
        </div>
        <div role="status" className={`flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 sm:w-auto ${live ? 'bg-emerald-50' : 'bg-slate-50'}`}>
          <Signal live={live} />
          <span className="min-w-0">
            <span className={`block text-[14px] font-black ${live ? 'text-emerald-800' : 'text-slate-700'}`}>{status.title}</span>
            <span className="block truncate text-[11.5px] text-slate-500">{status.sub}</span>
          </span>
        </div>
      </div>
    </header>
  );
}
