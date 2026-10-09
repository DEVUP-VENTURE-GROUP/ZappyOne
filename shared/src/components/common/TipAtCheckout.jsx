import { Heart } from 'lucide-react';
import { useGetPricingConfigQuery } from '../../services/api';

/**
 * An optional tip, chosen before paying — so the total shown and the amount
 * paid (online now, or cash at the end) already include it (server
 * jobs/boost-tip tipAtBooking). All of it goes to the provider. Amounts are
 * the ones set in Admin → Economics → Boost & tips.
 *
 * value / onChange: rupees (0 = no tip).
 */
export default function TipAtCheckout({ value = 0, onChange, className = '' }) {
  const { data } = useGetPricingConfigQuery();
  const options = (data?.pricing?.tipOptions || [20, 50, 100]).filter((r) => r > 0 && r * 100 <= (data?.pricing?.tipMaxPaise ?? 50000));
  if (!options.length) return null;
  return (
    <div className={`rounded-2xl border-2 border-rose-100 bg-rose-50/40 p-4 ${className}`}>
      <p className="flex items-center gap-2 text-sm font-bold text-[#0F172A]">
        <Heart size={15} className={value ? 'fill-rose-500 text-rose-500' : 'text-rose-500'} /> Add a tip for your pro?
      </p>
      <p className="mt-0.5 text-[12px] text-slate-500">Optional. Added to your total; every rupee goes to them.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => onChange(0)}
          className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${!value ? 'border-slate-400 bg-white text-slate-700' : 'border-slate-200 text-slate-500'}`}>
          No tip
        </button>
        {options.map((r) => (
          <button key={r} type="button" onClick={() => onChange(r)}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold tabular-nums ${value === r ? 'border-rose-500 bg-rose-500 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>
            ₹{r}
          </button>
        ))}
      </div>
    </div>
  );
}
