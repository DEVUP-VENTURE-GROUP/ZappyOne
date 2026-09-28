import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Camera, ImageIcon, ScanLine, Loader2, ChevronRight, Sparkles,
  Smartphone, Laptop, Car, Bike, Wrench, Tv, Heart, PartyPopper, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useLensUploadUrlMutation, useAnalyzeLensMutation } from '@shared/services/api';
import { downscaleImage } from '../../utils/downscaleImage';
import { formatPaise, formatPaiseRange } from '@shared/utils/money';

const CATEGORY_ICON = {
  mobile: Smartphone, vehicle: Car, home: Wrench, helper: Heart,
  beauty: Heart, construction: Wrench, other: Sparkles,
};
function matchIcon(m) {
  const c = (m.serviceCode || '') + ' ' + (m.category || '');
  if (/laptop/.test(c)) return Laptop;
  if (/bike/.test(c)) return Bike;
  if (/tv|cctv|router/.test(c)) return Tv;
  if (/event|party|decor/.test(c)) return PartyPopper;
  if (/screen|phone|battery|charging|camera|mobile/.test(c)) return Smartphone;
  return CATEGORY_ICON[m.category] || Wrench;
}

const SEVERITY = {
  high:     { label: 'High',     cls: 'bg-rose-50 text-rose-600' },
  moderate: { label: 'Moderate', cls: 'bg-amber-50 text-amber-600' },
  low:      { label: 'Minor',    cls: 'bg-emerald-50 text-emerald-600' },
  unknown:  { label: '',         cls: '' },
};

export default function LensModal({ open, onClose }) {
  const nav = useNavigate();
  const [stage, setStage] = useState('capture'); // capture | analyzing | result | error
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [errMsg, setErrMsg] = useState('');
  const coordsRef = useRef(null);
  const fileRef = useRef(null);

  const [lensUploadUrl] = useLensUploadUrlMutation();
  const [analyzeLens]   = useAnalyzeLensMutation();

  // Grab a coarse location once (best-effort) so the quote is real, not a hint.
  useEffect(() => {
    if (!open || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => { coordsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
      () => { /* denied — fall back to price hints */ },
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 300000 }
    );
  }, [open]);

  // Reset when closed.
  useEffect(() => {
    if (!open) {
      setStage('capture'); setPreview(null); setResult(null); setErrMsg('');
    }
  }, [open]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    try {
      setStage('analyzing');
      const blob = await downscaleImage(file, 1024, 0.85);
      setPreview(URL.createObjectURL(blob));

      // 1. presigned PUT → S3
      const { uploadUrl, key } = await lensUploadUrl({ contentType: 'image/jpeg' }).unwrap();
      const put = await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
      if (!put.ok) throw new Error('Upload failed');

      // 2. analyze
      const body = { imageKeys: [key] };
      if (coordsRef.current) { body.lat = coordsRef.current.lat; body.lng = coordsRef.current.lng; }
      const res = await analyzeLens(body).unwrap();
      setResult(res);
      setStage('result');
    } catch (err) {
      setErrMsg(err?.data?.error || err?.message || 'Scan failed. Please try again.');
      setStage('error');
    }
  }, [lensUploadUrl, analyzeLens]);

  const book = (m) => {
    onClose?.();
    nav(`/book/${m.serviceCode}?lens=${result.scanId}`);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
                <ScanLine size={18} className="text-white" />
              </div>
              <div>
                <h2 className="font-black text-slate-900 leading-none">ZappyLens</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Point. Scan. Book.</p>
              </div>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
              <X size={18} className="text-slate-600" />
            </button>
          </div>

          <div className="px-5 pb-6 max-h-[75vh] overflow-y-auto">
            {/* CAPTURE */}
            {stage === 'capture' && (
              <div className="space-y-3">
                <p className="text-sm text-slate-500 mb-1">Take a photo of the problem — a cracked screen, flat tyre, leaking pipe — and we'll find the right service instantly.</p>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])} />
                <button onClick={() => fileRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold py-4 rounded-2xl active:scale-[0.98] transition-transform">
                  <Camera size={20} /> Open camera
                </button>
                <button onClick={() => { fileRef.current?.removeAttribute('capture'); fileRef.current?.click(); setTimeout(() => fileRef.current?.setAttribute('capture','environment'),300); }}
                  className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-700 font-semibold py-3.5 rounded-2xl">
                  <ImageIcon size={18} /> Upload from gallery
                </button>
              </div>
            )}

            {/* ANALYZING */}
            {stage === 'analyzing' && (
              <div className="flex flex-col items-center py-8">
                {preview && (
                  <div className="relative w-40 h-40 rounded-2xl overflow-hidden mb-5">
                    <img src={preview} alt="scan" className="w-full h-full object-cover" />
                    <motion.div className="absolute left-0 right-0 h-0.5 bg-indigo-400 shadow-[0_0_12px_2px_rgba(99,102,241,0.8)]"
                      animate={{ top: ['0%', '100%', '0%'] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} />
                  </div>
                )}
                <div className="flex items-center gap-2 text-slate-600 font-semibold">
                  <Loader2 size={18} className="animate-spin text-indigo-600" /> Analyzing…
                </div>
                <p className="text-xs text-slate-400 mt-1">Identifying the service you need</p>
              </div>
            )}

            {/* RESULT — always actionable, never a dead-end */}
            {stage === 'result' && result && (() => {
              const list = result.isServiceable ? result.matches : (result.fallbacks || []);
              const showBest = result.isServiceable;
              return (
                <div className="space-y-3">
                  {result.isServiceable && result.detectedObject && (
                    <p className="text-sm text-slate-500">
                      Detected: <span className="font-semibold text-slate-800">{result.detectedObject}</span>
                    </p>
                  )}

                  {/* Friendly guidance for blurry/dark/unmatched/failed scans */}
                  {result.hint && (
                    <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
                      <Sparkles size={15} className="text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs font-medium text-amber-900">{result.hint}</p>
                    </div>
                  )}

                  {!result.isServiceable && (
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400 pt-1">Popular services</p>
                  )}

                  {list.map((m, i) => {
                    const Icon = matchIcon(m);
                    const sev = SEVERITY[m.severity] || SEVERITY.unknown;
                    // Everything arrives in paise; rupees exist only here, on screen.
                    const price = m.quote?.total != null
                      ? formatPaise(m.quote.total)
                      : formatPaiseRange(m.priceHintMin, m.priceHintMax);
                    const best = showBest && i === 0;
                    return (
                      <button key={m.serviceCode} onClick={() => book(m)}
                        className={`w-full text-left rounded-2xl border p-4 flex items-start gap-3 active:scale-[0.99] transition-transform ${best ? 'border-indigo-300 bg-indigo-50/40 ring-1 ring-indigo-100' : 'border-slate-200'}`}>
                        <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0">
                          <Icon size={20} className="text-indigo-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 capitalize">{m.name || m.serviceCode.replace(/_/g, ' ')}</span>
                            {best && <span className="text-[10px] font-black text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded">BEST MATCH</span>}
                          </div>
                          {m.issueSummary && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{m.issueSummary}</p>}
                          <div className="flex items-center gap-2 mt-2">
                            {sev.label && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sev.cls}`}>{sev.label}</span>}
                            {price && <span className="text-sm font-black text-slate-900">{price}</span>}
                            {m.quote?.etaMinutes != null && <span className="text-[11px] text-slate-400">· ~{m.quote.etaMinutes} min</span>}
                          </div>
                        </div>
                        <ChevronRight size={18} className="text-slate-300 mt-3 shrink-0" />
                      </button>
                    );
                  })}

                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={() => { setStage('capture'); setPreview(null); setResult(null); }}
                      className="flex-1 text-sm font-semibold text-slate-600 bg-slate-100 py-2.5 rounded-xl">Scan again</button>
                    <button onClick={() => { onClose?.(); nav('/services'); }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-bold text-indigo-600 bg-indigo-50 py-2.5 rounded-xl">
                      <Search size={15} /> Browse all
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* ERROR */}
            {stage === 'error' && (
              <div className="py-8 text-center">
                <p className="font-bold text-slate-900">Scan failed</p>
                <p className="text-sm text-slate-500 mt-1">{errMsg}</p>
                <button onClick={() => { setStage('capture'); setErrMsg(''); }}
                  className="mt-4 bg-indigo-600 text-white font-bold px-6 py-2.5 rounded-xl">Try again</button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
