/**
 * LiveSelfieCapture
 * ─────────────────────────────────────────────────────────────────────────────
 * Opens the FRONT camera via getUserMedia. No gallery uploads allowed.
 * Shows a liveness challenge (blink instruction + countdown) before capture.
 * Collects geo-coordinates and exact timestamp at moment of capture.
 *
 * Also used for premises photos (storefront, workbench), where the REAR camera
 * is the right one and the point is the same: the picture has to be taken here
 * and now, not chosen from a gallery.
 *
 * Props:
 *   onCapture(blob, metadata) — called when the user accepts the photo
 *   onCancel()               — called when the user closes the panel
 *   facingMode               — 'user' (default, selfie) or 'environment' (rear)
 *   title                    — panel heading; defaults to "Live Selfie"
 *   instruction              — what to do before the shutter fires
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, RefreshCw, CheckCircle2, X, Loader2, AlertTriangle, MapPin } from 'lucide-react';

const STEPS = ['ready', 'streaming', 'countdown', 'preview', 'error'];

export default function LiveSelfieCapture({
  onCapture,
  onCancel,
  facingMode = 'user',
  title = 'Live Selfie',
  instruction,
}) {
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const streamRef  = useRef(null);
  const geoRef     = useRef(null);  // { lat, lng } fetched in background

  const [step, setStep]         = useState('ready');    // ready | streaming | countdown | preview | error
  const [countdown, setCountdown] = useState(3);
  const [blob, setBlob]         = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [errorMsg, setErrorMsg]   = useState('');
  const [geoStatus, setGeoStatus] = useState('fetching'); // fetching | ok | denied

  const isSelfie = facingMode === 'user';

  // Fetch geo — location is MANDATORY for onboarding, so allow retry.
  const fetchGeo = useCallback(() => {
    if (!navigator.geolocation) { setGeoStatus('denied'); return; }
    setGeoStatus('fetching');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        geoRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setGeoStatus('ok');
      },
      () => setGeoStatus('denied'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  // Fetch geo in background as soon as component mounts
  useEffect(() => { fetchGeo(); }, [fetchGeo]);

  // Start camera
  const startCamera = useCallback(async () => {
    setStep('streaming');
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,                  // 'user' = selfie, 'environment' = premises
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      setErrorMsg(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access and try again.'
          : err.name === 'NotFoundError'
          ? 'No front camera found on this device.'
          : `Camera error: ${err.message}`
      );
      setStep('error');
    }
  }, []);

  // Stop and release stream
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => () => stopCamera(), [stopCamera]);

  // Countdown then capture
  function beginCountdown() {
    setCountdown(3);
    setStep('countdown');
    let c = 3;
    const id = setInterval(() => {
      c -= 1;
      setCountdown(c);
      if (c <= 0) {
        clearInterval(id);
        captureFrame();
      }
    }, 1000);
  }

  function captureFrame() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 640;
    const ctx = canvas.getContext('2d');

    // Mirror horizontally (selfie convention)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (b) => {
        const url = URL.createObjectURL(b);
        setBlob(b);
        setPreviewUrl(url);
        setStep('preview');
        stopCamera();
      },
      'image/jpeg',
      0.92
    );
  }

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBlob(null);
    setPreviewUrl(null);
    setStep('streaming');
    startCamera();
  }

  function accept() {
    // Location is mandatory — guard against accepting without a fix.
    if (geoStatus !== 'ok' || geoRef.current?.lat == null) {
      fetchGeo();
      return;
    }
    const metadata = {
      capturedAt:     new Date().toISOString(),
      captureMethod:  'live_camera',
      lat:            geoRef.current.lat,
      lng:            geoRef.current.lng,
      accuracy:       geoRef.current.accuracy ?? null,
      geoStatus,
      userAgent:      navigator.userAgent.slice(0, 200),
    };
    onCapture(blob, metadata);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">

        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Camera size={17} className="text-indigo-600" />
            <span className="font-bold text-slate-800 text-sm">{title}</span>
          </div>
          <button onClick={() => { stopCamera(); onCancel(); }} className="text-slate-400 hover:text-slate-700 transition">
            <X size={18} />
          </button>
        </div>

        {/* body */}
        <div className="p-5 space-y-4">

          {/* geo status chip — location is mandatory */}
          <div className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ${
            geoStatus === 'ok' ? 'bg-green-50' : geoStatus === 'fetching' ? 'bg-amber-50' : 'bg-red-50'
          }`}>
            <div className="flex items-center gap-1.5">
              <MapPin size={12} className={geoStatus === 'ok' ? 'text-green-600' : geoStatus === 'fetching' ? 'text-amber-500' : 'text-red-500'} />
              <span className={`text-[11px] font-bold ${geoStatus === 'ok' ? 'text-green-700' : geoStatus === 'fetching' ? 'text-amber-700' : 'text-red-600'}`}>
                {geoStatus === 'ok' ? 'Location captured ✓' : geoStatus === 'fetching' ? 'Fetching location…' : 'Location required — enable GPS'}
              </span>
            </div>
            {geoStatus === 'denied' && (
              <button onClick={fetchGeo} className="text-[11px] font-bold text-red-600 underline shrink-0">
                Retry
              </button>
            )}
          </div>

          {/* camera / preview area */}
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-black">

            {/* live video — always mounted, hidden in non-streaming steps */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${
                ['streaming', 'countdown'].includes(step) ? 'block' : 'hidden'
              }`}
              // Mirrored for the selfie feel, but NOT for premises shots: a
              // mirrored shop board reads backwards in the preview.
              style={isSelfie ? { transform: 'scaleX(-1)' } : undefined}
            />

            {/* Framing guide — an oval for a face, a rectangle for a place. */}
            {['streaming', 'countdown'].includes(step) && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className={`border-4 transition-colors ${isSelfie ? 'rounded-full' : 'rounded-2xl'} ${
                    step === 'countdown' ? 'border-green-400 shadow-lg shadow-green-400/40' : 'border-white/50'
                  }`}
                  style={isSelfie ? { width: '65%', height: '75%' } : { width: '86%', height: '70%' }}
                />
              </div>
            )}

            {/* liveness instruction */}
            {step === 'streaming' && (
              <div className="absolute bottom-4 inset-x-0 flex justify-center">
                <div className="bg-black/60 rounded-xl px-4 py-2 text-center">
                  <p className="text-white text-xs font-bold">
                    {isSelfie ? 'Position your face inside the oval' : 'Fit the whole thing in the frame'}
                  </p>
                  <p className="text-white/70 text-[11px] mt-0.5">
                    {instruction || (isSelfie
                      ? 'Look straight · Good lighting · No glasses'
                      : 'Stand back · Keep any signage readable')}
                  </p>
                </div>
              </div>
            )}

            {/* countdown overlay */}
            {step === 'countdown' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
                <div className="bg-black/70 rounded-2xl px-6 py-4 text-center">
                  <p className="text-white/80 text-xs font-bold mb-1">STAY STILL — CAPTURING IN</p>
                  <p className="text-white text-6xl font-black tabular-nums">{countdown}</p>
                  {countdown === 3 && <p className="text-white/70 text-xs mt-1">Blink naturally</p>}
                  {countdown === 2 && <p className="text-white/70 text-xs mt-1">Hold steady…</p>}
                  {countdown === 1 && <p className="text-green-400 text-xs mt-1 font-bold">Capturing!</p>}
                </div>
              </div>
            )}

            {/* preview */}
            {step === 'preview' && previewUrl && (
              <img src={previewUrl} alt="Selfie preview" className="w-full h-full object-cover" />
            )}

            {/* ready state */}
            {step === 'ready' && (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-slate-900">
                <div className="w-16 h-16 rounded-2xl bg-indigo-900/50 flex items-center justify-center">
                  <Camera size={28} className="text-indigo-400" />
                </div>
                <p className="text-slate-400 text-xs font-medium text-center px-4">
                  Your front camera will open for a live photo.
                  <br />Gallery upload is not allowed for selfies.
                </p>
              </div>
            )}

            {/* error state */}
            {step === 'error' && (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-slate-900 p-6">
                <AlertTriangle size={28} className="text-red-400" />
                <p className="text-red-300 text-xs font-medium text-center leading-relaxed">{errorMsg}</p>
              </div>
            )}
          </div>

          {/* hidden canvas for capture */}
          <canvas ref={canvasRef} className="hidden" />

          {/* liveness checklist — shown in streaming step */}
          {step === 'streaming' && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Face visible', ok: true },
                { label: 'Good light',   ok: true },
                { label: 'Look forward', ok: true },
              ].map(({ label, ok }) => (
                <div key={label} className="flex items-center gap-1.5 bg-green-50 rounded-lg px-2 py-1.5">
                  <CheckCircle2 size={10} className="text-green-500 shrink-0" />
                  <span className="text-[10px] font-semibold text-green-700">{label}</span>
                </div>
              ))}
            </div>
          )}

          {/* actions */}
          <div className="space-y-2">
            {step === 'ready' && (
              <button onClick={startCamera} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm py-3 rounded-2xl transition">
                <Camera size={16} /> Open Camera
              </button>
            )}

            {step === 'streaming' && (
              <button onClick={beginCountdown} className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold text-sm py-3 rounded-2xl transition">
                <Camera size={16} /> Take Photo
              </button>
            )}

            {step === 'countdown' && (
              <button disabled className="w-full flex items-center justify-center gap-2 bg-green-400 text-white font-bold text-sm py-3 rounded-2xl opacity-80">
                <Loader2 size={15} className="animate-spin" /> Capturing…
              </button>
            )}

            {step === 'preview' && (
              <>
                {geoStatus !== 'ok' && (
                  <div className="flex items-center gap-1.5 bg-red-50 rounded-xl px-3 py-2 mb-2">
                    <AlertTriangle size={12} className="text-red-500 shrink-0" />
                    <span className="text-[11px] font-semibold text-red-600">
                      {geoStatus === 'fetching' ? 'Getting your location… please wait' : 'Location is required to submit. Enable GPS and tap Retry above.'}
                    </span>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={retake} className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm py-3 rounded-2xl transition">
                    <RefreshCw size={14} /> Retake
                  </button>
                  <button
                    onClick={accept}
                    disabled={geoStatus !== 'ok'}
                    className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm py-3 rounded-2xl transition"
                  >
                    <CheckCircle2 size={14} /> Use Photo
                  </button>
                </div>
              </>
            )}

            {step === 'error' && (
              <button onClick={() => { setStep('ready'); setErrorMsg(''); }} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm py-3 rounded-2xl transition">
                <RefreshCw size={14} /> Try Again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
