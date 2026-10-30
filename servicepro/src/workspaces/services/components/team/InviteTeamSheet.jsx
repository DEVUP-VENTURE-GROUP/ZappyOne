import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, X } from 'lucide-react';
import { useInviteShopTeamMutation } from '@shared/services/api';
import { parseTeamList } from '@shared/provider/partnerBoard';

// Adds many people at once; each still verifies their own ID before taking jobs.
export default function InviteTeamSheet({ onClose }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [invite, { isLoading }] = useInviteShopTeamMutation();
  const rows = parseTeamList(text);

  async function send() {
    try {
      const r = await invite(rows).unwrap();
      setResult(r);
      toast.success(`${r.added} added${r.failed ? `, ${r.failed} need a look` : ''}`);
    } catch (e) { toast.error(e?.data?.error || 'Could not add them'); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose} role="presentation">
      <div className="safe-pb w-full space-y-4 rounded-t-sheet bg-white p-6 sm:max-w-lg sm:rounded-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add your team">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Add your team</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        {!result ? (
          <>
            <p className="-mt-2 text-xs text-slate-500">One person a line: name and mobile number. Paste from your phone or a sheet.</p>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={'Ravi Kumar, 98480 12345\nSuresh 9701234567'}
              className="input w-full font-mono text-[13px]" />
            <p className="text-[12px] text-slate-500">{rows.length} {rows.length === 1 ? 'person' : 'people'} found</p>
            <button type="button" onClick={send} disabled={!rows.length || isLoading} className="btn-primary w-full">
              {isLoading ? <><Loader2 size={15} className="animate-spin" /> Adding…</> : `Add ${rows.length}`}
            </button>
          </>
        ) : (
          <>
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
              {result.rows.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                  <span className="min-w-0 truncate text-slate-700">{r.name || '-'} <span className="text-slate-400">{r.phone}</span></span>
                  <span className={`shrink-0 font-semibold ${r.ok ? 'text-emerald-600' : 'text-red-600'}`}>{r.ok ? (r.isNew ? 'Added' : 'Linked') : r.error}</span>
                </li>
              ))}
            </ul>
            <p className="rounded-xl bg-slate-50 p-3 text-[11.5px] text-slate-500">Each person signs in at Shop worker login with their number and verifies their ID before taking jobs.</p>
            <button type="button" onClick={onClose} className="btn-primary w-full">Done</button>
          </>
        )}
      </div>
    </div>
  );
}
