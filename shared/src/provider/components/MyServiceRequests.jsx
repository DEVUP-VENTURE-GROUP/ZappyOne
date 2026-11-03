import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, CheckCircle2, XCircle } from 'lucide-react';
import { useProviderMyLineRequestsQuery } from '../../services/api';

const STATE = {
  pending: { label: 'Waiting for ZappyOne', cls: 'bg-amber-50 text-amber-800', Icon: Clock },
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
  rejected: { label: 'Not approved', cls: 'bg-red-50 text-red-700', Icon: XCircle },
};
const rupees = (p) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

// The new services this partner asked for (onboarding line-requests), with the photos, jobs and prices exactly as sent.
export default function MyServiceRequests() {
  const { data } = useProviderMyLineRequestsQuery();
  const [viewing, setViewing] = useState(null);
  const requests = data?.requests || [];
  if (!requests.length) return null;
  return (
    <section className="mx-auto mt-4 max-w-lg px-4 lg:max-w-2xl">
      <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-slate-500">Services you asked for</h2>
      <div className="space-y-3">
        {requests.map((r) => {
          const st = STATE[r.status] || STATE.pending;
          return (
            <article key={r._id} className="card space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-900">{r.proposedName}</p>
                  <p className="text-[12px] text-slate-500">Sent {new Date(r.updatedAt || r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                </div>
                <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${st.cls}`}><st.Icon size={13} /> {st.label}</span>
              </div>
              {r.status === 'rejected' && r.reviewNote && <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-800">{r.reviewNote}</p>}
              {r.description && <p className="text-[13.5px] leading-relaxed text-slate-600">{r.description}</p>}
              {r.photoUrls?.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {r.photoUrls.map((src) => (
                    <button key={src} type="button" onClick={() => setViewing(src)} aria-label="View photo" className="aspect-square overflow-hidden rounded-xl bg-slate-100">
                      <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
              {r.packages?.length > 0 && (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                  {r.packages.map((p) => (
                    <li key={p.name} className="flex items-center gap-3 px-3 py-2.5">
                      {p.photoUrl && <button type="button" onClick={() => setViewing(p.photoUrl)} aria-label="View photo" className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100"><img src={p.photoUrl} alt="" className="h-full w-full object-cover" /></button>}
                      <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-semibold text-slate-800">{p.name}</span><span className="text-[12px] text-slate-500">{p.minutes} min</span></span>
                      <span className="text-[14px] font-bold tabular-nums text-slate-900">{rupees(p.pricePaise)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
      <AnimatePresence>
        {viewing && (
          <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setViewing(null)} role="dialog" aria-label="Photo">
            <img src={viewing} alt="" className="max-h-[85vh] max-w-full rounded-xl object-contain" />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
