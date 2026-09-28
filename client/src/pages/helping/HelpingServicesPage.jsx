import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShoppingBasket, PackageCheck, ChevronRight } from 'lucide-react';
import { useHelpingServicesQuery } from '@shared/services/api';

/**
 * Helping Services entry — §53's two cards.
 *
 * "What do you need help with?" first, then only the relevant questions
 * (§54) — this screen asks nothing else. Services come from HelpingConfig,
 * so a service with no configuration simply does not render a card.
 */
const CARDS = [
  {
    key: 'shopping',
    title: 'Shopping & Pickup',
    subtitle: 'Buy items from a shop, or collect a pickup — with a receipt and photos at every step',
    icon: ShoppingBasket,
    path: '/helping/shopping',
  },
  {
    key: 'return',
    title: 'Returns & Exchange',
    subtitle: "We handle the trip to the store or courier — the merchant's own decision, not ours",
    icon: PackageCheck,
    path: '/helping/returns',
  },
];

export default function HelpingServicesPage() {
  const nav = useNavigate();
  const { data } = useHelpingServicesQuery();
  const configured = new Set((data?.services || []).map((s) => s.serviceType));

  // A card whose service type has no live config simply is not offered —
  // never a dead link to a screen that will fail to price itself.
  const available = CARDS.filter((c) => (
    c.key === 'shopping' ? configured.has('shopping') || configured.has('pickup') : configured.has('return')
  ));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => nav(-1)} className="p-1 -ml-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-black text-[#0F172A]">Helping Services</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-3">
        <p className="text-sm text-slate-500">
          A trusted person to physically do a small real-world task you can't or don't want to do yourself.
        </p>

        {available.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => nav(c.path)}
              className="w-full flex items-center gap-4 rounded-2xl border-2 border-slate-200 bg-white p-5 text-left hover:border-indigo-300 transition"
            >
              <span className="shrink-0 w-12 h-12 rounded-2xl bg-indigo-50 grid place-items-center">
                <Icon size={22} className="text-indigo-600" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-black text-[#0F172A]">{c.title}</span>
                <span className="block text-xs text-slate-500 mt-0.5">{c.subtitle}</span>
              </span>
              <ChevronRight size={18} className="text-slate-300 shrink-0" />
            </button>
          );
        })}

        {!available.length && (
          <p className="text-center text-sm text-slate-400 py-12">
            Not available in your area yet.
          </p>
        )}
      </div>
    </div>
  );
}
