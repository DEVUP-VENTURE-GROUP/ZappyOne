import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, ImageIcon, ScanLine, Loader2, ChevronRight, Info } from 'lucide-react';
import { useLensUploadUrlMutation, useAnalyzeLensMutation } from '@shared/services/api';
import { downscaleImage } from '../../utils/downscaleImage';

const SEVERITY = {
  high:     { label: 'High',     cls: 'bg-rose-50 text-rose-600' },
  moderate: { label: 'Moderate', cls: 'bg-amber-50 text-amber-600' },
  low:      { label: 'Minor',    cls: 'bg-emerald-50 text-emerald-600' },
  unknown:  { label: '',         cls: '' },
};

/**
 * Photo → the right service. The match comes from what's live where the
 * customer is, and opens its booking flow with the problem already chosen.
 * No price here: the flow quotes the exact job.
 */
export default function LensModal({ open, onClose, lat, lng }) {
  const nav = useNavigate();
  const [stage, setStage] = useState('capture'); // capture | analyzing | result | error
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [errMsg, setErrMsg] = useState('');
  const coordsRef = useRef(null);
  const fileRef = useRef(null);

  const [lensUploadUrl] = useLensUploadUrlMutation();
  const [analyzeLens]   = useAnalyzeLensMutation();

  // Match against what's live at the customer's chosen location; GPS only if none was given.
  useEffect(() => {
    if (!open) return;
    if (lat != null && lng != null) { coordsRef.current = { lat, lng }; return; }
    navigator.geolocation?.getCurrentPosition(
      (pos) => { coordsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
      () => { /* denied: the server matches against everything live */ },
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 300000 },
    );
  }, [open, lat, lng]);

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
    nav(m.path);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] bg-slate-900/60 flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full sm:max-w-md bg-white rounded-t-sheet sm:rounded-card overflow-hidden shadow-2xl"
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-zappy-600 flex items-center justify-center">
                <ScanLine size={18} className="text-white" />
              </div>
              <div>
                <h2 className="font-bold text-navy leading-none">Find it with a photo</h2>
                <p className="text-[12px] text-slate-500 mt-1">ZappyLens</p>
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
                <p className="text-sm text-slate-600 mb-1">Take a photo of what's wrong, like a cracked screen or a damaged part, and we'll find the service for it.</p>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])} />
                <button onClick={() => fileRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 bg-zappy-600 text-white font-bold py-4 rounded-2xl active:scale-[0.98] transition-transform">
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
                    <motion.div className="absolute left-0 right-0 h-0.5 bg-zappy-400 shadow-[0_0_12px_2px_rgba(59,130,246,0.8)]"
                      animate={{ top: ['0%', '100%', '0%'] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} />
                  </div>
                )}
                <div className="flex items-center gap-2 text-slate-600 font-semibold">
                  <Loader2 size={18} className="animate-spin text-zappy-600" /> Analyzing…
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
                      <Info size={15} className="text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs font-medium text-amber-900">{result.hint}</p>
                    </div>
                  )}

                  {!result.isServiceable && (
                    <p className="text-[13px] font-semibold text-slate-600 pt-1">Services available near you</p>
                  )}

                  {list.map((m, i) => {
                    const sev = SEVERITY[m.severity] || SEVERITY.unknown;
                    const best = showBest && i === 0;
                    return (
                      <button key={m.serviceCode} onClick={() => book(m)}
                        className={`w-full text-left rounded-xl border p-4 flex items-start gap-3 transition-colors hover:bg-slate-50 ${best ? 'border-zappy-400' : 'border-slate-200'}`}>
                        <div className="flex-1 min-w-0">
                          {best && <span className="mb-1 block text-[12px] font-semibold text-zappy-700">Best match</span>}
                          <span className="block font-semibold text-navy">{m.name}</span>
                          {m.category && <span className="block text-[13px] text-slate-500">{m.category}</span>}
                          {m.issueSummary && <p className="mt-1.5 text-[13px] leading-snug text-slate-600 line-clamp-2">{m.issueSummary}</p>}
                          {sev.label && <span className={`mt-2 inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md ${sev.cls}`}>{sev.label} severity</span>}
                        </div>
                        <ChevronRight size={18} className="text-slate-400 mt-1 shrink-0" />
                      </button>
                    );
                  })}

                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={() => { setStage('capture'); setPreview(null); setResult(null); }}
                      className="flex-1 text-sm font-semibold text-slate-600 bg-slate-100 py-2.5 rounded-xl">Scan again</button>
                    <button onClick={() => { onClose?.(); nav('/services'); }}
                      className="flex-1 text-sm font-semibold text-zappy-700 bg-zappy-50 py-2.5 rounded-xl">
                      All services
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
                  className="mt-4 bg-zappy-600 text-white font-bold px-6 py-2.5 rounded-xl">Try again</button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
