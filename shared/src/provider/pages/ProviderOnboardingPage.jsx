import { useScrollTopOnChange } from '../../components/common/ScrollToTop';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ChevronRight, Loader2, Check, Clock, AlertTriangle, Upload,
  ShieldCheck, Plus, X, Store, User, FileText, Ban, Camera,
} from 'lucide-react';
import {
  useProviderOnboardingStatusQuery,
  useProviderDomainsQuery,
  useProviderServiceLinesQuery,
  useProviderLineRequirementsQuery,
  useProviderEnrolMutation,
  useProviderSaveEnrolmentMutation,
  useProviderSubmitEnrolmentMutation,
  useProviderRequestServiceLineMutation,
  usePresignUploadMutation,
} from '../../services/api';
import LiveSelfieCapture from '../../components/kyc/LiveSelfieCapture';
import toast from 'react-hot-toast';

/**
 * Provider onboarding — the first thing a shop owner or technician does.
 *
 *   Sign in → what do you work on? → which services? → prove you can do them.
 *
 * The whole screen is drawn from the API. The domains, the services inside
 * them, and the exact documents each one demands are rows an operator edits, so
 * opening "Air Conditioning" to providers changes what this page shows without
 * anyone touching this file.
 *
 * Two things are deliberate in the copy:
 *
 *   A service that is not open yet SAYS SO, rather than being hidden. A scooter
 *   mechanic who cannot sign up today should still see that we are coming, and
 *   be able to tell us so — that request is how we decide what to open next.
 *
 *   Verification is explained per service, not as generic "KYC". A laptop
 *   technician is asked to accept a data-handling rule that phone repair does
 *   not carry, and the reason is stated where they accept it.
 */

const STATUS_META = {
  draft: { label: 'Not submitted', tone: 'slate', icon: FileText },
  pending_review: { label: 'Under review', tone: 'amber', icon: Clock },
  approved: { label: 'Approved', tone: 'emerald', icon: Check },
  rejected: { label: 'Needs changes', tone: 'red', icon: AlertTriangle },
  suspended: { label: 'Paused', tone: 'red', icon: Ban },
};

// Static class strings — Tailwind cannot see classes assembled at runtime.
const TONE = {
  slate: 'bg-slate-100 text-slate-600',
  amber: 'bg-amber-50 text-amber-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  red: 'bg-red-50 text-red-700',
};

function StatusChip({ status }) {
  const meta = STATUS_META[status];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${TONE[meta.tone]}`}>
      <Icon size={11} /> {meta.label}
    </span>
  );
}

function Shell({ children }) {
  return <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-4 space-y-3">{children}</div>;
}

function Spinner() {
  return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-zappy-400" /></div>;
}

function Header({ title, subtitle, onBack }) {
  return (
    <header className="sticky top-0 z-20 bg-white border-b border-slate-100">
      <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
          <ArrowLeft size={17} strokeWidth={2.5} />
        </button>
        <div className="min-w-0">
          <p className="font-bold text-[#0F172A] truncate">{title}</p>
          {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
        </div>
      </div>
    </header>
  );
}

/* Where the provider stands */

function Summary({ status, onAddService, onOpenEnrolment }) {
  const nav = useNavigate();
  const kindLabel = status.providerKind === 'shop' ? 'Shop' : 'Independent technician';
  const name = status.profile?.businessName || status.profile?.name || 'Your account';

  return (
    <Shell>
      <div className="card">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-zappy-50 flex items-center justify-center shrink-0">
            {status.providerKind === 'shop'
              ? <Store size={20} className="text-zappy-600" strokeWidth={1.75} />
              : <User size={20} className="text-zappy-600" strokeWidth={1.75} />}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-[#0F172A] truncate">{name}</p>
            <p className="text-xs text-slate-500">{kindLabel}</p>
          </div>
        </div>
      </div>

      {/*
        The provider's real question is "can customers see me?". Approval alone
        does not answer it — a verified shop with no photo, no hours or no price
        is invisible in practice, so the gap is named rather than implied.
      */}
      {status.isLive ? (
        <div className="card bg-emerald-50 ring-emerald-200">
          <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700">You're live</p>
          <p className="text-sm font-semibold text-emerald-900 mt-0.5">
            Customers can find and book you.
          </p>
        </div>
      ) : (
        <div className="card bg-zappy-50 ring-zappy-100">
          <p className="text-[11px] font-black uppercase tracking-wide text-zappy-700">
            Not visible to customers yet
          </p>
          {status.nextStep && (
            <p className="text-sm font-semibold text-zappy-900 mt-0.5">{status.nextStep.label}</p>
          )}

          {(status.storefront || []).some((s) => !s.done) && (
            <ul className="mt-2.5 space-y-1.5">
              {status.storefront.map((s) => (
                <li key={s.key} className="flex items-center gap-2">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                      s.done ? 'bg-emerald-500' : 'bg-white ring-1 ring-zappy-200'
                    }`}
                  >
                    {s.done && <Check size={10} className="text-white" strokeWidth={3} />}
                  </span>
                  <span className={`text-xs ${s.done ? 'text-slate-400 line-through' : 'font-semibold text-zappy-900'}`}>
                    {s.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide px-1 pt-1">Your services</p>

      {!status.enrolments.length && (
        <div className="card text-center py-8">
          <p className="text-sm font-bold text-slate-700">Nothing chosen yet</p>
          <p className="text-xs text-slate-400 mt-1">Pick what you work on to start getting jobs.</p>
        </div>
      )}

      {status.enrolments.map((e) => (
        <button key={e._id} onClick={() => onOpenEnrolment(e)}
          className="card w-full text-left hover:ring-2 hover:ring-zappy-100 transition">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold text-sm text-[#0F172A]">{e.line?.name || e.lineCode}</p>
              <div className="mt-1"><StatusChip status={e.status} /></div>
              {e.reviewNote && e.status === 'rejected' && (
                <p className="text-xs text-red-600 mt-1.5 leading-relaxed">{e.reviewNote}</p>
              )}
            </div>
            <ChevronRight size={16} className="text-slate-300 shrink-0" />
          </div>
        </button>
      ))}

      <button onClick={onAddService}
        className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-zappy-600 py-3">
        <Plus size={15} /> Add a service
      </button>

      {status.repairVerticals?.length > 0 && (
        <button onClick={() => nav('/provider/services')} className="btn-primary w-full">
          Set up your pricing and stock
        </button>
      )}
    </Shell>
  );
}

/* Pick a domain */

function DomainStep({ onPick }) {
  const { data, isLoading } = useProviderDomainsQuery();
  if (isLoading) return <Spinner />;

  return (
    <Shell>
      <p className="text-xs text-slate-500 px-1">
        Choose the kind of work you do. You can add more later.
      </p>
      {(data?.domains || []).map((d) => (
        <button key={d.code} onClick={() => onPick(d)}
          className="card w-full flex items-center gap-3 text-left hover:ring-2 hover:ring-zappy-100 transition">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-[#0F172A]">{d.name}</p>
            {d.description && <p className="text-xs text-slate-500 mt-0.5">{d.description}</p>}
          </div>
          <ChevronRight size={16} className="text-slate-300" />
        </button>
      ))}
    </Shell>
  );
}

/* Pick the services inside it */

function LineStep({ domain, onPick, onRequest }) {
  const { data, isLoading } = useProviderServiceLinesQuery(domain.code);
  const [enrol, { isLoading: enrolling }] = useProviderEnrolMutation();

  if (isLoading) return <Spinner />;
  const lines = data?.lines || [];

  async function choose(line) {
    if (line.myStatus) return onPick(line);   // already started — go straight in
    try {
      await enrol({ lineCode: line.code }).unwrap();
      onPick(line);
    } catch (err) {
      toast.error(err?.data?.error || 'Could not start that service');
    }
  }

  return (
    <Shell>
      {lines.map((l) => {
        const live = l.status === 'live';
        return (
          <button key={l.code} onClick={() => (live ? choose(l) : null)} disabled={!live || enrolling}
            className={`card w-full text-left transition ${live ? 'hover:ring-2 hover:ring-zappy-100' : 'opacity-70 cursor-default'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-sm text-[#0F172A]">{l.name}</p>
                {l.description && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{l.description}</p>}
                <div className="flex items-center gap-2 mt-1.5">
                  {l.myStatus
                    ? <StatusChip status={l.myStatus} />
                    : !live && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold">
                        Opening soon
                      </span>
                    )}
                </div>
              </div>
              {live && <ChevronRight size={16} className="text-slate-300 shrink-0" />}
            </div>
          </button>
        );
      })}

      <button onClick={onRequest}
        className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-zappy-600 py-3">
        <Plus size={15} /> My service isn't listed
      </button>
    </Shell>
  );
}

/** Provider proposes a service we do not carry. Admin reviews it. */
function RequestSheet({ domain, onClose }) {
  const [form, setForm] = useState({ proposedName: '', description: '' });
  const [submit, { isLoading }] = useProviderRequestServiceLineMutation();

  async function send() {
    try {
      await submit({ domainCode: domain?.code || '', ...form }).unwrap();
      toast.success("Sent — we'll review it and get back to you.");
      onClose();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not send that');
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Tell us what you do</h3>
          <button onClick={onClose} className="text-slate-400"><X size={20} /></button>
        </div>
        <p className="text-xs text-slate-500 -mt-1 leading-relaxed">
          If enough providers ask for the same work, we open it — with proper pricing and verification
          behind it rather than a listing that goes nowhere.
        </p>
        <input className="input text-sm w-full" placeholder="Service name (e.g. Smart Watch Repair)"
          value={form.proposedName} onChange={(e) => setForm((f) => ({ ...f, proposedName: e.target.value }))} />
        <textarea rows={3}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zappy-100 resize-none"
          placeholder="What exactly do you do, and how long have you done it?"
          value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        <button onClick={send} disabled={isLoading || !form.proposedName.trim()} className="btn-primary w-full">
          {isLoading ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : 'Send request'}
        </button>
      </div>
    </div>
  );
}

/* Prove you can do it */

/**
 * The verification screen for ONE service.
 *
 * Every field on it comes from the requirement set the server resolved for this
 * provider kind, so what a laptop shop is asked differs from a phone technician
 * without this component knowing anything about either.
 */
function VerifyStep({ lineCode, onDone }) {
  const { data, isLoading, refetch } = useProviderLineRequirementsQuery(lineCode);
  const [presign] = usePresignUploadMutation();
  const [save] = useProviderSaveEnrolmentMutation();
  const [submit, { isLoading: submitting }] = useProviderSubmitEnrolmentMutation();

  const [uploading, setUploading] = useState(null);
  // The document currently being photographed, when one requires a live capture.
  const [capturing, setCapturing] = useState(null);
  const [fields, setFields] = useState({});
  const [accepted, setAccepted] = useState(false);
  const [missing, setMissing] = useState([]);

  const enrolment = data?.enrolment;
  const reqs = data?.requirements;

  // Documents already uploaded, so a returning provider is not asked twice.
  const have = useMemo(() => {
    const map = {};
    for (const d of enrolment?.documents || []) map[d.code] = d.url;
    return map;
  }, [enrolment]);
  // Identity given once (another service or the ID check) is carried here, not asked again.
  const carried = useMemo(() => new Set((enrolment?.documents || []).filter((d) => d.carried).map((d) => d.code)), [enrolment]);

  const savedFields = useMemo(() => {
    const map = {};
    for (const f of enrolment?.fields || []) map[f.code] = f.value;
    return map;
  }, [enrolment]);

  if (isLoading) return <Spinner />;

  if (!reqs) {
    return (
      <Shell>
        <div className="card bg-amber-50 ring-amber-200">
          <p className="text-sm font-bold text-amber-900">Verification isn't configured for this service yet</p>
          <p className="text-xs text-amber-700 mt-1">
            We'll let you know as soon as it is — you don't need to do anything.
          </p>
        </div>
      </Shell>
    );
  }

  const decided = ['approved', 'suspended'].includes(enrolment?.status);

  /**
   * Put one file behind the document, however it was obtained.
   *
   * `meta` carries the liveness evidence when the photo came from the camera —
   * capture method, time and location — so a reviewer can tell a picture taken
   * at the shop from one that arrived by WhatsApp.
   */
  async function upload(code, file, meta = null) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error('File too large — max 5MB');
    try {
      setUploading(code);
      const contentType = file.type || 'image/jpeg';
      const { data: signed } = await presign({ folder: 'kyc', contentType });
      const res = await fetch(signed.uploadUrl, {
        method: 'PUT', body: file, headers: { 'Content-Type': contentType },
      });
      if (!res.ok) throw new Error('upload failed');

      await save({
        id: enrolment._id,
        documents: [{
          code,
          url: signed.key,
          ...(meta ? {
            captureMethod: meta.captureMethod,
            capturedAt: meta.capturedAt,
            ...(meta.lat != null ? { lat: meta.lat } : {}),
            ...(meta.lng != null ? { lng: meta.lng } : {}),
          } : {}),
        }],
      }).unwrap();
      await refetch();
      toast.success(meta ? 'Photo captured' : 'Uploaded');
    } catch {
      toast.error('Upload failed — please try again');
    } finally {
      setUploading(null);
      setCapturing(null);
    }
  }

  async function send() {
    try {
      // Persist whatever is on screen first, so a submission never races the
      // last thing the provider typed.
      await save({
        id: enrolment._id,
        fields: Object.entries(fields).map(([code, value]) => ({ code, value })),
        acceptedDeclarations: accepted || enrolment.acceptedDeclarations,
      }).unwrap();

      await submit(enrolment._id).unwrap();
      setMissing([]);
      toast.success('Sent for verification');
      onDone();
    } catch (err) {
      const body = err?.data;
      if (body?.code === 'INCOMPLETE') {
        setMissing(body.missing || []);
        toast.error('Some required items are still missing');
      } else if (body?.code === 'BAD_FORMAT') {
        setMissing((body.fields || []).map((f) => ({ ...f, kind: 'field' })));
        toast.error('Check the highlighted details');
      } else {
        toast.error(body?.error || 'Could not submit');
      }
    }
  }

  const missingCodes = new Set(missing.map((m) => m.code));

  return (
    <Shell>
      {capturing && (
        <LiveSelfieCapture
          facingMode={capturing.capture}
          title={capturing.label}
          instruction={capturing.hint}
          onCancel={() => setCapturing(null)}
          onCapture={(blob, meta) => {
            const file = new File([blob], `${capturing.code}.jpg`, { type: 'image/jpeg' });
            upload(capturing.code, file, meta);
          }}
        />
      )}

      {enrolment?.status === 'pending_review' && (
        <div className="card bg-amber-50 ring-amber-200">
          <p className="text-sm font-bold text-amber-900">We're reviewing your documents</p>
          <p className="text-xs text-amber-700 mt-1">
            Usually within a day. We'll notify you the moment it's decided.
          </p>
        </div>
      )}
      {enrolment?.status === 'approved' && (
        <div className="card bg-emerald-50 ring-emerald-200">
          <p className="text-sm font-bold text-emerald-900">You're approved for {data.line.name}</p>
          <p className="text-xs text-emerald-700 mt-1">Set up your services and pricing to start receiving jobs.</p>
        </div>
      )}
      {enrolment?.status === 'rejected' && enrolment.reviewNote && (
        <div className="card bg-red-50 ring-red-200">
          <p className="text-sm font-bold text-red-900">Needs changes</p>
          <p className="text-xs text-red-700 mt-1 leading-relaxed">{enrolment.reviewNote}</p>
        </div>
      )}

      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide px-1">Documents</p>
      {reqs.documents.map((d) => {
        const uploaded = !!have[d.code];
        const isMissing = missingCodes.has(d.code);
        return (
          <div key={d.code} className={`card ${uploaded ? 'ring-emerald-200 bg-emerald-50/30' : isMissing ? 'ring-red-200' : ''}`}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${uploaded ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                {uploaded ? <Check size={17} className="text-emerald-600" /> : <FileText size={17} className="text-slate-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-[#0F172A]">
                  {d.label}{!d.required && <span className="text-slate-400 font-normal"> · optional</span>}
                </p>
                {carried.has(d.code)
                  ? <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">Already on file from your verification. Nothing to do.</p>
                  : d.hint && <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{d.hint}</p>}
              </div>
              {!decided && !carried.has(d.code) && (d.capture ? (
                /*
                  This one has to be taken now. A file picker would let the
                  gallery answer a question about the present moment, which is
                  precisely what the requirement exists to prevent.
                */
                <button
                  type="button"
                  onClick={() => setCapturing(d)}
                  disabled={uploading === d.code}
                  className={`btn-secondary text-xs py-2 px-3 shrink-0 ${uploading === d.code ? 'opacity-50' : ''}`}
                >
                  {uploading === d.code
                    ? <Loader2 size={13} className="animate-spin" />
                    : <><Camera size={13} /> {uploaded ? 'Retake' : 'Take photo'}</>}
                </button>
              ) : (
                <label className={`btn-secondary cursor-pointer text-xs py-2 px-3 shrink-0 ${uploading === d.code ? 'opacity-50' : ''}`}>
                  {uploading === d.code
                    ? <Loader2 size={13} className="animate-spin" />
                    : <><Upload size={13} /> {uploaded ? 'Replace' : 'Upload'}</>}
                  <input type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={(e) => upload(d.code, e.target.files?.[0])} />
                </label>
              ))}
            </div>
          </div>
        );
      })}

      {reqs.fields.length > 0 && (
        <>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide px-1 pt-2">Details</p>
          {reqs.fields.map((f) => (
            <div key={f.code} className="card">
              <label className="text-xs font-semibold text-slate-600">
                {f.label}{!f.required && <span className="text-slate-400 font-normal"> · optional</span>}
              </label>
              <input
                className={`input text-sm w-full mt-1.5 ${missingCodes.has(f.code) ? '!ring-2 !ring-red-200' : ''}`}
                value={fields[f.code] ?? savedFields[f.code] ?? ''}
                disabled={decided}
                onChange={(e) => setFields((s) => ({ ...s, [f.code]: e.target.value }))}
              />
              {f.hint && <p className="text-[11px] text-slate-400 mt-1">{f.hint}</p>}
            </div>
          ))}
        </>
      )}

      {reqs.declarations.length > 0 && (
        <div className="card">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">What you're agreeing to</p>
          <ul className="mt-2 space-y-2">
            {reqs.declarations.map((text) => (
              <li key={text} className="flex items-start gap-2">
                <ShieldCheck size={14} className="text-zappy-500 shrink-0 mt-0.5" />
                <span className="text-xs text-slate-600 leading-relaxed">{text}</span>
              </li>
            ))}
          </ul>
          {!decided && (
            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input type="checkbox"
                checked={accepted || !!enrolment?.acceptedDeclarations}
                onChange={(e) => setAccepted(e.target.checked)} />
              <span className="text-xs font-semibold text-slate-700">I accept these conditions</span>
            </label>
          )}
        </div>
      )}

      {!decided && (
        <button onClick={send} disabled={submitting || enrolment?.status === 'pending_review'} className="btn-primary w-full">
          {submitting
            ? <><Loader2 size={15} className="animate-spin" /> Sending…</>
            : enrolment?.status === 'pending_review' ? 'Awaiting review' : 'Submit for verification'}
        </button>
      )}
    </Shell>
  );
}

/* Flow controller */

export default function ProviderOnboardingPage() {
  const nav = useNavigate();
  const { data: status, isLoading } = useProviderOnboardingStatusQuery();

  const [step, setStep] = useState('summary');

  useScrollTopOnChange(step);
  const [domain, setDomain] = useState(null);
  const [lineCode, setLineCode] = useState(null);
  const [showRequest, setShowRequest] = useState(false);

  if (isLoading) return <div className="min-h-screen bg-[#F9FAFB]"><Spinner /></div>;

  const titles = {
    summary: 'Your services',
    domain: 'What kind of work do you do?',
    line: domain?.name || 'Choose a service',
    verify: 'Verification',
  };

  function back() {
    if (step === 'summary') return nav(-1);
    if (step === 'domain') return setStep('summary');
    if (step === 'line') return setStep('domain');
    return setStep('summary');
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-10">
      <Header title={titles[step]} onBack={back}
        subtitle={status?.providerKind === 'shop' ? status?.profile?.businessName : status?.profile?.name} />

      {showRequest && <RequestSheet domain={domain} onClose={() => setShowRequest(false)} />}

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
          {step === 'summary' && status && (
            <Summary
              status={status}
              onAddService={() => setStep('domain')}
              onOpenEnrolment={(e) => { setLineCode(e.lineCode); setStep('verify'); }}
            />
          )}
          {step === 'domain' && <DomainStep onPick={(d) => { setDomain(d); setStep('line'); }} />}
          {step === 'line' && (
            <LineStep domain={domain}
              onPick={(l) => { setLineCode(l.code); setStep('verify'); }}
              onRequest={() => setShowRequest(true)} />
          )}
          {step === 'verify' && lineCode && (
            <VerifyStep lineCode={lineCode} onDone={() => setStep('summary')} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
