import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ExternalLink, Eye, ImageOff, Info, Monitor, MousePointerClick,
  Pause, Pencil, Play, Plus, Smartphone, Trash2, Upload, X,
} from 'lucide-react';
import { useAdminBannerUploadUrlMutation, useLiveCatalogQuery } from '@shared/services/api';
import PromoBanner from '@shared/components/home/PromoBanner';
import { PORTAL_URLS } from '@shared/config/portals';
import {
  BANNER_KINDS, BANNER_ROUTES, HOME_PLACEMENT, IMAGE_SPECS, KIND_BY_TYPE, checkBannerLink, isLoadableImage,
} from '@shared/config/homepageContent';
import { Card, EmptyState, FormRow, Input, PageLoader, SectionHeader, Select, fmtDate } from '../../../ui/kit';
import { isHouseBanner, liveState, useHomepageBanners } from './useHomepageBanners';

/**
 * Homepage → Banners. Creates and edits the hero, campaign and offer banners
 * customers see on Home, on top of the existing ads API (placement
 * `home_banner`). See shared/config/homepageContent.js for the mapping.
 */

const STATE_STYLE = {
  live: 'bg-green-100 text-green-700',
  scheduled: 'bg-blue-100 text-blue-700',
  ended: 'bg-slate-100 text-slate-500',
  draft: 'bg-amber-100 text-amber-700',
  paused: 'bg-slate-100 text-slate-600',
  pending_approval: 'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
  completed: 'bg-slate-100 text-slate-500',
  exhausted: 'bg-slate-100 text-slate-500',
};

function StateBadge({ ad }) {
  const s = liveState(ad);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATE_STYLE[s] || 'bg-slate-100 text-slate-600'}`}>
      {s === 'live' && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
      {s.replace(/_/g, ' ')}
    </span>
  );
}

const toLocalInput = (d) => {
  const date = d ? new Date(d) : new Date();
  const off = date.getTimezoneOffset();
  return new Date(date.getTime() - off * 60000).toISOString().slice(0, 16);
};
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

function emptyForm(kind = 'hero') {
  return {
    kind, title: '', headline: '', body: '', badgeText: '', ctaEnabled: true, ctaText: 'Book now', ctaLink: '/services',
    imageUrl: '', imagePreview: '', backgroundColor: '#1F4FD8', textColor: '#FFFFFF',
    startAt: toLocalInput(new Date()), endAt: toLocalInput(inDays(30)), priority: 0,
  };
}

function formFromAd(ad) {
  const c = ad.content || {};
  return {
    kind: KIND_BY_TYPE[ad.type] || 'hero',
    title: ad.title || '', headline: c.headline || '', body: c.body || '', badgeText: c.badgeText || '',
    ctaEnabled: Boolean(c.ctaLink), ctaText: c.ctaText || 'Learn more', ctaLink: c.ctaLink || '',
    // The list answers with a signed link; the server turns it back into the key on save.
    imageUrl: c.imageUrl || '', imagePreview: c.imageUrl || '', backgroundColor: c.backgroundColor || '#1F4FD8', textColor: c.textColor || '#FFFFFF',
    startAt: toLocalInput(ad.schedule?.startAt), endAt: toLocalInput(ad.schedule?.endAt), priority: ad.billing?.rate || 0,
    videoUrl: c.videoUrl || '',
  };
}

/** The ad shape PromoBanner renders, from the form — the preview is the real component. */
const previewAd = (f) => ({
  _id: 'preview',
  type: BANNER_KINDS[f.kind].type,
  content: {
    headline: f.headline || 'Your headline appears here', body: f.body, badgeText: f.badgeText,
    ctaText: f.ctaEnabled ? f.ctaText : '', ctaLink: f.ctaEnabled ? f.ctaLink : '',
    imageUrl: isLoadableImage(f.imagePreview) ? f.imagePreview : '', backgroundColor: f.backgroundColor, textColor: f.textColor,
  },
});

/* Image upload: presigned PUT straight to S3 (POST /:slug/ads/banner-upload) */

const UPLOAD_TYPES = { 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'] };
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // matches the server's limit
const fmtBytes = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
/** A stored image reference the API accepts: none, a banner key, or an https link. */
const validImageRef = (v) => !v || /^https:\/\//i.test(v) || /^homepage-banners\//.test(v);

function putToS3({ url, file, contentType, onProgress, xhrRef }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open('PUT', url);
    // Content-Type and Content-Length are part of the signature; the browser sets the length.
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(Object.assign(new Error('upload'), { status: xhr.status })));
    xhr.onerror = () => reject(Object.assign(new Error('network'), { status: 0 }));
    xhr.onabort = () => reject(Object.assign(new Error('aborted'), { aborted: true }));
    xhr.send(file);
  });
}

function ImageUploader({ value, preview, onChange }) {
  const [requestUpload] = useAdminBannerUploadUrlMutation();
  const [state, setState] = useState({ phase: 'idle' }); // idle | uploading | done | error
  const [showLink, setShowLink] = useState(Boolean(value) && /^https:\/\//i.test(value) && !preview?.includes('X-Amz-Signature'));
  const xhrRef = useRef(null);
  const inputRef = useRef(null);

  async function upload(file) {
    const ext = file.name.toLowerCase().split('.').pop();
    const contentType = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
    if (!UPLOAD_TYPES[contentType] || !UPLOAD_TYPES[contentType].includes(ext)) {
      setState({ phase: 'error', file, message: 'Use a JPG, PNG or WebP image.' }); return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setState({ phase: 'error', file, message: `This file is ${fmtBytes(file.size)}. The limit is 5 MB.` }); return;
    }
    const localUrl = URL.createObjectURL(file);
    setState({ phase: 'uploading', file, progress: 0 });
    // One automatic retry with a fresh link covers a link that expired mid-way (403).
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { uploadUrl, key } = await requestUpload({ contentType, size: file.size, filename: file.name }).unwrap();
        await putToS3({ url: uploadUrl, file, contentType, xhrRef, onProgress: (p) => setState((s) => ({ ...s, progress: p })) });
        onChange({ imageUrl: key, imagePreview: localUrl });
        setState({ phase: 'done', file });
        return;
      } catch (e) {
        if (e.aborted) { URL.revokeObjectURL(localUrl); setState({ phase: 'idle' }); return; }
        if (attempt === 0 && e.status === 403) continue;
        URL.revokeObjectURL(localUrl);
        const message = e?.data?.error
          || (e.status === 0 ? 'The upload was interrupted. Check your connection and try again.' : 'The upload failed. Try again.');
        setState({ phase: 'error', file, message });
        return;
      }
    }
  }

  function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // picking the same file again still fires
    if (file) upload(file);
  }

  const busy = state.phase === 'uploading';
  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPick} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
          <Upload size={14} /> {value ? 'Replace image' : 'Upload image'}
        </button>
        {value && !busy && (
          <button type="button" onClick={() => { onChange({ imageUrl: '', imagePreview: '' }); setState({ phase: 'idle' }); }}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">Remove image</button>
        )}
        {busy && (
          <button type="button" onClick={() => xhrRef.current?.abort()} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel upload</button>
        )}
        <span className="text-[11px] text-slate-400">JPG, PNG or WebP · up to 5 MB</span>
      </div>

      {state.file && (
        <p className="text-[12px] text-slate-600">
          <span className="font-semibold">{state.file.name}</span> · {fmtBytes(state.file.size)}
        </p>
      )}
      {busy && (
        <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={state.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
          <div className="h-full bg-blue-600 transition-[width]" style={{ width: `${state.progress}%` }} />
        </div>
      )}
      {state.phase === 'done' && <p className="flex items-center gap-1 text-[12px] font-semibold text-green-700"><CheckCircle2 size={13} /> Uploaded. Save or publish the banner to use it.</p>}
      {state.phase === 'error' && <p className="flex items-center gap-1 text-[12px] font-semibold text-red-600"><AlertTriangle size={13} /> {state.message}</p>}

      <button type="button" onClick={() => setShowLink((v) => !v)} className="text-[12px] font-semibold text-blue-600 hover:underline">
        {showLink ? 'Hide link option' : 'Or use a public https:// image link'}
      </button>
      {showLink && (
        <Input value={/^https:\/\//i.test(value) && !preview?.includes('X-Amz-Signature') ? value : ''}
          onChange={(e) => onChange({ imageUrl: e.target.value, imagePreview: e.target.value })}
          placeholder="https://cdn.example.com/banner.webp" />
      )}
    </div>
  );
}

/* Image check: real size and ratio against the recommendation */

function useImageSize(src) {
  const [size, setSize] = useState(null);
  useEffect(() => {
    setSize(null);
    if (!src || !isLoadableImage(src)) return undefined;
    let live = true;
    const img = new Image();
    img.onload = () => live && setSize({ w: img.naturalWidth, h: img.naturalHeight, ok: true });
    img.onerror = () => live && setSize({ ok: false });
    img.src = src;
    return () => { live = false; };
  }, [src]);
  return size;
}

const KIND_RATIO = { hero: [3.2, 2], campaign: [3, 2], offer: [4 / 3] };

function ImageCheck({ src, kind }) {
  const size = useImageSize(src);
  if (!src) return <p className="text-[11px] text-slate-400">No image: the banner uses the background colour.</p>;
  if (!isLoadableImage(src)) return <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertTriangle size={12} /> Use a public https:// image link.</p>;
  if (!size) return <p className="text-[11px] text-slate-400">Checking image…</p>;
  if (!size.ok) return <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><ImageOff size={12} /> The image could not be loaded from that link.</p>;
  const ratio = size.w / size.h;
  const close = KIND_RATIO[kind].some((r) => Math.abs(ratio - r) / r < 0.15);
  return (
    <p className={`flex items-center gap-1 text-[11px] font-semibold ${close ? 'text-green-700' : 'text-amber-700'}`}>
      {close ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
      {size.w} × {size.h} px ({ratio.toFixed(2)}:1){close ? ' fits this placement' : ' will be cropped more than recommended'}
    </p>
  );
}

function SpecsTable({ kind }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-100">
      <table className="w-full text-left text-[12px]">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
          <tr><th className="px-3 py-2 font-semibold">Placement</th><th className="px-3 py-2 font-semibold">Recommended</th><th className="px-3 py-2 font-semibold">Ratio</th></tr>
        </thead>
        <tbody>
          {IMAGE_SPECS.map((s) => (
            <tr key={s.placement} className={`border-t border-slate-100 ${s.kind === kind ? 'bg-blue-50/60 font-semibold text-slate-800' : 'text-slate-500'}`}>
              <td className="px-3 py-1.5">{s.placement}</td><td className="px-3 py-1.5 tabular-nums">{s.size}</td><td className="px-3 py-1.5 tabular-nums">{s.ratio}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
        JPG, PNG or WebP, up to 5 MB (under 500 KB loads fastest). One image serves every screen and is cropped to fill it, centred, so keep text and faces in the middle third. Separate desktop and phone images are not supported by the banner service yet.
      </p>
    </div>
  );
}

/* Previews */

/**
 * Renders children at the homepage's real desktop width (the 1152 px content
 * column) and scales them to fit, so the crop and type size are what customers
 * actually see — not a squeezed banner at the card's width.
 */
const DESKTOP = { hero: { w: 1152, h: 340 }, campaign: { w: 1152, h: 220 }, offer: { w: 380, h: 150 } };

function ScaledDesktop({ kind, children }) {
  const [box, setBox] = useState(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!box) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);
  const { w, h } = DESKTOP[kind];
  const scale = width ? Math.min(1, width / w) : 0;
  return (
    <div ref={setBox} style={{ height: scale ? h * scale : h }} className="relative w-full overflow-hidden">
      {scale > 0 && (
        <div style={{ width: w, transform: `scale(${scale})`, transformOrigin: 'top left' }} className="absolute left-0 top-0">
          {children}
        </div>
      )}
    </div>
  );
}

function DevicePreviews({ form }) {
  const [safe, setSafe] = useState(false);
  const ad = previewAd(form);
  const variant = form.kind;
  const overlay = safe && variant !== 'offer' && (
    <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/3 w-1/3 border-x-2 border-dashed border-white/80 bg-white/10" />
  );
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><Eye size={13} /> Live preview</p>
        {variant !== 'offer' && (
          <label className="flex items-center gap-1.5 text-[12px] text-slate-500">
            <input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} /> Show safe zone
          </label>
        )}
      </div>
      <div>
        <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-slate-400"><Monitor size={12} /> Desktop (shown at true proportions)</p>
        <div className="rounded-xl bg-slate-100 p-3">
          <ScaledDesktop kind={variant}>
            <div className="relative">
              <PromoBanner ad={ad} variant={variant} device="desktop" />
              {overlay}
            </div>
          </ScaledDesktop>
        </div>
      </div>
      <div>
        <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-slate-400"><Smartphone size={12} /> Phone (360 px wide)</p>
        <div className="rounded-xl bg-slate-100 p-3">
          <div className="relative mx-auto w-[336px] max-w-full">
            <PromoBanner ad={ad} variant={variant} device="mobile" className={variant === 'offer' ? 'w-[270px]' : ''} />
            {overlay}
          </div>
        </div>
      </div>
    </div>
  );
}

function LinkPreview({ link, check }) {
  if (!link || !check.ok) return null;
  const href = check.kind === 'internal' ? `${PORTAL_URLS.customer}${link}` : link;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:underline">
      Open destination <ExternalLink size={12} />
    </a>
  );
}

/* Editor */

function BannerEditor({ initial, ad, onCancel, onSave, saving }) {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const { data: catalog } = useLiveCatalogQuery();
  const servicePaths = useMemo(() => (catalog?.domains || []).flatMap((d) => d.services)
    .filter((s) => s.path).map((s) => ({ path: s.path, label: s.name })), [catalog]);
  const routeOptions = useMemo(() => {
    const seen = new Set();
    return [...BANNER_ROUTES, ...servicePaths].filter((r) => (seen.has(r.path) ? false : seen.add(r.path)));
  }, [servicePaths]);
  const check = checkBannerLink(f.ctaEnabled ? f.ctaLink : '', servicePaths.map((s) => s.path));
  const choice = routeOptions.some((r) => r.path === f.ctaLink) ? f.ctaLink : '__custom';
  const paid = ad && !isHouseBanner(ad);

  const problems = [
    !f.title.trim() && 'Give the banner an internal name.',
    !f.headline.trim() && 'Add a headline.',
    f.ctaEnabled && !f.ctaText.trim() && 'Add the button text.',
    f.ctaEnabled && !f.ctaLink.trim() && 'Choose where the button goes.',
    !check.ok && check.message,
    !validImageRef(f.imageUrl.trim()) && 'Upload the image, or use a public https:// link.',
    new Date(f.endAt) <= new Date(f.startAt) && 'The end date must be after the start date.',
  ].filter(Boolean);

  function body() {
    const content = {
      headline: f.headline.trim(), body: f.body.trim(), badgeText: f.badgeText.trim(), imageUrl: f.imageUrl.trim(),
      videoUrl: f.videoUrl || '',
      // The ads API requires button text; an empty link is what makes a banner untappable.
      ctaText: (f.ctaEnabled && f.ctaText.trim()) || 'Learn more',
      ctaLink: f.ctaEnabled ? f.ctaLink.trim() : '',
      backgroundColor: f.backgroundColor, textColor: f.textColor,
    };
    const schedule = { startAt: new Date(f.startAt).toISOString(), endAt: new Date(f.endAt).toISOString(), impressionsLimit: ad?.schedule?.impressionsLimit || 0 };
    const priority = Math.max(0, Number(f.priority) || 0);
    if (ad) {
      // House banners send their own billing back with only `rate` changed (the
      // API strips dotted keys); a paid campaign's billing is never sent.
      return {
        title: f.title.trim(), type: BANNER_KINDS[f.kind].type, content, schedule,
        ...(paid ? {} : { billing: { ...(ad.billing || {}), model: 'fixed', rate: priority } }),
      };
    }
    return {
      title: f.title.trim(), type: BANNER_KINDS[f.kind].type, placements: [HOME_PLACEMENT], audience: 'users',
      content, schedule, billing: { model: 'fixed', rate: priority, budget: 0, dailyCapPaise: 0 },
    };
  }

  function submit(status) {
    if (problems.length) { toast.error(problems[0]); return; }
    // A paid campaign's status belongs to Ad campaigns (approval, budget); keep it as it is.
    onSave({ id: ad?._id, body: body(), status: paid ? ad.status : status });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{ad ? 'Edit banner' : 'New banner'}</h2>
          <p className="text-sm text-slate-500">{BANNER_KINDS[f.kind].hint}</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close editor"><X size={18} /></button>
      </div>

      {paid && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-800">
          <Info size={16} className="mt-0.5 shrink-0" />
          This is a paid campaign. Its content can be edited here; its bid, budget and approval stay in Ad campaigns.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-5">
          <Card className="space-y-4 p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Content</p>
            <FormRow label="Banner type">
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(BANNER_KINDS).map(([k, def]) => (
                  <button key={k} type="button" onClick={() => setF((x) => ({ ...x, kind: k }))}
                    className={`rounded-lg border px-3 py-2 text-left text-[12px] transition ${f.kind === k ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                    <span className="block font-semibold">{def.label}</span>
                    <span className="block text-[11px] opacity-75">{def.section}</span>
                  </button>
                ))}
              </div>
            </FormRow>
            <FormRow label="Internal name" hint="Only admins see this.">
              <Input value={f.title} onChange={set('title')} placeholder="e.g. Monsoon bike check — July" maxLength={120} />
            </FormRow>
            <FormRow label="Headline">
              <Input value={f.headline} onChange={set('headline')} placeholder="e.g. Bike trouble, sorted" maxLength={70} />
            </FormRow>
            <FormRow label="Supporting text" hint="One or two short lines.">
              <textarea value={f.body} onChange={set('body')} rows={2} maxLength={160}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500" />
            </FormRow>
            <FormRow label="Badge" hint="Optional, e.g. New or Limited time. Only make claims that are true.">
              <Input value={f.badgeText} onChange={set('badgeText')} maxLength={24} />
            </FormRow>
          </Card>

          <Card className="space-y-4 p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Button & destination</p>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={f.ctaEnabled} onChange={set('ctaEnabled')} /> Show a button and make the banner tappable
            </label>
            {f.ctaEnabled && (
              <>
                <FormRow label="Button text"><Input value={f.ctaText} onChange={set('ctaText')} maxLength={24} /></FormRow>
                <FormRow label="Destination">
                  <Select value={choice} onChange={(e) => setF((x) => ({ ...x, ctaLink: e.target.value === '__custom' ? '' : e.target.value }))}>
                    {routeOptions.map((r) => <option key={r.path} value={r.path}>{r.label} — {r.path}</option>)}
                    <option value="__custom">Custom path or https:// link…</option>
                  </Select>
                </FormRow>
                {choice === '__custom' && (
                  <FormRow label="Custom destination" hint="An app page such as /shops/<id>, or a full https:// link.">
                    <Input value={f.ctaLink} onChange={set('ctaLink')} placeholder="/promos or https://…" />
                  </FormRow>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={`text-[12px] font-semibold ${check.ok ? 'text-green-700' : 'text-red-600'}`}>{check.message}</p>
                  <LinkPreview link={f.ctaLink} check={check} />
                </div>
              </>
            )}
          </Card>

          <Card className="space-y-4 p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Image & colours</p>
            <FormRow label="Banner image" hint="One image serves desktop and phone; it is cropped to fill each, centred.">
              <ImageUploader value={f.imageUrl} preview={f.imagePreview}
                onChange={({ imageUrl, imagePreview }) => setF((x) => ({ ...x, imageUrl, imagePreview }))} />
            </FormRow>
            <ImageCheck src={f.imagePreview} kind={f.kind} />
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Background">
                <div className="flex items-center gap-2">
                  <input type="color" value={f.backgroundColor} onChange={set('backgroundColor')} className="h-9 w-10 cursor-pointer rounded border border-slate-200" aria-label="Background colour" />
                  <Input value={f.backgroundColor} onChange={set('backgroundColor')} maxLength={7} />
                </div>
              </FormRow>
              <FormRow label="Text">
                <div className="flex items-center gap-2">
                  <input type="color" value={f.textColor} onChange={set('textColor')} className="h-9 w-10 cursor-pointer rounded border border-slate-200" aria-label="Text colour" />
                  <Input value={f.textColor} onChange={set('textColor')} maxLength={7} />
                </div>
              </FormRow>
            </div>
            <SpecsTable kind={f.kind} />
          </Card>

          <Card className="space-y-4 p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Schedule & order</p>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Starts"><Input type="datetime-local" value={f.startAt} onChange={set('startAt')} /></FormRow>
              <FormRow label="Ends"><Input type="datetime-local" value={f.endAt} onChange={set('endAt')} /></FormRow>
            </div>
            <FormRow label="Priority" hint={paid ? 'Set by the campaign’s bid in Ad campaigns.' : 'Higher shows first within its section. Ties: newest first.'}>
              <Input type="number" min={0} max={1000} value={f.priority} onChange={set('priority')} disabled={paid} />
            </FormRow>
            <p className="text-[12px] text-slate-500">Shown on the website and in the app alike: the banner service has no per-platform setting.</p>
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card className="p-5"><DevicePreviews form={f} /></Card>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            {paid ? (
              <button type="button" disabled={saving} onClick={() => submit(ad.status)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            ) : (
              <>
                <button type="button" disabled={saving} onClick={() => submit('draft')}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {ad?.status === 'active' ? 'Unpublish & save as draft' : 'Save as draft'}
                </button>
                <button type="button" disabled={saving} onClick={() => submit('active')}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving…' : ad?.status === 'active' ? 'Update live banner' : 'Publish'}
                </button>
              </>
            )}
          </div>
          {problems.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
              {problems.map((p) => <li key={p} className="flex gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{p}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* List */

function Row({ ad, index, count, onEdit, onToggle, onMove, onDelete, busy }) {
  const c = ad.content || {};
  const house = isHouseBanner(ad);
  const state = liveState(ad);
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="h-[72px] w-full shrink-0 overflow-hidden rounded-lg sm:w-[200px]" style={{ background: c.backgroundColor || '#1F4FD8' }}>
        {c.imageUrl
          ? <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
          : <p className="line-clamp-2 p-3 text-[12px] font-bold" style={{ color: c.textColor || '#fff' }}>{c.headline}</p>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-bold text-slate-900">{ad.title}</p>
          <StateBadge ad={ad} />
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{BANNER_KINDS[KIND_BY_TYPE[ad.type]]?.label}</span>
          {!house && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700">Paid campaign</span>}
        </div>
        <p className="mt-0.5 truncate text-[13px] text-slate-600">{c.headline}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
          <span>{ad.schedule?.startAt ? fmtDate(ad.schedule.startAt) : '—'} → {ad.schedule?.endAt ? fmtDate(ad.schedule.endAt) : '—'}</span>
          <span className="flex items-center gap-1"><Eye size={11} /> {ad.stats?.impressions || 0}</span>
          <span className="flex items-center gap-1"><MousePointerClick size={11} /> {ad.stats?.clicks || 0}</span>
          <span>{c.ctaLink ? `→ ${c.ctaLink}` : 'No link'}</span>
          <span>{house ? `Priority ${ad.billing?.rate || 0}` : 'Order set by bid'}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {house && (
          <>
            <button type="button" disabled={busy || index === 0} onClick={() => onMove(-1)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" aria-label="Move up"><ArrowUp size={15} /></button>
            <button type="button" disabled={busy || index === count - 1} onClick={() => onMove(1)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" aria-label="Move down"><ArrowDown size={15} /></button>
          </>
        )}
        <button type="button" onClick={onEdit} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Edit"><Pencil size={15} /></button>
        {house && (
          <button type="button" disabled={busy} onClick={onToggle} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
            aria-label={ad.status === 'active' ? 'Unpublish' : 'Publish'} title={ad.status === 'active' ? 'Unpublish' : 'Publish'}>
            {ad.status === 'active' ? <Pause size={15} /> : <Play size={15} />}
          </button>
        )}
        {house && (
          <button type="button" disabled={busy} onClick={onDelete} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" aria-label="Delete"><Trash2 size={15} /></button>
        )}
      </div>
      {state === 'ended' && <span className="sr-only">This banner’s schedule has ended.</span>}
    </div>
  );
}

export default function HomepageBanners() {
  const { banners, loading, error, reload, save, setStatus, setPriority, remove } = useHomepageBanners();
  const [editing, setEditing] = useState(null); // { ad?, initial }
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [kindFilter, setKindFilter] = useState('all');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const visible = banners.filter((b) => kindFilter === 'all' || KIND_BY_TYPE[b.type] === kindFilter);
  const liveCount = (kind) => banners.filter((b) => KIND_BY_TYPE[b.type] === kind && liveState(b) === 'live').length;

  async function handleSave(payload) {
    setSaving(true);
    try {
      await save(payload);
      toast.success(payload.status === 'active' ? 'Published to the homepage' : 'Saved as draft');
      setEditing(null);
    } catch (e) {
      toast.error(e?.data?.error || e?.data?.message || 'Could not save the banner');
    } finally { setSaving(false); }
  }

  async function run(id, fn, ok) {
    setBusyId(id);
    try { await fn(); if (ok) toast.success(ok); } catch (e) { toast.error(e?.data?.error || 'That did not work. Try again.'); } finally { setBusyId(null); }
  }

  // Swap priorities with the neighbour in the same section, so order is explicit.
  function move(ad, dir) {
    const same = banners.filter((b) => b.type === ad.type && isHouseBanner(b));
    const i = same.findIndex((b) => b._id === ad._id);
    const other = same[i + dir];
    if (!other) return;
    const a = ad.billing?.rate || 0; const b = other.billing?.rate || 0;
    const [na, nb] = a === b ? (dir < 0 ? [b + 1, b] : [b, b + 1]) : [b, a];
    run(ad._id, async () => { await setPriority(ad._id, na); await setPriority(other._id, nb); }, 'Order updated');
  }

  if (editing) {
    return <BannerEditor initial={editing.initial} ad={editing.ad} saving={saving} onCancel={() => setEditing(null)} onSave={handleSave} />;
  }

  return (
    <div>
      <SectionHeader title="Banner manager" subtitle="Hero, campaign and offer banners on the customer homepage. Changes appear immediately; scheduled banners go live on their start date.">
        <button type="button" onClick={() => setEditing({ initial: emptyForm(kindFilter === 'all' ? 'hero' : kindFilter) })}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          <Plus size={15} /> Create banner
        </button>
      </SectionHeader>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {Object.entries(BANNER_KINDS).map(([k, def]) => (
          <Card key={k} className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{def.section}</p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">{liveCount(k)}<span className="ml-1 text-sm font-semibold text-slate-400">live</span></p>
            <p className="mt-0.5 text-[11px] text-slate-400">{k === 'hero' && liveCount(k) === 0 ? 'Home shows the service catalogue slides instead.' : def.hint}</p>
          </Card>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {[['all', 'All'], ...Object.entries(BANNER_KINDS).map(([k, d]) => [k, d.section])].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setKindFilter(k)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${kindFilter === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <PageLoader /> : error ? (
        <Card className="flex items-center justify-between p-5 text-sm text-red-600">{error}<button type="button" onClick={reload} className="font-semibold underline">Retry</button></Card>
      ) : visible.length === 0 ? (
        <EmptyState icon={Monitor} message="No banners here yet. Create one to feature it on the homepage." />
      ) : (
        <Card className="divide-y divide-slate-100">
          {visible.map((ad) => {
            // Order is per section, so the arrows are bounded by the section, not this list.
            const same = banners.filter((b) => b.type === ad.type && isHouseBanner(b));
            return (
            <Row key={ad._id} ad={ad} index={same.findIndex((b) => b._id === ad._id)} count={same.length} busy={busyId === ad._id}
              onEdit={() => setEditing({ ad, initial: formFromAd(ad) })}
              onToggle={() => run(ad._id, () => setStatus(ad._id, ad.status === 'active' ? 'paused' : 'active'), ad.status === 'active' ? 'Unpublished' : 'Published')}
              onMove={(dir) => move(ad, dir)}
              onDelete={() => setConfirmDelete(ad)} />
            );
          })}
        </Card>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="del-title">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <p id="del-title" className="font-bold text-slate-900">Delete “{confirmDelete.title}”?</p>
            <p className="mt-1 text-sm text-slate-500">It is removed from the homepage now and cannot be restored. Unpublish instead if you may need it again.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Keep it</button>
              <button type="button" onClick={() => { const ad = confirmDelete; setConfirmDelete(null); run(ad._id, () => remove(ad._id), 'Banner deleted'); }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
