import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, UserCog, Star, MapPin, Phone, StickyNote, Send } from 'lucide-react';
import {
  useAdminJobCandidatesQuery, useAdminAssignJobMutation, useAdminJobNotesQuery, useAdminAddJobNoteMutation,
} from '@shared/services/api';
import { fmtDate } from '../../ui/kit';

/**
 * Ops stepping into a live job: pick who should take it (verified for this
 * service, nearest and online first), give a reason, and they are rung like
 * any offer. Only before the provider is at the customer; the price stays as
 * booked. Server rules: jobs/intervention.service.js.
 */
export function InterventionPanel({ source, id, onDone }) {
  const { data, isLoading, refetch } = useAdminJobCandidatesQuery({ source, id });
  const [assign, { isLoading: assigning }] = useAdminAssignJobMutation();
  const [picked, setPicked] = useState(null);
  const [reason, setReason] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(true);

  if (isLoading) return <div className="flex justify-center py-6"><Loader2 className="animate-spin text-slate-300" /></div>;
  if (!data?.assignable) return null;
  const rows = (data.providers || []).filter((p) => !onlineOnly || p.online || p.current);
  const current = data.providers?.find((p) => p.current);

  async function confirm() {
    try {
      const r = await assign({ source, id, providerKind: picked.kind, providerId: picked.id, reason: reason.trim() }).unwrap();
      toast.success(`Offered to ${r.provider.name}. They are being rung now.`);
      setPicked(null); setReason(''); refetch(); onDone?.();
    } catch (err) { toast.error(err?.data?.error || 'Could not assign'); }
  }

  return (
    <section className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500"><UserCog size={13} /> {current ? 'Move to another provider' : 'Assign a provider'}</p>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <input type="checkbox" checked={onlineOnly} onChange={(e) => setOnlineOnly(e.target.checked)} /> Online only
        </label>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">Verified for {String(data.line || '').replace(/_/g, ' ')}. Nearest first. The price stays as booked.</p>

      {!rows.length ? (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">No verified provider {onlineOnly ? 'is online' : 'exists'} for this service yet.</p>
      ) : (
        <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
          {rows.map((p) => (
            <li key={`${p.kind}:${p.id}`}>
              <button type="button" disabled={p.current} onClick={() => setPicked(p)}
                className={`w-full rounded-lg border p-2.5 text-left text-xs transition ${picked?.id === p.id ? 'border-zappy-600 bg-zappy-50' : 'border-slate-200 hover:border-slate-300'} disabled:cursor-default disabled:opacity-60`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">{p.name}{p.kind === 'shop' && <span className="ml-1 text-slate-400">(shop)</span>}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${p.current ? 'bg-slate-100 text-slate-600' : p.online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {p.current ? 'Current' : p.online ? 'Online' : 'Offline'}
                  </span>
                </span>
                <span className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><Star size={10} /> {p.rating != null ? Number(p.rating).toFixed(1) : 'New'}</span>
                  {p.km != null && <span className="flex items-center gap-1"><MapPin size={10} /> {p.km} km</span>}
                  {p.phone && <span className="flex items-center gap-1"><Phone size={10} /> {p.phone}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {picked && (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-bold text-slate-800">Offer this booking to {picked.name}?</p>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (kept in the job history)"
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zappy-200" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setPicked(null)} className="flex-1 rounded-lg bg-white py-2 text-xs font-bold text-slate-600 ring-1 ring-slate-200">Back</button>
            <button type="button" onClick={confirm} disabled={assigning || reason.trim().length < 5}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-zappy-600 py-2 text-xs font-bold text-white disabled:opacity-50">
              {assigning && <Loader2 size={13} className="animate-spin" />} Offer and ring
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** What the team knows about a booking, for whoever opens it next. Admin-only. */
export function NotesPanel({ source, id }) {
  const { data } = useAdminJobNotesQuery({ source, id });
  const [add, { isLoading }] = useAdminAddJobNoteMutation();
  const [text, setText] = useState('');

  async function save(e) {
    e.preventDefault();
    try { await add({ source, id, text: text.trim() }).unwrap(); setText(''); } catch (err) { toast.error(err?.data?.error || 'Could not save the note'); }
  }

  return (
    <section className="rounded-xl border border-slate-200 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500"><StickyNote size={13} /> Team notes</p>
      <form onSubmit={save} className="mt-2 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note for the team" maxLength={1000}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zappy-200" />
        <button type="submit" disabled={isLoading || text.trim().length < 2} aria-label="Save note"
          className="flex w-10 items-center justify-center rounded-lg bg-slate-900 text-white disabled:opacity-40"><Send size={14} /></button>
      </form>
      <ul className="mt-2 space-y-2">
        {(data?.notes || []).map((n) => (
          <li key={n._id} className="rounded-lg bg-slate-50 p-2.5">
            <p className="text-xs text-slate-800">{n.text}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">{n.byEmail || 'Admin'}, {fmtDate(n.createdAt)}</p>
          </li>
        ))}
        {!data?.notes?.length && <li className="text-xs text-slate-400">No notes yet.</li>}
      </ul>
    </section>
  );
}
