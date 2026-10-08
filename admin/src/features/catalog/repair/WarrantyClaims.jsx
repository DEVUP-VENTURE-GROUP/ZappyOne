import { useState } from 'react';
import toast from 'react-hot-toast';
import { useAdminWarrantyClaimsQuery, useAdminDecideWarrantyClaimMutation } from '@shared/services/api';
import { Card } from '../../../ui/kit';

/** Open repair warranty claims, decided here; the customer is told each step. */
const OPEN = ['submitted', 'under_review', 'approved'];
const ACTIONS = [
  { status: 'under_review', label: 'Reviewing', tone: 'bg-slate-100 text-slate-700' },
  { status: 'approved', label: 'Approve', tone: 'bg-emerald-600 text-white' },
  { status: 'rejected', label: 'Not covered', tone: 'bg-red-50 text-red-700' },
  { status: 'resolved', label: 'Resolved', tone: 'bg-blue-50 text-blue-700' },
];

export default function WarrantyClaims() {
  const { data, refetch } = useAdminWarrantyClaimsQuery();
  const [decide, { isLoading }] = useAdminDecideWarrantyClaimMutation();
  const [notes, setNotes] = useState({});
  const rows = (data?.items || []).filter((c) => OPEN.includes(c.status));
  if (!rows.length) return null;

  async function act(c, status) {
    if (status === 'rejected' && !(notes[c._id] || '').trim()) return toast.error('Say why it is not covered');
    try { await decide({ id: c._id, status, note: notes[c._id] || '' }).unwrap(); toast.success('Customer told'); refetch(); } catch (err) { toast.error(err?.data?.error || 'Failed'); }
    return undefined;
  }

  return (
    <Card className="p-4">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Warranty claims to decide</p>
      <div className="space-y-3">
        {rows.map((c) => (
          <div key={c._id} className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500">{new Date(c.createdAt).toLocaleString('en-IN')} · {c.repairCode} · {c.status.replace(/_/g, ' ')} · booking {String(c.bookingId).slice(-6)}</p>
            <p className="mt-1 text-sm text-slate-800">{c.issueDescription}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input value={notes[c._id] || ''} onChange={(e) => setNotes((n) => ({ ...n, [c._id]: e.target.value }))}
                placeholder="Note to the customer" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
              {ACTIONS.map((a) => (
                <button key={a.status} type="button" disabled={isLoading || c.status === a.status} onClick={() => act(c, a.status)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-40 ${a.tone}`}>{a.label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
