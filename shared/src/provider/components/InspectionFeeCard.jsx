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
  const changed = data && Number(fee || 0) * 100 !== (data.feePaise || 0);

  async function submit() {
    try { await save({ vertical, feePaise: Math.round(Number(fee || 0) * 100) }).unwrap(); toast.success(Number(fee) > 0 ? 'Inspection fee saved' : 'Your inspections are free'); } catch (e) { toast.error(e?.data?.error || 'Could not save'); }
  }

  return (
    <div className="card flex flex-wrap items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-btn bg-zappy-50 text-zappy-700"><Search size={18} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold text-ink-900">Your inspection fee</p>
        <p className="text-[12.5px] text-ink-500">For a visit to look before you quote. Leave 0 for a free inspection. You keep all of it.</p>
      </div>
      <span className="flex h-10 items-center rounded-btn border border-line-strong bg-white px-2.5 focus-within:border-zappy-600">
        <span className="text-[14px] font-semibold text-ink-400">₹</span>
        <input value={fee} onChange={(e) => setFee(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" aria-label="Inspection fee in rupees" className="w-16 bg-transparent pl-1 text-[15px] font-bold tabular-nums outline-none" />
      </span>
      <button type="button" onClick={submit} disabled={!changed || isLoading} className="btn-primary h-10 px-4 text-[13px]">{isLoading && <Loader2 size={14} className="animate-spin" />} Save</button>
    </div>
  );
}
