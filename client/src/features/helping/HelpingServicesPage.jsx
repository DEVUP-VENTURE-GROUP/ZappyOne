import { useSafeBack } from '../../hooks/useBookingFlow';
import { useNavigate } from 'react-router-dom';
import { servicePhoto } from '@shared/components/home/problemArt';
import { ArrowLeft, ShoppingBasket, PackageCheck, ChevronRight, Loader2, Wrench } from 'lucide-react';
import { useHelpingServicesQuery, useLiveCatalogQuery } from '@shared/services/api';
import { SERVICE_ICONS } from '@shared/components/home/LiveServices';

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
    ? domain.services.map((s) => ({ code: s.code, name: s.name, tagline: s.tagline || s.description, icon: SERVICE_ICONS[s.icon] || Wrench, path: s.path }))
    : FALLBACK.filter((c) => (c.type === 'shopping' ? configured.has('shopping') || configured.has('pickup') : configured.has('return')));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => goBack()} className="p-1 -ml-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-black text-[#0F172A]">{domain?.name || 'Family Assist'}</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-3">
        <p className="text-sm text-slate-500">
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
              className="w-full flex items-center gap-4 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left hover:border-zappy-300 transition"
            >
              {photo ? (
                <img src={photo} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
              ) : (
                <span className="shrink-0 w-12 h-12 rounded-2xl bg-zappy-50 grid place-items-center">
                  <Icon size={22} className="text-zappy-600" />
                </span>
              )}
              <span className="flex-1 min-w-0">
                <span className="block font-black text-[#0F172A]">{c.name}</span>
                {c.tagline && <span className="block text-xs text-slate-500 mt-0.5">{c.tagline}</span>}
              </span>
              <ChevronRight size={18} className="text-slate-300 shrink-0" />
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
