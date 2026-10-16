import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Percent } from 'lucide-react';
import { useAdminPartnerRateQuery, useAdminSetPartnerRateMutation } from '@shared/services/api';

const TYPE_LABEL = { shop: 'shops', agency: 'agencies', company: 'service companies', individual: 'individual providers' };
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

// One partner's commission: their type's rate, or a rate agreed with them alone, optionally until a date.
export default function PartnerRateCard({ kind, id }) {
  const { data, isLoading } = useAdminPartnerRateQuery({ kind, id });
  const [save, { isLoading: saving }] = useAdminSetPartnerRateMutation();
  const rate = data?.rate;
  const [editing, setEditing] = useState(false);
  const [pct, setPct] = useState('');
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!rate) return;
    setPct(rate.override?.pct != null ? String(rate.override.pct) : '');
    setUntil(rate.override?.until ? rate.override.until.slice(0, 10) : '');
    setNote(rate.override?.note || '');
  }, [rate]);

  if (isLoading) return <div className="flex justify-center rounded-xl bg-slate-50 py-4"><Loader2 size={14} className="animate-spin text-slate-400" /></div>;
  if (!rate) return null;

  const n = Number(pct);
  const valid = pct !== '' && Number.isFinite(n) && n >= 0 && n <= 50 && (!until || until >= tomorrow());
  const send = (body, ok) => save({ kind, id, ...body }).unwrap().then(() => { toast.success(ok); setEditing(false); }).catch((e) => toast.error(e?.data?.error || 'Could not save'));

  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-bold text-slate-500">Commission</p>
          <p className="text-sm font-bold text-slate-900">{rate.pct}% of service money</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {rate.custom
              ? `Agreed rate${rate.override.until ? ` until ${fmtDate(rate.override.until)}` : ''}; ${TYPE_LABEL[rate.type]} pay ${rate.typePct}%.${rate.override.note ? ` ${rate.override.note}` : ''}`
              : `The rate for ${TYPE_LABEL[rate.type]}${rate.override?.until ? `; their agreed rate ended ${fmtDate(rate.override.until)}` : ''}.`}
          </p>
        </div>
        <button type="button" onClick={() => setEditing((v) => !v)} className="flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-zappy-700 ring-1 ring-zappy-200">
          <Percent size={12} /> {rate.custom ? 'Change' : 'Set own rate'}
        </button>
      </div>
      {editing && (
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-slate-600">Rate</span>
              <span className="flex items-center rounded-lg border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-blue-500">
                <input type="number" min={0} max={50} step={0.5} value={pct} onChange={(e) => setPct(e.target.value)} aria-label="Agreed commission percent" className="w-full bg-transparent px-3 py-2 text-sm tabular-nums outline-none" />
                <span className="pr-3 text-sm text-slate-400">%</span>
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-slate-600">Until (optional)</span>
              <input type="date" min={tomorrow()} value={until} onChange={(e) => setUntil(e.target.value)} aria-label="Agreed rate ends" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
            </label>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Why (for the record): e.g. 70-person agency, signed 16 Oct" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          <p className="text-[11px] text-slate-500">Applies to jobs they take from now on. Jobs already taken keep their rate.</p>
          <div className="flex gap-2">
            <button type="button" disabled={!valid || saving} onClick={() => send({ pct: n, until: until || null, note: note.trim() }, 'Agreed rate saved')}
              className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400">
              {saving ? <Loader2 size={14} className="mx-auto animate-spin" /> : 'Save'}
            </button>
            {rate.override?.pct != null && (
              <button type="button" disabled={saving} onClick={() => send({ pct: null }, `Back to the rate for ${TYPE_LABEL[rate.type]}`)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-white">Use type rate</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
