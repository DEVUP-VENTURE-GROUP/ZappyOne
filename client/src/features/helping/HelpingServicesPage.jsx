import { useSafeBack } from '../../hooks/useBookingFlow';
import { useNavigate } from 'react-router-dom';
import { servicePhoto } from '@shared/components/home/problemArt';
import { ArrowLeft, ShoppingBasket, PackageCheck, ChevronRight, Loader2, Wrench } from 'lucide-react';
import { useHelpingServicesQuery, useLiveCatalogQuery } from '@shared/services/api';
import { SERVICE_ICONS } from '@shared/components/home/LiveServices';
import { helpCardPrice } from '@shared/customer/helpModes';
import { formatPaise } from '@shared/utils/money';

// Before the catalog groups errands under Family Assist, the two built-in errand cards stand in.
const FALLBACK = [
  { code: 'shopping_pickup', name: 'Shopping & Pickup', tagline: 'Buy items from a shop, or collect a pickup, with a receipt and photos at every step', icon: ShoppingBasket, path: '/helping/shopping', type: 'shopping' },
  { code: 'returns_exchange', name: 'Returns & Exchange', tagline: "We handle the trip to the store or courier; the merchant decides, not us", icon: PackageCheck, path: '/helping/returns', type: 'return' },
];

// Family Assist: every live errand and home-help service in one list, from the catalog.
export default function HelpingServicesPage() {
  const nav = useNavigate();
  const goBack = useSafeBack('/');
  const { data: catalog, isLoading } = useLiveCatalogQuery();
  const { data: helping } = useHelpingServicesQuery();
  const domain = (catalog?.domains || []).find((d) => d.code === 'family_assist');
  const configured = new Set((helping?.services || []).map((s) => s.serviceType));
  const cards = domain?.services?.length
    ? domain.services.map((s) => ({ code: s.code, name: s.name, icon: SERVICE_ICONS[s.icon] || Wrench, path: s.path, ...helpCardPrice(s, helping) }))
    : FALLBACK.map((c) => ({ ...c, ...helpCardPrice(c, helping) })).filter((c) => (c.type === 'shopping' ? configured.has('shopping') || configured.has('pickup') : configured.has('return')));

  return (
    <div className="min-h-screen bg-canvas">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-white px-4 py-3">
        <button type="button" onClick={() => goBack()} className="p-1 -ml-1"><ArrowLeft size={20} /></button>
        <h1 className="text-[17px] font-bold text-ink-900">{domain?.name || 'Family Assist'}</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-3">
        <p className="text-[13px] text-ink-500">
          Errands, elder visits and help at home, by ZappyOne staff and verified helpers. You see the price before you book.
        </p>

        {isLoading && <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-zappy-400" /></div>}

        {!isLoading && cards.map((c) => {
          const Icon = c.icon;
          const photo = servicePhoto(c.code);
          return (
            <button
              key={c.code}
              type="button"
              onClick={() => nav(c.path)}
              className="flex w-full items-center gap-4 rounded-card border border-line bg-white p-3.5 text-left transition-colors hover:border-brand-600/40 active:bg-canvas"
            >
              {photo ? (
                <img src={photo} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-btn object-cover" />
              ) : (
                <span className="grid h-16 w-16 shrink-0 place-items-center rounded-btn bg-brand-50">
                  <Icon size={24} className="text-brand-600" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-ink-900">{c.name}</span>
                {c.note && <span className="mt-0.5 block text-[13px] text-ink-500">{c.note}</span>}
                {c.prices.length > 0 && (
                  <span className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 tabular-nums">
                    {c.prices.map((p) => (
                      <span key={p.label || 'fee'} className="flex items-baseline gap-1">
                        {p.label && <span className="text-[12px] text-ink-500">{p.label}</span>}
                        <span className="text-[17px] font-bold text-brand-600">{formatPaise(p.paise)}</span>
                      </span>
                    ))}
                    {c.plusBill && <span className="text-[12px] text-ink-500">+ shop bill</span>}
                  </span>
                )}
              </span>
              <ChevronRight size={18} className="shrink-0 text-ink-300" />
            </button>
          );
        })}

        {!isLoading && !cards.length && (
          <p className="text-center text-sm text-slate-400 py-12">Not available in your area yet.</p>
        )}
      </div>
    </div>
  );
}
