import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, PawPrint } from 'lucide-react';
import { usePetProviderRatesQuery, useSavePetProviderRatesMutation } from '../../services/api';

const SIZE = { small: 'Small', medium: 'Medium', large: 'Large', extra_large: 'Extra large' };
const toR = (p) => (p == null ? '' : String(Math.round(p / 100)));
const toP = (r) => (Number(r) >= 1 ? Math.round(Number(r) * 100) : null);

// A pet care provider's own prices for one pet service: a price per pet size for each type of job, plus their own add-on, pickup and return fees. ZappyOne sets none.
export default function PetRateCard({ category }) {
  const { data, isLoading } = usePetProviderRatesQuery();
  const [save, { isLoading: saving }] = useSavePetProviderRatesMutation();
  const [rates, setRates] = useState({});
  const [addons, setAddons] = useState({});
  const [fees, setFees] = useState({ pickup: '', ret: '' });
  useEffect(() => {
    if (!data) return;
    setRates(Object.fromEntries(data.services.map((s) => [s.code, Object.fromEntries(s.sizes.map((z) => [z, toR(s.prices[z])]))])));
    setAddons(Object.fromEntries(data.addons.map((a) => [a.code, toR(a.pricePaise)])));
    setFees({ pickup: toR(data.pickupPaise || null), ret: toR(data.returnPaise || null) });
  }, [data]);

  if (isLoading || !data) return <div className="grid place-items-center py-12"><Loader2 className="animate-spin text-ink-400" /></div>;
  const mine = data.services.filter((s) => !category || s.categoryCode === category);
  const priced = mine.filter((s) => Object.values(rates[s.code] || {}).some((v) => Number(v) >= 1)).length;

  function fill(code, sizes) {
    const first = rates[code]?.[sizes[0]];
    if (!(Number(first) >= 1)) return;
    setRates((r) => ({ ...r, [code]: Object.fromEntries(sizes.map((z) => [z, r[code]?.[z] || first])) }));
  }
  async function submit() {
    try {
      await save({
        rates: data.services.map((s) => ({ variantCode: s.code, prices: Object.fromEntries(s.sizes.map((z) => [z, toP(rates[s.code]?.[z])])) })),
        addonPrices: data.addons.map((a) => ({ code: a.code, pricePaise: toP(addons[a.code]) })),
        pickupPaise: toP(fees.pickup) || 0, returnPaise: toP(fees.ret) || 0,
      }).unwrap();
      toast.success('Your prices are live');
    } catch (e) { toast.error(e?.data?.error || 'Could not save'); }
  }

  const money = (value, onChange, label) => (
    <span className="flex h-10 items-center rounded-btn border border-line-strong bg-white px-2 focus-within:border-zappy-600">
      <span className="text-[13px] font-semibold text-ink-400">₹</span>
      <input value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" aria-label={label} className="w-full min-w-0 bg-transparent pl-1 text-[14px] font-bold tabular-nums outline-none" />
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-btn bg-zappy-50 text-zappy-700"><PawPrint size={18} /></span>
        <div>
          <h2 className="text-[18px] font-extrabold text-ink-900">Your prices</h2>
          <p className="text-[13px] text-ink-500">Set your own price for each pet size. Leave a size empty if you do not take it. Live as soon as you save.</p>
        </div>
      </div>
      {mine.map((s) => (
        <div key={s.code} className="card space-y-2">
          <p className="text-[14px] font-bold text-ink-900">{s.name} <span className="font-medium text-ink-500">· price for {s.per}</span></p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {s.sizes.map((z) => (
              <label key={z} className="block text-[12px] font-semibold text-ink-500" onBlur={() => z === s.sizes[0] && fill(s.code, s.sizes)}>
                {SIZE[z] || z}
                <span className="mt-1 block">{money(rates[s.code]?.[z] ?? '', (v) => setRates((r) => ({ ...r, [s.code]: { ...r[s.code], [z]: v } })), `${s.name}, ${SIZE[z]}`)}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      {data.addons.length > 0 && (
        <div className="card space-y-2">
          <p className="text-[14px] font-bold text-ink-900">Add-ons you offer <span className="font-medium text-ink-500">· leave empty to not offer one</span></p>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.addons.map((a) => (
              <label key={a.code} className="flex items-center justify-between gap-3 text-[13px] text-ink-700">
                <span className="min-w-0 flex-1">{a.name}</span>
                <span className="w-28 shrink-0">{money(addons[a.code] ?? '', (v) => setAddons((m) => ({ ...m, [a.code]: v })), a.name)}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="card grid grid-cols-2 gap-3">
        <label className="block text-[12px] font-semibold text-ink-500">Pickup fee (if you collect the pet)<span className="mt-1 block">{money(fees.pickup, (v) => setFees((f) => ({ ...f, pickup: v })), 'Pickup fee')}</span></label>
        <label className="block text-[12px] font-semibold text-ink-500">Drop-back fee<span className="mt-1 block">{money(fees.ret, (v) => setFees((f) => ({ ...f, ret: v })), 'Drop-back fee')}</span></label>
      </div>
      <button type="button" onClick={submit} disabled={saving} className="btn-primary h-12 w-full">{saving && <Loader2 size={16} className="animate-spin" />} Save my prices{priced ? ` (${priced} priced)` : ''}</button>
    </div>
  );
}
