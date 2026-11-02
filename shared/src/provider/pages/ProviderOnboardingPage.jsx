import { useScrollTopOnChange } from '../../components/common/ScrollToTop';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ChevronRight, Loader2, Check, Clock, AlertTriangle, Upload,
  ShieldCheck, Plus, X, Store, User, FileText, Ban, Camera, Home,
} from 'lucide-react';
import PhotoTiles from '../../components/common/PhotoTiles';
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
import { prepareImage } from '../../utils/prepareImage';
import InstantIdCheck from '../InstantIdCheck';
import { servicePhoto } from '../../components/home/problemArt';
import { artFor } from '../../components/home/serviceArt';

/** A picture for a service or a kind of work: its upload, our photo, else its character. */
const pictureOf = (code, domainCode, imageUrl) => imageUrl || (code && servicePhoto(code)) || artFor(code, domainCode)?.still || null;

function Thumb({ src }) {
  return src
    ? <img src={src} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-xl bg-slate-50 object-cover" />
    : null;
}

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
        does not answer it - a verified shop with no photo, no hours or no price
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
          <Thumb src={pictureOf(null, d.code, d.imageUrl)} />
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
  const [enrol] = useProviderEnrolMutation();
  const [picked, setPicked] = useState([]);
  const [adding, setAdding] = useState(false);

  if (isLoading) return <Spinner />;
  const lines = data?.lines || [];
  const toggle = (code) => setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]));

  async function addPicked() {
    setAdding(true);
    const started = [];
    for (const code of picked) {
      try { await enrol({ lineCode: code }).unwrap(); started.push(code); } catch (err) { toast.error(err?.data?.error || 'Could not start one of them'); }
    }
    setAdding(false);
    if (!started.length) return;
    if (started.length > 1) toast.success(`${started.length} services added. Your documents carry over to each one.`);
    onPick(lines.find((l) => l.code === started[0]));
  }

  return (
    <Shell>
      <p className="-mt-1 text-[13px] text-slate-500">Tick every service you do. You send your documents once.</p>
      {lines.map((l) => {
        const live = l.status === 'live';
        const on = picked.includes(l.code);
        const go = () => (!live ? null : l.myStatus ? onPick(l) : toggle(l.code));
        return (
          <button key={l.code} type="button" onClick={go} disabled={!live || adding} aria-pressed={l.myStatus ? undefined : on}
            className={`card w-full text-left transition ${!live ? 'cursor-default opacity-70' : on ? 'ring-2 ring-zappy-500' : 'hover:ring-2 hover:ring-zappy-100'}`}>
            <div className="flex items-start justify-between gap-3">
              <Thumb src={pictureOf(l.code, domain.code, l.imageUrl)} />
              <div className="min-w-0 flex-1">
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
              {live && (l.myStatus
                ? <ChevronRight size={16} className="text-slate-300 shrink-0" />
                : <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 ${on ? 'border-zappy-600 bg-zappy-600 text-white' : 'border-slate-300'}`}>{on && <Check size={14} strokeWidth={3} />}</span>)}
            </div>
          </button>
        );
      })}

      <button onClick={onRequest}
        className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-zappy-600 py-3">
        <Plus size={15} /> My service isn't listed
      </button>

      {picked.length > 0 && (
        <div className="sticky bottom-0 -mx-4 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
          <button type="button" onClick={addPicked} disabled={adding} className="btn-primary h-12 w-full">
            {adding ? <Loader2 size={16} className="animate-spin" /> : null}
            Add {picked.length} service{picked.length === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </Shell>
  );
}

const blankJob = () => ({ name: '', includes: '', minutes: '', price: '', photos: [] });

// Provider proposes a service we do not carry, with photos and their own jobs and prices; on approval it becomes their menu. Several can be sent one after another.
function RequestSheet({ domain, onClose }) {
  const [form, setForm] = useState({ proposedName: '', description: '', years: '', modes: ['doorstep'] });
  const [photos, setPhotos] = useState([]);
  const [jobs, setJobs] = useState([blankJob()]);
  const [sent, setSent] = useState(0);
  const [submit, { isLoading }] = useProviderRequestServiceLineMutation();
  const filled = jobs.filter((j) => j.name.trim().length >= 2 && Number(j.minutes) >= 5 && Number(j.price) >= 1);
  const setJob = (i, k, v) => setJobs((js) => js.map((j, n) => (n === i ? { ...j, [k]: typeof v === 'function' ? v(j[k]) : v } : j)));
  const toggleMode = (m) => setForm((f) => ({ ...f, modes: f.modes.includes(m) ? f.modes.filter((x) => x !== m) : [...f.modes, m] }));

  async function send() {
    try {
      await submit({
        domainCode: domain?.code || '', proposedName: form.proposedName.trim(), description: form.description.trim(),
        photos, serviceModes: form.modes, yearsExperience: form.years === '' ? null : Number(form.years),
        packages: filled.map((j) => ({
          name: j.name.trim(), minutes: Math.round(Number(j.minutes)), pricePaise: Math.round(Number(j.price) * 100),
          includes: j.includes.split(',').map((x) => x.trim()).filter((x) => x.length >= 2).slice(0, 8), photoKey: j.photos[0] || '',
        })),
      }).unwrap();
      setSent((n) => n + 1);
      toast.success('Sent. ZappyOne will review it. Add another service, or close.');
      setForm({ proposedName: '', description: '', years: '', modes: ['doorstep'] });
      setPhotos([]);
      setJobs([blankJob()]);
    } catch (err) {
      toast.error(err?.data?.error || 'Could not send that');
    }
  }

  const field = 'h-11 w-full rounded-btn border border-line-strong bg-white px-3 text-[15px] text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-zappy-600 focus:ring-2 focus:ring-zappy-100';
  const label = 'mb-1.5 block text-[13px] font-semibold text-ink-700';
  const MODES = [['doorstep', "At the customer's place", Home], ['workshop', 'At my shop', Store]];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/50 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="req-title" className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-sheet bg-white sm:max-w-lg sm:rounded-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 pb-3 pt-5">
          <div className="min-w-0">
            <h3 id="req-title" className="text-[18px] font-extrabold text-ink-900">Tell us what you do</h3>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-500">Once ZappyOne approves it, this becomes your menu at your prices.{sent > 0 && <span className="ml-1 font-semibold text-emerald-700">{sent} sent so far.</span>}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-500 hover:bg-sunken"><X size={18} /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div>
            <label className={label} htmlFor="req-name">Service name</label>
            <input id="req-name" className={field} placeholder="e.g. Smart watch repair" maxLength={120}
              value={form.proposedName} onChange={(e) => setForm((f) => ({ ...f, proposedName: e.target.value }))} />
          </div>
          <div>
            <label className={label} htmlFor="req-about">What exactly do you do?</label>
            <textarea id="req-about" rows={3} maxLength={1000} className={`${field} h-auto resize-none py-2.5`}
              placeholder="The work, the brands or items you handle, anything customers should know"
              value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>

          <div>
            <p className={label}>Photos of your work <span className="font-normal text-ink-400">up to 6</span></p>
            <PhotoTiles value={photos} onChange={setPhotos} max={6} folder="line-requests" />
          </div>

          <div>
            <p className={label}>Where you do it</p>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map(([m, l, Icon]) => {
                const on = form.modes.includes(m);
                return (
                  <button key={m} type="button" aria-pressed={on} onClick={() => toggleMode(m)}
                    className={`flex items-center gap-2 rounded-btn border px-3 py-2.5 text-left text-[13.5px] font-semibold transition ${on ? 'border-zappy-600 bg-zappy-50 text-zappy-800 ring-1 ring-zappy-600' : 'border-line-strong text-ink-700 hover:border-zappy-400'}`}>
                    <Icon size={16} className="shrink-0" />
                    <span className="min-w-0 leading-snug">{l}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="max-w-[10rem]">
            <label className={label} htmlFor="req-years">Years doing it</label>
            <input id="req-years" className={field} inputMode="numeric" value={form.years} onChange={(e) => setForm((f) => ({ ...f, years: e.target.value.replace(/\D/g, '').slice(0, 2) }))} placeholder="e.g. 5" />
          </div>

          <div className="space-y-3">
            <p className={`${label} mb-0`}>Your jobs and prices</p>
            {jobs.map((j, i) => (
              <div key={i} className="space-y-3 rounded-card border border-line bg-canvas p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-400">Job {i + 1}</span>
                  {jobs.length > 1 && <button type="button" onClick={() => setJobs((js) => js.filter((_, n) => n !== i))} className="text-[12.5px] font-semibold text-ink-500 hover:text-red-700">Remove</button>}
                </div>
                <div className="flex gap-3">
                  <PhotoTiles value={j.photos} onChange={(v) => setJob(i, 'photos', v)} max={1} size="h-[92px] w-[92px]" label="Photo" folder="line-requests" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <input className={field} placeholder="Job name, e.g. Strap replacement" aria-label="Job name" value={j.name} maxLength={80} onChange={(e) => setJob(i, 'name', e.target.value)} />
                    <div className="grid grid-cols-2 gap-2">
                      <span className="flex h-11 items-center rounded-btn border border-line-strong bg-white px-3 focus-within:border-zappy-600 focus-within:ring-2 focus-within:ring-zappy-100">
                        <input className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-400" placeholder="30" aria-label="Minutes it takes" inputMode="numeric" value={j.minutes} onChange={(e) => setJob(i, 'minutes', e.target.value.replace(/\D/g, '').slice(0, 4))} />
                        <span className="text-[12.5px] text-ink-400">min</span>
                      </span>
                      <span className="flex h-11 items-center rounded-btn border border-line-strong bg-white px-3 focus-within:border-zappy-600 focus-within:ring-2 focus-within:ring-zappy-100">
                        <span className="text-[14px] font-semibold text-ink-400">₹</span>
                        <input className="min-w-0 flex-1 bg-transparent pl-1 text-[15px] font-semibold outline-none placeholder:font-normal placeholder:text-ink-400" placeholder="Price" aria-label="Your price in rupees" inputMode="numeric" value={j.price} onChange={(e) => setJob(i, 'price', e.target.value.replace(/\D/g, '').slice(0, 6))} />
                      </span>
                    </div>
                  </div>
                </div>
                <input className={field} placeholder="What's included, separated by commas" aria-label="What is included" value={j.includes} maxLength={300} onChange={(e) => setJob(i, 'includes', e.target.value)} />
              </div>
            ))}
            {jobs.length < 20 && (
              <button type="button" onClick={() => setJobs((js) => [...js, blankJob()])} className="flex w-full items-center justify-center gap-1.5 rounded-card border border-dashed border-line-strong py-3 text-[13.5px] font-semibold text-zappy-700 hover:border-zappy-400">
                <Plus size={15} /> Add another job
              </button>
            )}
          </div>
        </div>

        <div className="border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button type="button" onClick={send} disabled={isLoading || form.proposedName.trim().length < 2 || !filled.length} className="btn-primary h-12 w-full">
            {isLoading ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : filled.length ? `Send request with ${filled.length} job${filled.length === 1 ? '' : 's'}` : 'Add a job with time and price to send'}
          </button>
        </div>
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
            We'll let you know as soon as it is - you don't need to do anything.
          </p>
        </div>
      </Shell>
    );
  }

  const decided = ['approved', 'suspended'].includes(enrolment?.status);
  // The reviewer asked for named documents again: only those can change now.
  const redo = enrolment?.status === 'rejected' && enrolment?.redo?.codes?.length ? new Set(enrolment.redo.codes) : null;
  const redoSince = redo && enrolment.redo.requestedAt ? new Date(enrolment.redo.requestedAt) : null;
  const sentAgain = (code) => {
    const d = (enrolment?.documents || []).find((x) => x.code === code);
    return !!d?.url && (!redoSince || new Date(d.uploadedAt) > redoSince);
  };

  /**
   * Put one file behind the document, however it was obtained.
   *
   * `meta` carries the liveness evidence when the photo came from the camera —
   * capture method, time and location — so a reviewer can tell a picture taken
   * at the shop from one that arrived by WhatsApp.
   */
  async function upload(code, picked, meta = null) {
    const file = await prepareImage(picked);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error('File too large - max 5MB');
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
      toast.error('Upload failed - please try again');
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
      {redo && (
        <div className="card bg-red-50 ring-red-200">
          <p className="text-sm font-bold text-red-900">
            Please send {redo.size === 1 ? 'this document' : 'these documents'} again
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {reqs.documents.filter((d) => redo.has(d.code)).map((d) => (
              <li key={d.code} className="text-xs font-semibold text-red-800">{d.label}{sentAgain(d.code) ? ' (done)' : ''}</li>
            ))}
          </ul>
          {enrolment.reviewNote && <p className="text-xs text-red-700 mt-1.5 leading-relaxed">{enrolment.reviewNote}</p>}
          <p className="text-[11px] text-red-600 mt-1.5">Everything else you sent is fine and stays as it is.</p>
        </div>
      )}
      {!redo && enrolment?.status === 'rejected' && enrolment.reviewNote && (
        <div className="card bg-red-50 ring-red-200">
          <p className="text-sm font-bold text-red-900">Needs changes</p>
          <p className="text-xs text-red-700 mt-1 leading-relaxed">{enrolment.reviewNote}</p>
        </div>
      )}

      {/* Verify identity in a minute when ZappyOne has an instant check; otherwise our team reviews the uploads. */}
      {!decided && reqs.documents.some((d) => ['aadhaar', 'owner_id', 'pan'].includes(d.code)) && <InstantIdCheck />}
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide px-1">Documents</p>
      {reqs.documents.map((d) => {
        const again = redo?.has(d.code);
        // Locked when the reviewer accepted it; open (and not yet done) when they asked for it again.
        const locked = decided || (redo && !again);
        const uploaded = again ? sentAgain(d.code) : !!have[d.code];
        const isMissing = missingCodes.has(d.code) || (again && !uploaded);
        return (
          <div key={d.code} className={`card ${uploaded ? 'ring-emerald-200 bg-emerald-50/30' : isMissing ? 'ring-red-200' : ''}`}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${uploaded ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                {uploaded ? <Check size={17} className="text-emerald-600" /> : <FileText size={17} className="text-slate-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-[#0F172A]">
                  {d.label}{!d.required && <span className="text-slate-400 font-normal">, optional</span>}
                </p>
                {again
                  ? <p className="text-xs font-semibold text-red-700 mt-0.5 leading-relaxed">{uploaded ? 'New copy added. Submit when ready.' : 'Asked for again: send a new, clear copy.'}</p>
                  : redo
                    ? <p className="text-xs text-emerald-700 mt-0.5">Accepted</p>
                    : carried.has(d.code)
                  ? <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">Already on file from your verification. Nothing to do.</p>
                  : d.hint && <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{d.hint}</p>}
              </div>
              {!locked && (again || !carried.has(d.code)) && (d.capture ? (
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
                {f.label}{!f.required && <span className="text-slate-400 font-normal">, optional</span>}
              </label>
              <input
                className={`input text-sm w-full mt-1.5 ${missingCodes.has(f.code) ? '!ring-2 !ring-red-200' : ''}`}
                value={fields[f.code] ?? savedFields[f.code] ?? ''}
                disabled={decided || !!redo}
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
            : enrolment?.status === 'pending_review' ? 'Awaiting review' : redo ? 'Send for review again' : 'Submit for verification'}
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
