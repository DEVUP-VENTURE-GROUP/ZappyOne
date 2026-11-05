import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Search } from 'lucide-react';
import { useProviderInspectionFeeQuery, useSetProviderInspectionFeeMutation } from '../../services/api';

// The provider's own fee for going to look before quoting; 0 is a free inspection and all of it is theirs.
export default function InspectionFeeCard({ vertical }) {
  const { data } = useProviderInspectionFeeQuery(vertical);
  const [save, { isLoading }] = useSetProviderInspectionFeeMutation();
  const [fee, setFee] = useState('');
  useEffect(() => { if (data) setFee(String(Math.round((data.feePaise || 0) / 100))); }, [data]);
  // Required for every service: until one is saved (₹0 counts, a free inspection), Save stays on.
  const notSet = !!data && data.set === false;
  const changed = data && (notSet || Number(fee || 0) * 100 !== (data.feePaise || 0));

  async function submit() {
    try { await save({ vertical, feePaise: Math.round(Number(fee || 0) * 100) }).unwrap(); toast.success(Number(fee) > 0 ? 'Inspection fee saved' : 'Your inspections are free'); } catch (e) { toast.error(e?.data?.error || 'Could not save'); }
  }

  return (
    <div className={`card mb-4 flex flex-col gap-3 sm:flex-row sm:items-center ${notSet ? '!border-amber-400 !bg-amber-50' : ''}`}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-btn bg-zappy-50 text-zappy-700"><Search size={18} /></span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-ink-900">Your inspection fee{notSet && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">Required</span>}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-500 [text-wrap:pretty]">What you charge to come and check before you give a price. Write 0 for a free visit. All of it is yours.</p>
          {notSet && <p className="mt-1 text-[12.5px] font-semibold text-amber-800">Save it to get inspection jobs for this service.</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 sm:shrink-0">
        <label className="flex h-11 flex-1 items-center rounded-btn border border-line-strong bg-white px-3 focus-within:border-zappy-600 focus-within:ring-2 focus-within:ring-zappy-100 sm:w-32 sm:flex-none">
          <span className="text-[15px] font-semibold text-ink-400">₹</span>
          <input value={fee} onChange={(e) => setFee(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" aria-label="Inspection fee in rupees" className="min-w-0 flex-1 bg-transparent pl-1.5 text-[16px] font-bold tabular-nums outline-none" />
        </label>
        <button type="button" onClick={submit} disabled={!changed || isLoading} className="btn-primary h-11 shrink-0 px-5 text-[14px]">{isLoading && <Loader2 size={15} className="animate-spin" />} Save</button>
      </div>
    </div>
  );
}
