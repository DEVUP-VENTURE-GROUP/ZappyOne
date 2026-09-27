import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useT } from '../../i18n/I18nProvider';

const OFFERS = [
  {
    id: 1,
    title: 'FLAT 20% OFF',
    desc: 'On your first AC Service or Repair',
    code: 'ZAPPY20',
    color: '#6366f1', // Indigo 500
    tag: 'AC SERVICE'
  },
  {
    id: 2,
    title: 'FREE CHECKUP',
    desc: 'With any premium car wash',
    code: 'AUTO100',
    color: '#0f172a', // Slate 900
    tag: 'VEHICLE'
  },
  {
    id: 3,
    title: '₹100 CASHBACK',
    desc: 'Pay via Zappy Wallet',
    code: 'WALLET100',
    color: '#ec4899', // Pink 500
    tag: 'WALLET'
  },
];

export default function OffersSection() {
  const nav = useNavigate();
  const isMobile = useIsMobile();
  const t = useT();

  return (
    <div className="mt-8 mb-6 w-full">
      <div className="mb-4 flex items-end justify-between px-4 md:px-6">
        <div>
          <h3 className="text-[20px] md:text-[28px] font-bold text-slate-900 tracking-tight leading-none">{t('home.specialOffers', 'Special Offers')}</h3>
        </div>
        <button
          onClick={() => nav('/offers')}
          className="group flex items-center gap-1 text-[14px] font-semibold text-zappy-600 hover:text-zappy-700 transition-colors"
        >
          {t('home.seeAll', 'See all')} <ArrowRight size={15} strokeWidth={2.5} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      {isMobile ? (
        /* ── Mobile: light coupon cards ── */
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-4 snap-x snap-mandatory px-4">
          {OFFERS.map((offer) => (
            <motion.div
              key={offer.id}
              className="shrink-0 w-[270px] flex rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden snap-center cursor-pointer"
              whileTap={{ scale: 0.98 }}
              onClick={() => nav('/offers')}
            >
              <div className="flex-1 p-4 min-w-0">
                <span className="inline-block text-[9px] font-black tracking-widest text-zappy-600 uppercase">{offer.tag}</span>
                <h4 className="text-[17px] font-black text-slate-900 leading-tight tracking-tight mt-1">{offer.title}</h4>
                <p className="text-[11px] text-slate-500 font-medium leading-snug mt-1 pr-1">{offer.desc}</p>
              </div>
              <div className="w-[88px] shrink-0 relative flex flex-col items-center justify-center px-2 bg-zappy-50/60 border-l-2 border-dashed border-slate-200">
                <span className="text-[8px] font-bold tracking-widest text-slate-400 uppercase mb-1.5 text-center">Use code</span>
                <span className="text-[11px] font-black tracking-wide text-zappy-700 bg-white border border-zappy-100 rounded-lg px-2 py-1.5 shadow-sm text-center leading-none">{offer.code}</span>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
      <div className="flex gap-4 overflow-x-auto no-scrollbar pb-6 -mx-4 md:-mx-6 snap-x snap-mandatory px-4 md:px-6">
        {OFFERS.map((offer) => (
          <motion.div
            key={offer.id}
            className="shrink-0 w-[300px] md:w-[340px] h-[130px] rounded-2xl relative shadow-sm snap-center group cursor-pointer overflow-hidden"
            style={{ backgroundColor: offer.color }}
            whileHover={{ y: -4, boxShadow: '0 12px 24px -8px rgba(0,0,0,0.15)' }}
            whileTap={{ scale: 0.97 }}
            onClick={() => nav('/offers')}
          >
            {/* Subtle background pattern */}
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:12px_12px] pointer-events-none" />

            {/* Top and Bottom cutouts for the ticket effect */}
            <div className="absolute top-0 right-[100px] w-6 h-6 -mt-3 -mr-3 rounded-full bg-white z-20 pointer-events-none" />
            <div className="absolute bottom-0 right-[100px] w-6 h-6 -mb-3 -mr-3 rounded-full bg-white z-20 pointer-events-none" />

            <div className="flex h-full w-full relative z-10">
              {/* Left Details */}
              <div className="flex-1 p-5 flex flex-col justify-center">
                <span className="inline-block px-2 py-0.5 border border-white/20 rounded mb-2 text-[9px] font-black tracking-widest text-white/80 uppercase w-max">
                  {offer.tag}
                </span>
                <h4 className="text-xl md:text-[22px] font-black text-white leading-none tracking-tight mb-1.5">{offer.title}</h4>
                <p className="text-xs text-white/70 font-medium leading-snug pr-2">{offer.desc}</p>
              </div>

              {/* Dashed Divider */}
              <div className="w-[1px] h-full py-3 flex flex-col justify-center">
                <div className="w-full h-full border-l-[1.5px] border-dashed border-white/30" />
              </div>

              {/* Right Code */}
              <div className="w-[100px] p-3 flex flex-col items-center justify-center relative">
                <span className="text-[9px] font-bold tracking-widest text-white/60 uppercase mb-2 text-center w-full block">Use Code</span>
                <div className="bg-white text-black px-2 py-1.5 rounded-lg border border-black/5 shadow-sm transform -rotate-3 group-hover:rotate-0 transition-transform w-full text-center">
                  <span className="text-[11px] font-black tracking-widest leading-none">{offer.code}</span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      )}
    </div>
  );
}
