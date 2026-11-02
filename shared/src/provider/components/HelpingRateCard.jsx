import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Footprints, Loader2 } from 'lucide-react';
import { useHelpingProviderRatesQuery, useSaveHelpingProviderRateMutation } from '../../services/api';

const FIELDS = [
  ['baseFeePaise', 'Errand fee', true],
  ['perKmPaise', 'Per km', true],
  ['includedKm', 'Free km', false],
  ['waitingPerMinutePaise', 'Waiting, per minute', true],
  ['extraStopPaise', 'Extra stop', true],
  ['specialHandlingPaise', 'Heavy or fragile', true],
];

// A helper's own rates for each errand in one service; ZappyOne adds only its platform fee. `fallback` shows when the service has no errands to price.
export default function HelpingRateCard({ lineCode, fallback = null }) {
  const { data, isLoading } = useHelpingProviderRatesQuery(lineCode);
  if (isLoading) return <div className="space-y-2" aria-hidden="true">{[0, 1, 2].map((k) => <div key={k} className="h-20 animate-pulse rounded-card bg-sunken" />)}</div>;
  if (!data?.types?.length) return fallback;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-btn bg-zappy-50 text-zappy-700"><Footprints size={18} /></span>
        <div>
          <h2 className="text-[18px] font-extrabold text-ink-900">Your rates</h2>
          <p className="text-[13px] text-ink-500">Customers near you are offered the best rate; jobs ring you when your rate fits. Leave the fee empty to not take that errand.</p>
        </div>
      </div>
      {data.types.map((t) => <ErrandRate key={t.serviceType} lineCode={lineCode} errand={t} />)}
    </div>
  );
}

function ErrandRate({ lineCode, errand }) {
  const [save, { isLoading }] = useSaveHelpingProviderRateMutation();
  const [v, setV] = useState({});
  useEffect(() => {
    setV(Object.fromEntries(FIELDS.map(([k, , money]) => [k, errand.rate?.[k] ? String(money ? Math.round(errand.rate[k] / 100) : errand.rate[k]) : ''])));
  }, [errand]);
  async function submit() {
    try {
      await save({ lineCode, serviceType: errand.serviceType, ...Object.fromEntries(FIELDS.map(([k, , money]) => [k, money ? Math.round(Number(v[k] || 0) * 100) : Number(v[k] || 0)])) }).unwrap();
      toast.success(Number(v.baseFeePaise) > 0 ? `${errand.name}: rates live` : `${errand.name}: not offered`);
    } catch (e) { toast.error(e?.data?.error || 'Could not save'); }
  }
  return (
    <div className="card space-y-3">
      <p className="text-[14px] font-bold text-ink-900">{errand.name}{!errand.rate && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">Not priced yet</span>}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {FIELDS.map(([k, label, money]) => (
          <label key={k} className="flex flex-col justify-end text-[12px] font-semibold text-ink-500">{label}
            <span className="mt-1 flex h-10 items-center rounded-btn border border-line-strong bg-white px-2 focus-within:border-zappy-600">
              {money && <span className="text-[13px] font-semibold text-ink-400">₹</span>}
              <input value={v[k] ?? ''} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value.replace(/\D/g, '').slice(0, 6) }))} inputMode="numeric" aria-label={`${errand.name}, ${label}`} className="w-full min-w-0 bg-transparent pl-1 text-[14px] font-bold tabular-nums outline-none" />
              {!money && <span className="text-[12px] text-ink-400">km</span>}
            </span>
          </label>
        ))}
      </div>
      <button type="button" onClick={submit} disabled={isLoading} className="btn-primary h-10 w-full text-[13.5px]">{isLoading && <Loader2 size={15} className="animate-spin" />} Save {errand.name.toLowerCase()} rates</button>
    </div>
  );
}
