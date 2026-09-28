import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Tag, Copy, CheckCheck, Clock, AlertCircle } from 'lucide-react';
import { useGetAvailablePromosQuery } from '@shared/services/api';
import { serviceLabel } from '@shared/constants/services';

function PromoCard({ promo }) {
  const [copied, setCopied] = useState(false);
  const expiresAt = new Date(promo.expiresAt);
  const hoursLeft = Math.round((expiresAt - Date.now()) / 3600000);
  const urgent = hoursLeft < 24;

  function copy() {
    navigator.clipboard.writeText(promo.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function discount() {
    if (promo.type === 'percent') {
      const max = promo.maxDiscountPaise > 0 ? ` (up to ₹${Math.round(promo.maxDiscountPaise / 100)})` : '';
      return `${promo.discountValue}% off${max}`;
    }
    if (promo.type === 'first_order') return `₹${Math.round(promo.discountValue / 100)} off first order`;
    return `₹${Math.round(promo.discountValue / 100)} off`;
  }

  return (
    <div className={`bg-white rounded-xl shadow-sm border ${promo.alreadyUsed ? 'opacity-50' : ''}`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-indigo-600 text-base tracking-wider">{promo.code}</span>
              {promo.alreadyUsed && (
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Used</span>
              )}
            </div>
            <p className="text-sm font-semibold text-slate-800 mt-0.5">{promo.name}</p>
            {promo.description && (
              <p className="text-xs text-slate-500 mt-0.5">{promo.description}</p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-bold text-emerald-600">{discount()}</p>
            {promo.minOrderPaise > 0 && (
              <p className="text-xs text-slate-400">Min ₹{Math.round(promo.minOrderPaise / 100)}</p>
            )}
          </div>
        </div>

        {promo.services?.length > 0 && (
          <div className="mt-2 flex gap-1 flex-wrap">
            {promo.services.map(s => (
              <span key={s} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{serviceLabel(s)}</span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-3">
          <div className={`flex items-center gap-1 text-xs ${urgent ? 'text-rose-500' : 'text-slate-400'}`}>
            {urgent ? <AlertCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
            {hoursLeft < 1
              ? 'Expires soon'
              : hoursLeft < 24
              ? `Expires in ${hoursLeft}h`
              : `Expires ${expiresAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
          </div>
          {!promo.alreadyUsed && (
            <button
              onClick={copy}
              className="flex items-center gap-1.5 text-xs font-medium bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg active:bg-indigo-100"
            >
              {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy code'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PromosHubPage() {
  const nav = useNavigate();
  const { data, isLoading } = useGetAvailablePromosQuery();
  const promos = data?.promos ?? [];
  const available = promos.filter(p => !p.alreadyUsed);
  const used = promos.filter(p => p.alreadyUsed);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => nav(-1)} className="p-1.5 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-semibold text-slate-800">Promo Codes</h1>
        {available.length > 0 && (
          <span className="ml-auto text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full font-medium">
            {available.length} available
          </span>
        )}
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center h-60">
          <div className="w-7 h-7 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
        </div>
      ) : promos.length === 0 ? (
        <div className="text-center py-16 text-slate-400 px-6">
          <Tag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No active promos right now</p>
          <p className="text-xs mt-1">Check back soon for offers and discounts</p>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {available.map(p => <PromoCard key={p.code} promo={p} />)}
          {used.length > 0 && (
            <>
              <p className="text-xs text-slate-400 font-medium pt-2">Already used</p>
              {used.map(p => <PromoCard key={p.code} promo={p} />)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
