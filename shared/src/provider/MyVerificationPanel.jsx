import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Clock, XCircle, FileText, Camera, ChevronRight, X, Loader2, PauseCircle, PencilLine } from 'lucide-react';
import { useProviderMyDocumentsQuery } from '../services/api';
import InstantIdCheck from './InstantIdCheck';

/**
 * What you gave us, and where each service stands — for a worker or a shop,
 * in whichever panel they are in. Read-only: identity is shown once (it is
 * reused for every service), then each service's application with its own
 * documents, answers and the reviewer's note.
 *
 * The one rule it makes plain: a verified identity does not bring work by
 * itself. Jobs come only for services marked Approved.
 */

const STATUS = {
  approved: { label: 'Approved, you get jobs', Icon: ShieldCheck, chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  pending_review: { label: 'Under review', Icon: Clock, chip: 'bg-amber-50 text-amber-800 ring-amber-200' },
  draft: { label: 'Not submitted yet', Icon: PencilLine, chip: 'bg-slate-100 text-slate-600 ring-slate-200' },
  rejected: { label: 'Needs changes', Icon: XCircle, chip: 'bg-red-50 text-red-700 ring-red-200' },
  suspended: { label: 'Paused by ZappyOne', Icon: PauseCircle, chip: 'bg-slate-100 text-slate-700 ring-slate-300' },
  not_submitted: { label: 'Not submitted yet', Icon: PencilLine, chip: 'bg-slate-100 text-slate-600 ring-slate-200' },
};
const meta = (s) => STATUS[s] || STATUS.draft;
const when = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

export default function MyVerificationPanel({ isShop = false, addServiceHref = '/provider/onboarding' }) {
  const nav = useNavigate();
  const { data, isLoading, isError } = useProviderMyDocumentsQuery();
  const [open, setOpen] = useState(null);

  if (isLoading) return <div className="flex h-32 items-center justify-center"><Loader2 className="animate-spin text-zappy-500" /></div>;
  if (isError || !data) return null;
  const { identity, services } = data;
  const approved = services.filter((s) => s.status === 'approved');

  return (
    <div className="space-y-4">
      {/* The rule, said once, where it cannot be missed. */}
      <div className={`rounded-2xl p-4 ring-1 ${approved.length ? 'bg-emerald-50 ring-emerald-200' : 'bg-amber-50 ring-amber-200'}`}>
        <p className={`text-[14px] font-bold ${approved.length ? 'text-emerald-900' : 'text-amber-900'}`}>
          {approved.length
            ? `You get jobs for ${approved.map((s) => s.name).join(', ')}`
            : 'No service approved yet, so no jobs come to you'}
        </p>
        <p className={`mt-0.5 text-[12.5px] leading-relaxed ${approved.length ? 'text-emerald-800' : 'text-amber-800'}`}>
          {isShop ? 'Your shop' : 'Your'} ID is checked once and reused for every service. Each service is approved on its own; only approved services bring jobs.
        </p>
      </div>

      {/* Instant, when ZappyOne has a KYC provider; otherwise nothing here and the team reviews. */}
      <InstantIdCheck />

      <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[14px] font-bold text-navy">{isShop ? 'Shop identity' : 'Your identity'}</p>
          <StatusChip status={identity.status} identity />
        </div>
        <p className="mt-0.5 text-[12px] text-slate-500">Given once. Used for every service you add.</p>
        {identity.documents.length ? (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {identity.documents.map((d) => <DocTile key={d.code} doc={d} onOpen={() => setOpen(d)} />)}
          </div>
        ) : (
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-[12.5px] text-slate-500">Nothing uploaded yet.</p>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-bold text-navy">Your services</p>
          <button type="button" onClick={() => nav(addServiceHref)} className="text-[12.5px] font-semibold text-zappy-600 hover:underline">Add a service</button>
        </div>
        {!services.length && (
          <p className="rounded-2xl bg-white p-4 text-[13px] text-slate-500 ring-1 ring-slate-100">You have not applied for a service yet.</p>
        )}
        {services.map((s) => (
          <div key={s.lineCode} className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-navy">{s.name}</p>
                <p className="text-[11.5px] text-slate-500">
                  {s.status === 'approved' && s.reviewedAt ? `Approved ${when(s.reviewedAt)}`
                    : s.submittedAt ? `Sent ${when(s.submittedAt)}` : 'Started, not sent for review'}
                </p>
              </div>
              <StatusChip status={s.status} />
            </div>
            {s.reviewNote && ['rejected', 'suspended', 'pending_review'].includes(s.status) && (
              <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-800">Reviewer: {s.reviewNote}</p>
            )}
            {s.documents.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {s.documents.map((d) => <DocTile key={d.code} doc={d} onOpen={() => setOpen(d)} />)}
              </div>
            )}
            {s.fields.length > 0 && (
              <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-2">
                {s.fields.map((f) => (
                  <div key={f.code} className="flex justify-between gap-3 border-b border-dashed border-slate-100 py-1">
                    <dt className="text-slate-500">{f.label}</dt><dd className="truncate text-right font-medium text-navy">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {['draft', 'rejected'].includes(s.status) && (
              <button type="button" onClick={() => nav(addServiceHref)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-zappy-600 py-2.5 text-[13px] font-semibold text-white">
                {s.status === 'draft' ? 'Finish and send for review' : 'Fix and send again'} <ChevronRight size={15} />
              </button>
            )}
          </div>
        ))}
      </section>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(null)}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="relative max-h-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
              <img src={open.url} alt={open.label} className="max-h-[80vh] rounded-2xl object-contain" />
              <p className="mt-2 text-center text-[13px] font-semibold text-white">{open.label}{open.uploadedAt ? `, ${when(open.uploadedAt)}` : ''}</p>
              <button type="button" onClick={() => setOpen(null)} aria-label="Close"
                className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-navy shadow"><X size={18} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusChip({ status, identity = false }) {
  const m = meta(status);
  const label = identity && status === 'approved' ? 'Verified' : m.label;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 ${m.chip}`}>
      <m.Icon size={12} /> {label}
    </span>
  );
}

function DocTile({ doc, onOpen }) {
  const Icon = doc.live ? Camera : FileText;
  return (
    <button type="button" onClick={() => doc.url && onOpen()} disabled={!doc.url}
      className="group overflow-hidden rounded-xl bg-slate-50 text-left ring-1 ring-slate-100 transition hover:ring-zappy-300">
      <span className="relative block aspect-[4/3] bg-slate-100">
        {doc.url
          ? <img src={doc.url} alt="" loading="lazy" className="h-full w-full object-cover" />
          : <span className="flex h-full items-center justify-center"><Icon size={18} className="text-slate-400" /></span>}
        {doc.live && <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9.5px] font-bold text-white">Live</span>}
      </span>
      <span className="block truncate px-2 py-1.5 text-[11px] font-semibold text-slate-700">{doc.label}</span>
    </button>
  );
}
