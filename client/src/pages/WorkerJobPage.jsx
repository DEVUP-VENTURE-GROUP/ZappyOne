import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Navigation, MapPin, FileText, BadgeIndianRupee,
  KeyRound, Loader2, CheckCircle2, MessageCircle, Phone, Image as ImageIcon,
  Camera, X, CheckCircle, Zap, AlertCircle, Timer, TimerOff, Play, Pause,
  ClipboardCheck, ShieldCheck, Car, Wrench,
} from 'lucide-react';
import {
  useGetOrderQuery,
  useWorkerStartTripMutation, useWorkerArriveMutation,
  useWorkerStartServiceMutation, useWorkerCompleteMutation,
  usePresignUploadMutation,
  useGetConstructionTimerQuery,
  useStartConstructionTimerMutation,
  usePauseConstructionTimerMutation,
  useResumeConstructionTimerMutation,
  useStopConstructionTimerMutation,
  useGetPhoneHealthReportQuery,
  useSubmitPhoneHealthReportMutation,
  useGetVehicleHealthReportQuery,
  useSubmitVehicleHealthReportMutation,
  useWorkerReportNoResponseMutation,
  useWorkerReportPartUnavailableMutation,
  useBlockCustomerByWorkerMutation,
} from '../services/api';
import { useOrderSocket, useSocketStatus } from '../hooks/useSocket';
import { useGeolocation } from '../hooks/useGeolocation';
import { selectOrder } from '../modules/order/orderSlice';
import { selectAuth } from '../modules/auth/authSlice';
import { getSocket } from '../services/socket';
import { API_BASE } from '../services/apiBase';
import LiveTrackingMap from '../modules/tracking/LiveTrackingMap';
import SOSButton from '../components/worker/SOSButton';
import WorkerCancelSheet from '../components/worker/WorkerCancelSheet';
import ServiceChecklistPanel from '../components/worker/ServiceChecklistPanel';
import toast from 'react-hot-toast';

/* ── WorkerETACard — live countdown with penalty preview ───────────── */
function WorkerETACard({ deadlineAt, etaMins }) {
  const [secsLeft, setSecsLeft] = useState(() => Math.ceil((deadlineAt - Date.now()) / 1000));

  useEffect(() => {
    const tick = () => setSecsLeft(Math.ceil((deadlineAt - Date.now()) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [deadlineAt]);

  const GRACE_SECS  = 5 * 60; // 5-min grace — no penalty within this window
  const isInGrace   = secsLeft < 0 && Math.abs(secsLeft) <= GRACE_SECS;
  const isLate      = secsLeft < -GRACE_SECS;
  const lateSecs    = isLate ? Math.abs(secsLeft) - GRACE_SECS : 0;
  const lateMinutes = Math.ceil(lateSecs / 60);
  const penalty     = lateMinutes * 2; // ₹2/min — mirrors server default

  const minsLeft  = Math.floor(Math.max(0, secsLeft) / 60);
  const sLeft     = Math.max(0, secsLeft) % 60;
  const deadlineStr = deadlineAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  // Grace countdown: seconds remaining inside the 5-min grace window
  const graceSecsLeft = isInGrace ? GRACE_SECS - Math.abs(secsLeft) : 0;
  const graceMinsLeft = Math.floor(graceSecsLeft / 60);
  const graceSecRem   = graceSecsLeft % 60;

  return (
    <motion.div
      className="rounded-2xl overflow-hidden"
      style={isLate
        ? { background: 'linear-gradient(135deg,#1c0505,#7f1d1d)', border: '1.5px solid rgba(239,68,68,0.4)', boxShadow: '0 6px 24px rgba(239,68,68,0.3)' }
        : isInGrace
          ? { background: 'linear-gradient(135deg,#1c1200,#78350f)', border: '1.5px solid rgba(245,158,11,0.5)', boxShadow: '0 6px 24px rgba(245,158,11,0.25)' }
          : secsLeft < 120
            ? { background: 'linear-gradient(135deg,#1c0f00,#7c2d12)', border: '1.5px solid rgba(249,115,22,0.4)', boxShadow: '0 6px 24px rgba(249,115,22,0.25)' }
            : { background: 'linear-gradient(135deg,#0f172a,#1e293b)', border: '1px solid rgba(99,102,241,0.25)', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }
      }
      animate={isLate ? { borderColor: ['rgba(239,68,68,0.4)', 'rgba(239,68,68,0.9)', 'rgba(239,68,68,0.4)'] } : {}}
      transition={{ duration: 1, repeat: Infinity }}
    >
      {/* Top info row */}
      <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <motion.span
            className="text-lg"
            animate={isLate ? { scale: [1, 1.2, 1], rotate: [-5, 5, -5, 0] } : isInGrace ? { scale: [1, 1.15, 1] } : { x: [0, 4, 0] }}
            transition={{ duration: isLate ? 0.5 : isInGrace ? 0.8 : 1.5, repeat: Infinity }}
          >
            {isLate ? '⚠️' : isInGrace ? '⏳' : secsLeft < 120 ? '🔥' : '🛵'}
          </motion.span>
          <div>
            <p className={`text-[12px] font-black ${isLate ? 'text-red-300' : isInGrace ? 'text-amber-300' : secsLeft < 120 ? 'text-orange-300' : 'text-indigo-200'}`}>
              {isLate
                ? `Late by ${lateMinutes} min — penalty active`
                : isInGrace
                  ? '5-min grace period — no penalty yet'
                  : 'Arrive by deadline to avoid penalty'}
            </p>
            <p className="text-[10px] text-white/40 mt-0.5">
              Deadline: {deadlineStr} · ₹2/min after 5-min grace
            </p>
          </div>
        </div>

        {/* Penalty preview (only after grace ends) */}
        {isLate && (
          <motion.div
            className="shrink-0 px-3 py-1.5 rounded-xl bg-red-500/20 text-right"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          >
            <p className="text-[9px] font-bold text-red-400 uppercase tracking-wide">Deducting</p>
            <p className="text-base font-black text-red-300">-₹{penalty}</p>
          </motion.div>
        )}

        {/* Grace window badge */}
        {isInGrace && (
          <motion.div
            className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-500/20 text-right"
            animate={{ opacity: [1, 0.6, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <p className="text-[9px] font-bold text-amber-400 uppercase tracking-wide">Grace ends in</p>
            <p className="text-base font-black text-amber-300 tabular-nums">
              {String(graceMinsLeft).padStart(2,'0')}:{String(graceSecRem).padStart(2,'0')}
            </p>
          </motion.div>
        )}
      </div>

      {/* Big countdown */}
      <div className="px-4 pb-4 flex items-center gap-4">
        {isLate ? (
          <div className="flex-1">
            <p className="text-xs text-red-400 font-bold mb-1">Overdue by</p>
            <p className="text-3xl font-black text-red-300 tabular-nums">
              {String(Math.floor(lateSecs / 60)).padStart(2, '0')}:{String(lateSecs % 60).padStart(2, '0')}
            </p>
          </div>
        ) : isInGrace ? (
          <div className="flex-1">
            <p className="text-xs text-amber-400 font-bold mb-1">Grace period — hurry!</p>
            <p className="text-3xl font-black text-amber-200 tabular-nums">
              {String(graceMinsLeft).padStart(2,'0')}:{String(graceSecRem).padStart(2,'0')}
            </p>
          </div>
        ) : (
          <div className="flex-1">
            <p className={`text-xs font-bold mb-1 ${secsLeft < 120 ? 'text-orange-400' : 'text-indigo-400'}`}>Time remaining</p>
            <p className={`text-3xl font-black tabular-nums ${secsLeft < 120 ? 'text-orange-200' : 'text-white'}`}>
              {String(minsLeft).padStart(2, '0')}:{String(sLeft).padStart(2, '0')}
            </p>
          </div>
        )}

        {/* ETA info */}
        <div className="text-right shrink-0">
          <p className="text-[10px] text-white/30 font-semibold uppercase tracking-wide">ETA distance</p>
          <p className="text-sm font-bold text-white/60">{etaMins} min trip</p>
        </div>
      </div>

      {/* Progress bar — drains to zero during countdown, amber during grace */}
      {!isLate && (
        <div className="h-1 bg-white/10 mx-4 mb-3 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{
              background: isInGrace
                ? 'linear-gradient(90deg,#f59e0b,#fbbf24)'
                : secsLeft < 120
                  ? 'linear-gradient(90deg,#ef4444,#f97316)'
                  : 'linear-gradient(90deg,#4f46e5,#818cf8)',
              width: isInGrace
                ? `${(graceSecsLeft / GRACE_SECS) * 100}%`
                : `${Math.max(0, (secsLeft / (etaMins * 60)) * 100)}%`,
            }}
            transition={{ duration: 0.9 }}
          />
        </div>
      )}
    </motion.div>
  );
}

const STATUS_CONFIG = {
  assigned:    { label: 'Assigned',    color: 'bg-blue-500/15 text-blue-300 ring-blue-500/30',    dot: 'bg-blue-400'    },
  on_the_way:  { label: 'On the Way', color: 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/30', dot: 'bg-indigo-400' },
  arrived:     { label: 'Arrived',    color: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',   dot: 'bg-amber-400'  },
  in_progress: { label: 'In Progress',color: 'bg-green-500/15 text-green-300 ring-green-500/30',   dot: 'bg-green-400'  },
  completed:   { label: 'Completed',  color: 'bg-green-500/15 text-green-300 ring-green-500/30',   dot: 'bg-green-400'  },
  cancelled:   { label: 'Cancelled',  color: 'bg-red-500/15 text-red-300 ring-red-500/30',         dot: 'bg-red-400'    },
};

const ACTIVE_STATUSES = new Set(['assigned', 'on_the_way', 'arrived', 'in_progress']);

/* Maximum distance (metres) the worker must be within to tap "I've Arrived". */
const ARRIVED_GEOFENCE_M = 10;

function haversineMeters(a, b) {
  const R     = 6_371_000;
  const toRad = d => d * Math.PI / 180;
  const dLat  = toRad(b.lat - a.lat);
  const dLng  = toRad(b.lng - a.lng);
  const s     = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

const PHONE_SERVICES = new Set(['screen_replacement', 'battery_replacement', 'charging_issue', 'speaker_mic_issue', 'software_issue', 'water_damage_check']);
const VEHICLE_SERVICES = new Set(['puncture', 'battery_jump_start', 'fuel_delivery', 'bike_wash', 'car_wash', 'minor_roadside_repair']);
const CONSTRUCTION_SERVICES = new Set(['mason', 'plumbing', 'electrical', 'carpenter', 'painting']);

/* ── Construction Timer Panel ── */
function ConstructionTimerPanel({ orderId }) {
  const { data: timerData, refetch } = useGetConstructionTimerQuery(orderId, { pollingInterval: 15000 });
  const [startTimer,  { isLoading: starting }]  = useStartConstructionTimerMutation();
  const [pauseTimer,  { isLoading: pausing }]   = usePauseConstructionTimerMutation();
  const [resumeTimer, { isLoading: resuming }]  = useResumeConstructionTimerMutation();
  const [stopTimer,   { isLoading: stopping }]  = useStopConstructionTimerMutation();

  const timer = timerData?.timer;

  async function handleStart() {
    try { await startTimer({ orderId }).unwrap(); refetch(); toast.success('Timer started'); }
    catch (err) { toast.error(err.data?.error || 'Failed to start timer'); }
  }
  async function handlePause() {
    try { await pauseTimer({ orderId }).unwrap(); refetch(); }
    catch (err) { toast.error(err.data?.error || 'Failed'); }
  }
  async function handleResume() {
    try { await resumeTimer({ orderId }).unwrap(); refetch(); }
    catch (err) { toast.error(err.data?.error || 'Failed'); }
  }
  async function handleStop() {
    if (!window.confirm('Stop the billing timer? Customer will be charged for elapsed time.')) return;
    try { await stopTimer({ orderId }).unwrap(); refetch(); toast.success('Timer stopped'); }
    catch (err) { toast.error(err.data?.error || 'Failed'); }
  }

  const isRunning = timer?.status === 'running';
  const isPaused  = timer?.status === 'paused';
  const isStopped = timer?.status === 'stopped';

  return (
    <div className="card ring-1 ring-blue-100 bg-blue-50 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
          <Timer size={14} strokeWidth={2} className="text-blue-700" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-extrabold text-blue-900 uppercase tracking-wide">Hourly Job Timer</p>
          <p className="text-[10px] text-blue-500 font-medium">Customer sees live cost</p>
        </div>
        {timer && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            isRunning ? 'bg-green-100 text-green-700' :
            isPaused  ? 'bg-amber-100 text-amber-700' :
            isStopped ? 'bg-slate-100 text-slate-600' : ''
          }`}>
            {isRunning ? '● Running' : isPaused ? '⏸ Paused' : '■ Done'}
          </span>
        )}
      </div>

      {timer ? (
        <>
          <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3">
            <div>
              <p className="text-[10px] text-slate-400 font-medium">Elapsed</p>
              <p className="text-xl font-black text-slate-800">{timer.elapsedHoursLabel}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 font-medium">Running Cost</p>
              <p className="text-xl font-black text-green-700">₹{timer.runningCostRupees}</p>
            </div>
          </div>
          {!isStopped && (
            <div className="flex gap-2">
              {isRunning && (
                <button onClick={handlePause} disabled={pausing}
                  className="flex-1 py-2.5 rounded-xl bg-amber-100 text-amber-800 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
                  <Pause size={13} /> {pausing ? 'Pausing…' : 'Pause Break'}
                </button>
              )}
              {isPaused && (
                <button onClick={handleResume} disabled={resuming}
                  className="flex-1 py-2.5 rounded-xl bg-green-100 text-green-800 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
                  <Play size={13} /> {resuming ? 'Resuming…' : 'Resume'}
                </button>
              )}
              <button onClick={handleStop} disabled={stopping}
                className="flex-1 py-2.5 rounded-xl bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
                <TimerOff size={13} /> {stopping ? 'Stopping…' : 'Stop & Bill'}
              </button>
            </div>
          )}
          {isStopped && (
            <div className="bg-white rounded-xl px-4 py-3 text-center">
              <p className="text-xs text-slate-400">Final billable amount</p>
              <p className="text-2xl font-black text-green-700">₹{Math.round((timer.totalPaiseFinal || 0) / 100)}</p>
            </div>
          )}
        </>
      ) : (
        <button onClick={handleStart} disabled={starting}
          className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
          <Play size={15} /> {starting ? 'Starting…' : 'Start Billing Timer'}
        </button>
      )}
    </div>
  );
}

/* ── Vehicle Health Panel ── */
function VehicleHealthPanel({ orderId }) {
  const { data: existingReport } = useGetVehicleHealthReportQuery(orderId);
  const [submitReport, { isLoading }] = useSubmitVehicleHealthReportMutation();
  const [presign] = usePresignUploadMutation();
  const [submitted, setSubmitted] = useState(!!existingReport?.report);
  const [reportType, setReportType] = useState('pre_damage');
  const [photos, setPhotos] = useState([]); // [{area, photoUrl}]
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  if (submitted || existingReport?.report) {
    return (
      <div className="card bg-green-50 ring-1 ring-green-100 flex items-center gap-3">
        <ShieldCheck size={16} className="text-green-600" />
        <div>
          <p className="text-sm font-bold text-green-800">Vehicle report submitted</p>
          <p className="text-xs text-green-600">Pre-damage / health documented</p>
        </div>
      </div>
    );
  }

  async function capturePhoto(area) {
    if (!fileRef.current) return;
    fileRef.current.dataset.area = area;
    fileRef.current.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    const area = e.target.dataset.area || 'front';
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const { uploadUrl, key } = await presign({ folder: 'vehicle-health', contentType: file.type || 'image/jpeg' }).unwrap();
      await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'image/jpeg' } });
      setPhotos(prev => [...prev, { area, photoUrl: `s3:${key}` }]);
      toast.success(`${area} photo uploaded`);
    } catch {
      toast.error('Photo upload failed');
    } finally { setUploading(false); }
  }

  async function handleSubmit() {
    if (reportType === 'pre_damage' && photos.length === 0) {
      toast.error('Take at least 1 pre-damage photo'); return;
    }
    try {
      await submitReport({ orderId, reportType, preDamageDocs: photos }).unwrap();
      setSubmitted(true);
      toast.success('Vehicle report submitted');
    } catch (err) { toast.error(err.data?.error || 'Failed'); }
  }

  const AREAS = ['front', 'rear', 'left', 'right', 'top', 'interior'];

  return (
    <div className="card ring-1 ring-cyan-100 bg-cyan-50 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-cyan-100 flex items-center justify-center">
          <Car size={14} strokeWidth={2} className="text-cyan-700" />
        </div>
        <div>
          <p className="text-xs font-extrabold text-cyan-900 uppercase tracking-wide">Vehicle Health Report</p>
          <p className="text-[10px] text-cyan-500 font-medium">Document pre-damage before service</p>
        </div>
      </div>

      <div className="flex gap-2">
        {[{ v: 'pre_damage', l: 'Pre-damage' }, { v: 'tyre', l: 'Tyre' }, { v: 'battery', l: 'Battery' }].map(t => (
          <button key={t.v} onClick={() => setReportType(t.v)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${reportType === t.v ? 'bg-cyan-600 text-white' : 'bg-white text-cyan-700 ring-1 ring-cyan-200'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {reportType === 'pre_damage' && (
        <>
          <p className="text-[10px] text-cyan-600 font-medium">Tap an area to photograph it</p>
          <div className="grid grid-cols-3 gap-2">
            {AREAS.map(area => {
              const taken = photos.find(p => p.area === area);
              return (
                <button key={area} onClick={() => capturePhoto(area)}
                  className={`py-2 rounded-xl text-xs font-bold capitalize transition ${taken ? 'bg-green-100 text-green-700 ring-1 ring-green-200' : 'bg-white text-cyan-700 ring-1 ring-cyan-200'}`}>
                  {taken ? '✓ ' : ''}{area}
                </button>
              );
            })}
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
        </>
      )}

      {reportType === 'battery' && (
        <div className="bg-white rounded-xl p-3">
          <p className="text-xs text-slate-500 mb-1">Battery report will be submitted with order details from the server</p>
        </div>
      )}

      <button onClick={handleSubmit} disabled={isLoading || uploading}
        className="w-full py-2.5 rounded-xl bg-cyan-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
        {isLoading || uploading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
        {uploading ? 'Uploading…' : isLoading ? 'Submitting…' : 'Submit Vehicle Report'}
      </button>
    </div>
  );
}

/* ── Phone Health Certificate Panel ── */
function PhoneHealthPanel({ orderId }) {
  const { data: existing } = useGetPhoneHealthReportQuery(orderId);
  const [submit, { isLoading }] = useSubmitPhoneHealthReportMutation();
  const [submitted, setSubmitted] = useState(!!existing?.report);

  const COMPONENTS = [
    { key: 'screen', label: 'Screen & Touch' },
    { key: 'battery', label: 'Battery' },
    { key: 'camera', label: 'Camera' },
    { key: 'audio', label: 'Speaker / Mic' },
    { key: 'connectivity', label: 'WiFi / BT / SIM' },
    { key: 'charging', label: 'Charging Port' },
    { key: 'buttons', label: 'Buttons' },
  ];
  const [results, setResults] = useState(() =>
    Object.fromEntries(COMPONENTS.map(c => [c.key, 'pass']))
  );

  if (submitted || existing?.report) {
    const r = existing?.report;
    return (
      <div className="card bg-green-50 ring-1 ring-green-100">
        <div className="flex items-center gap-3">
          <ClipboardCheck size={18} className="text-green-600" />
          <div>
            <p className="text-sm font-bold text-green-800">Health Certificate Generated</p>
            {r && <p className="text-xs text-green-600">Score: {r.overallScore}% · Grade: {r.grade} · ID: {r.certificateId}</p>}
          </div>
        </div>
      </div>
    );
  }

  function setResult(key, value) {
    setResults(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    const components = Object.fromEntries(
      COMPONENTS.map(c => [c.key, { status: results[c.key] }])
    );
    try {
      await submit({ orderId, components, partsReplaced: [] }).unwrap();
      setSubmitted(true);
      toast.success('Health certificate generated!');
    } catch (err) { toast.error(err.data?.error || 'Failed'); }
  }

  return (
    <div className="card ring-1 ring-purple-100 bg-purple-50 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center">
          <Wrench size={14} strokeWidth={2} className="text-purple-700" />
        </div>
        <div>
          <p className="text-xs font-extrabold text-purple-900 uppercase tracking-wide">Post-Repair Health Check</p>
          <p className="text-[10px] text-purple-500 font-medium">Test each component — generates warranty certificate</p>
        </div>
      </div>

      <div className="space-y-2">
        {COMPONENTS.map(comp => (
          <div key={comp.key} className="flex items-center justify-between bg-white rounded-xl px-3 py-2">
            <span className="text-xs font-semibold text-slate-700">{comp.label}</span>
            <div className="flex gap-1.5">
              {['pass', 'fail', 'not_tested'].map(v => (
                <button key={v} onClick={() => setResult(comp.key, v)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-lg capitalize transition ${
                    results[comp.key] === v
                      ? v === 'pass' ? 'bg-green-500 text-white'
                        : v === 'fail' ? 'bg-red-500 text-white'
                        : 'bg-slate-400 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                  {v === 'not_tested' ? 'skip' : v}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button onClick={handleSubmit} disabled={isLoading}
        className="w-full py-2.5 rounded-xl bg-purple-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
        {isLoading ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />}
        {isLoading ? 'Generating…' : 'Generate Health Certificate'}
      </button>
    </div>
  );
}

export default function WorkerJobPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [cancelOpen, setCancelOpen] = useState(false);
  const { accessToken: token, profile } = useSelector(selectAuth);
  const { data, isLoading, isError, error, refetch } = useGetOrderQuery(id, { skip: !token || !id });
  const [startTrip,    { isLoading: starting }]        = useWorkerStartTripMutation();
  const [arrive,       { isLoading: arriving }]         = useWorkerArriveMutation();
  const [startService, { isLoading: startingService }]  = useWorkerStartServiceMutation();
  const [complete,     { isLoading: completing }]       = useWorkerCompleteMutation();
  const [presign]                                        = usePresignUploadMutation();
  const [reportNoResponse, { isLoading: reportingNoResponse }] = useWorkerReportNoResponseMutation();
  const [reportPartUnavailable, { isLoading: reportingPart }]  = useWorkerReportPartUnavailableMutation();
  const [blockCustomer, { isLoading: blocking }]               = useBlockCustomerByWorkerMutation();
  const [otp, setOtp]                     = useState('');
  const [myLocation, setMyLocation]       = useState(null);
  const [proofPhotos, setProofPhotos]     = useState([]);
  const [showNoResponseConfirm, setShowNoResponseConfirm]   = useState(false);
  const [showPartUnavailableForm, setShowPartUnavailableForm] = useState(false);
  const [partName, setPartName]           = useState('');
  const photoInputRef                     = useRef(null);
  const otpInputRef                       = useRef(null);
  const watchCancelRef                    = useRef(null);
  const lastSentRef                       = useRef(0);
  const [idleSeconds,  setIdleSeconds]    = useState(0);

  useOrderSocket(id);
  const socketStatus = useSocketStatus();
  const live = useSelector(selectOrder);
  const { watch } = useGeolocation();

  const order = data?.order;
  const status = order
    ? live.activeOrderId === order._id ? live.status || order.status : order.status
    : null;

  const isPhone        = order && PHONE_SERVICES.has(order.service);
  const isVehicle      = order && VEHICLE_SERVICES.has(order.service);
  const isConstruction = order && CONSTRUCTION_SERVICES.has(order.service);
  const isHourly       = isConstruction && order.pricingModel === 'hourly';

  /* ── Continuous location stream while job is active ── */
  useEffect(() => {
    if (!status || !ACTIVE_STATUSES.has(status) || !token) return;
    const socket = getSocket(token);
    let lastJobPos = null;
    function jobHaverMetres(a, b) {
      const R = 6371000;
      const dLat = (b.lat - a.lat) * Math.PI / 180;
      const dLng = (b.lng - a.lng) * Math.PI / 180;
      const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    }

    // Stationary tracking: if worker hasn't moved 15m in 45s, drop to 60s heartbeat.
    let stationaryRef = { lastMovedAt: Date.now(), lastPos: null };

    watchCancelRef.current = watch(
      (pos) => {
        setMyLocation({ lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy ?? null });
        const now = Date.now();
        const cur = { lat: pos.lat, lng: pos.lng };
        const distMoved = lastJobPos ? jobHaverMetres(lastJobPos, cur) : 999;
        const moved = distMoved >= 15;

        if (moved) {
          stationaryRef.lastMovedAt = now;
          stationaryRef.lastPos = cur;
        }

        const isParked = (now - stationaryRef.lastMovedAt) > 45000;
        // Parked: heartbeat every 30s. Moving: every 2s for smoother customer tracking.
        const minInterval = isParked ? 30000 : 2000;
        if (now - lastSentRef.current < minInterval) return;

        lastSentRef.current = now;
        if (moved) lastJobPos = cur;

        // Send heading + speed for client-side dead reckoning on customer map
        socket.emit('worker:location', {
          lat: pos.lat,
          lng: pos.lng,
          orderId: id,
          hdg: pos.heading ?? null,
          spd: pos.speed ?? null,
        });
      },
      (err) => console.warn('[WorkerJobPage] geolocation watch error', err),
    );
    return () => { watchCancelRef.current?.(); watchCancelRef.current = null; };
  }, [status, token, id, watch]);

  const handlePhotoCapture = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (proofPhotos.length >= 3) { toast.error('Maximum 3 photos allowed'); return; }

    const preview = URL.createObjectURL(file);
    const photoId = Date.now();
    setProofPhotos((prev) => [...prev, { id: photoId, preview, key: null, uploading: true }]);

    try {
      const { uploadUrl, key } = await presign({ folder: 'order-proof', contentType: file.type || 'image/jpeg' }).unwrap();
      await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'image/jpeg' } });
      setProofPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, key, uploading: false } : p));
    } catch {
      /* S3 failed — mark with error so we can block completion */
      setProofPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, key: null, uploading: false, error: true } : p));
      toast.error('Photo upload failed — retake the photo');
    }
  }, [proofPhotos.length, presign]);

  /* ── Idle alert: count seconds since order was assigned ── */
  useEffect(() => {
    if (status !== 'assigned' || !order) return;
    const assignedEntry = order.statusHistory?.slice().reverse().find(h => h.status === 'assigned');
    const assignedAt    = assignedEntry ? new Date(assignedEntry.at).getTime() : Date.now();
    const tick = () => setIdleSeconds(Math.floor((Date.now() - assignedAt) / 1000));
    tick();
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, [status, order]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Redirect if job pulled away (reassigned back to searching) ── */
  useEffect(() => {
    if (status !== 'searching') return;
    toast.error('Job reassigned — you were inactive too long. Penalty applied.', { duration: 5000 });
    nav('/worker');
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Direct socket event when stale-order watchdog pulls the job ── */
  useEffect(() => {
    if (!token || !id) return;
    const socket = getSocket(token);
    function onJobPulled({ orderId: pulledId }) {
      if (String(pulledId) !== String(id)) return;
      toast.error('Job reassigned — you were inactive too long. Penalty applied.', { duration: 5000 });
      nav('/worker');
    }
    socket.on('job.pulled', onJobPulled);
    return () => socket.off('job.pulled', onJobPulled);
  }, [token, id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Customer cancelled the order — leave the live job cleanly ── */
  useEffect(() => {
    if (!token || !id) return;
    const socket = getSocket(token);
    function onCancelled(payload) {
      if (payload?.orderId && String(payload.orderId) !== String(id)) return;
      toast.error('Order was cancelled by the customer.', { duration: 5000, id: 'job-terminal' });
      setTimeout(() => nav('/worker'), 1500);
    }
    socket.on('order.cancelled', onCancelled);
    return () => socket.off('order.cancelled', onCancelled);
  }, [token, id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Backup: page opened/refreshed when the order is already terminal-cancelled ── */
  useEffect(() => {
    if (status !== 'cancelled' && status !== 'failed') return;
    toast.error(status === 'cancelled' ? 'This order was cancelled.' : 'This order is no longer active.', { duration: 5000, id: 'job-terminal' });
    const t = setTimeout(() => nav('/worker'), 1500);
    return () => clearTimeout(t);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Safety fallback: if order is now assigned to a different worker, leave ── */
  useEffect(() => {
    if (!order || !profile?._id) return;
    const orderWorkerId = order.workerId ? String(order.workerId) : null;
    if (!orderWorkerId) return;
    if (orderWorkerId !== String(profile._id)) {
      toast.error('This job has been reassigned.', { duration: 5000 });
      nav('/worker');
    }
  }, [order?.workerId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Loading / error states ── */
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)' }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="text-indigo-400 animate-spin" />
          <p className="text-white/40 text-sm font-medium">Loading job…</p>
        </div>
      </div>
    );
  }

  if (isError || !order) {
    // 403 = worker is no longer assigned to this order (reassigned or cancelled)
    const isReassigned = error?.status === 403;
    if (isReassigned) {
      // Auto-redirect after 4 seconds so worker always ends up on dashboard
      // (socket event may have been missed while app was backgrounded)
      setTimeout(() => nav('/worker'), 4000);
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center"
          style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)' }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(249,115,22,0.15)', border: '1.5px solid rgba(249,115,22,0.3)' }}>
            <span className="text-3xl">🔄</span>
          </div>
          <div>
            <p className="text-white font-black text-lg">Job Reassigned</p>
            <p className="text-white/50 text-sm mt-1">This order has been assigned to another worker.<br />Redirecting you to dashboard…</p>
          </div>
          <div className="w-32 h-1.5 rounded-full overflow-hidden bg-white/10">
            <div className="h-full rounded-full bg-orange-500"
              style={{ animation: 'reassign-bar 4s linear forwards' }} />
          </div>
          <style>{`@keyframes reassign-bar{from{width:0%}to{width:100%}}`}</style>
          <button onClick={() => nav('/worker')} className="text-white/40 text-sm mt-1">Go now</button>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)' }}>
        <AlertCircle size={36} className="text-red-400" />
        <p className="text-white font-bold text-center">Could not load job details</p>
        <button onClick={() => refetch()} className="px-6 py-2.5 rounded-xl bg-indigo-500 text-white font-bold text-sm">Retry</button>
        <button onClick={() => nav('/worker')} className="text-white/40 text-sm">Back to Dashboard</button>
      </div>
    );
  }

  /* ── Safe coordinate access ── */
  const coords = order.pickupLocation?.coordinates;
  const pickup = coords ? { lat: coords[1], lng: coords[0] } : null;

  const chipCfg = STATUS_CONFIG[status] || { label: status, color: 'bg-slate-500/15 text-slate-300 ring-slate-500/30', dot: 'bg-slate-400' };
  const terminal = ['completed', 'cancelled', 'failed'].includes(status);

  function openNavigation() {
    if (!pickup) return;
    const dest   = `${pickup.lat},${pickup.lng}`;
    const origin = myLocation ? `${myLocation.lat},${myLocation.lng}` : '';
    const url = /iPhone|iPad|iPod/i.test(navigator.userAgent)
      ? `maps://maps.apple.com/?${origin ? `saddr=${origin}&` : ''}daddr=${dest}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1${origin ? `&origin=${origin}` : ''}&destination=${dest}&travelmode=driving`;
    window.open(url, '_blank', 'noopener');
  }

  async function callCustomer() {
    try {
      const res = await fetch(`${API_BASE}/api/orders/${id}/call`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.proxyNumber) { window.location.href = `tel:${d.proxyNumber}`; return; }
      toast.error(d.error || 'Calling is available once the job is active');
    } catch { toast.error('Could not start call'); }
  }

  async function onStartTrip() {
    try {
      await startTrip({ id, lat: myLocation?.lat, lng: myLocation?.lng }).unwrap();
      toast.success('Trip started — arrive on time to avoid penalties');
      refetch();
    }
    catch (err) { toast.error(err.data?.error || 'Failed'); }
  }
  async function onArrive() {
    if (!myLocation) {
      toast.error('GPS not available — enable location and try again');
      return;
    }
    if (!pickup) {
      toast.error('Customer location unavailable');
      return;
    }
    const distM = haversineMeters(myLocation, pickup);
    if (distM > ARRIVED_GEOFENCE_M) {
      toast.error(`You're ${Math.round(distM)} m away — move within ${ARRIVED_GEOFENCE_M} m to mark arrived`);
      return;
    }
    try { await arrive(id).unwrap(); toast.success('Marked as arrived'); refetch(); }
    catch (err) { toast.error(err.data?.error || 'Failed'); }
  }
  async function onStartService() {
    if (!/^\d{6}$/.test(otp)) { toast.error('Enter the 6-digit OTP from the customer'); return; }
    try { await startService({ id, otp }).unwrap(); toast.success('Service started'); refetch(); }
    catch (err) { toast.error(err.data?.error || 'Invalid OTP'); }
  }

  function removePhoto(photoId) {
    setProofPhotos((prev) => prev.filter((p) => p.id !== photoId));
  }

  /* Only photos that successfully uploaded to S3 are accepted */
  const validPhotos = proofPhotos.filter((p) => !p.uploading && p.key && !p.error);

  async function onComplete() {
    if (proofPhotos.some((p) => p.uploading)) {
      toast.error('Please wait for photos to finish uploading'); return;
    }
    const failed = proofPhotos.filter((p) => p.error);
    if (failed.length > 0) {
      toast.error('Some photos failed to upload. Remove them and retake.'); return;
    }
    if (validPhotos.length === 0) {
      toast.error('Please take at least 1 proof-of-work photo'); return;
    }
    try {
      await complete({ id, completionPhotos: validPhotos.map((p) => p.key) }).unwrap();
      toast.success('Job completed!');
      nav('/worker', { replace: true });
    } catch (err) { toast.error(err.data?.error || 'Failed'); }
  }

  return (
    <div className="min-h-screen md:h-screen md:overflow-hidden md:flex md:flex-row bg-slate-50">
      
      {/* Socket degraded banner (Absolute overlay on desktop) */}
      <AnimatePresence>
        {socketStatus !== 'connected' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden relative z-50"
          >
            <div className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold ${
              socketStatus === 'offline' ? 'bg-red-600' : 'bg-amber-500'
            } text-white`}>
              <Loader2 size={12} className="animate-spin shrink-0" />
              {socketStatus === 'offline'
                ? 'Live connection lost — location updates paused'
                : 'Reconnecting…'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Desktop Map Column (Right) / Mobile Map Row (Top) ── */}
      {pickup && (
        <div className="w-full h-[40vh] md:h-full md:flex-1 relative z-0 md:order-2">
          {/* Map header overlay on mobile, or just standard header on desktop */}
          <header className="absolute top-0 inset-x-0 z-20" style={{ background: 'linear-gradient(180deg, rgba(15,23,42,0.9) 0%, transparent 100%)' }}>
            <div className="px-4 py-4 flex items-center gap-3">
              <motion.button onClick={() => nav('/worker')}
                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0"
                whileTap={{ scale: 0.92 }}>
                <ArrowLeft size={20} strokeWidth={2.5} className="text-white" />
              </motion.button>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/80" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>Active Job</p>
                <p className="font-black text-white capitalize truncate leading-tight text-lg" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{order.service.replace(/_/g, ' ')}</p>
              </div>
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-md border border-white/10 ${chipCfg.color.replace('bg-slate-500/15', 'bg-black/40 text-white')}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${chipCfg.dot} animate-pulse`} />
                {chipCfg.label}
              </motion.div>
            </div>
          </header>
          
          <div className="absolute inset-0">
            <LiveTrackingMap pickup={pickup} workerLocation={myLocation} service={order.service} status={status} height="100%" />
          </div>
        </div>
      )}

      {/* ── Scrollable Panel Column (Left/Bottom) ── */}
      <div className={`w-full md:w-[450px] shrink-0 bg-slate-50 relative z-10 flex flex-col md:order-1 ${pickup ? 'rounded-t-3xl -mt-6 md:mt-0 md:rounded-none shadow-[0_-10px_40px_rgba(0,0,0,0.15)] md:shadow-[10px_0_40px_rgba(0,0,0,0.1)]' : ''} h-[calc(100vh-40vh+24px)] md:h-full overflow-hidden`}>
        
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 pt-6 md:pt-8 space-y-4 pb-6 min-h-0 custom-scrollbar">

        {/* Location + navigation */}
        {order.pickupLocation?.address && (
          <div className="card">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                <MapPin size={15} strokeWidth={2} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="t-label mb-1">Customer Location</p>
                <p className="text-sm font-semibold text-[#0F172A] leading-relaxed">{order.pickupLocation.address}</p>
                {(order.pickupLocation.notes || order.pickupLocation.landmark || order.pickupLocation.flatNumber) && (
                  <div className="mt-2 flex items-start gap-1.5 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                    <MapPin size={13} strokeWidth={2.5} className="text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[12.5px] font-semibold text-amber-800 leading-snug">
                      {[order.pickupLocation.flatNumber, order.pickupLocation.landmark, order.pickupLocation.notes].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                )}
              </div>
            </div>
            {pickup && (
              <button onClick={openNavigation} className="btn-secondary w-full gap-2">
                <Navigation size={14} strokeWidth={2} />Open Navigation
              </button>
            )}
          </div>
        )}

        {/* Tow destination — where the vehicle must be taken (towing jobs) */}
        {order.dropLocation?.address && (
          <div className="card">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                <Navigation size={15} strokeWidth={2} className="text-slate-700" />
              </div>
              <div className="flex-1">
                <p className="t-label mb-1">Tow to (destination)</p>
                <p className="text-sm font-semibold text-[#0F172A] leading-relaxed">{order.dropLocation.address}</p>
              </div>
            </div>
          </div>
        )}

        {/* Contact customer */}
        {!terminal && (
          <div className="card flex items-center gap-3">
            <div className="flex-1">
              <p className="t-label mb-0.5">Customer</p>
              <p className="text-sm font-semibold text-[#0F172A]">{order.userName || 'Customer'}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={callCustomer}
                className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center" aria-label="Call customer">
                <Phone size={16} strokeWidth={2} className="text-green-600" />
              </button>
              <button onClick={() => nav(`/orders/${id}/chat`)}
                className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center" aria-label="Chat with customer">
                <MessageCircle size={16} strokeWidth={2} className="text-blue-600" />
              </button>
            </div>
          </div>
        )}

        {/* Vertical-specific job details */}
        {(order.deviceBrand || order.vehicleType || order.serviceMode || order.pricingModel) && (
          <div className="card">
            <p className="t-label mb-3">Job Details</p>
            <div className="space-y-2">
              {order.deviceBrand && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Phone Brand</span>
                  <span className="font-semibold text-slate-800">{order.deviceBrand}</span>
                </div>
              )}
              {order.deviceModel && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Model</span>
                  <span className="font-semibold text-slate-800">{order.deviceModel}{order.deviceSeries ? ` · ${order.deviceSeries}` : ''}</span>
                </div>
              )}
              {order.partsTier && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Part Quality</span>
                  <span className="font-bold px-2 py-0.5 rounded-lg text-xs bg-amber-50 text-amber-700">
                    {order.partsTier}{order.partWarrantyDays ? ` · ${order.partWarrantyDays}d warranty` : ''}
                  </span>
                </div>
              )}
              {order.serviceMode && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Service Mode</span>
                  <span className={`font-bold px-2 py-0.5 rounded-lg text-xs ${order.serviceMode === 'doorstep' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                    {order.serviceMode === 'doorstep' ? '🏠 Doorstep' : '📦 Pickup'}
                  </span>
                </div>
              )}
              {order.vehicleType && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Vehicle</span>
                  <span className="font-semibold text-slate-800 capitalize">
                    {order.vehicleType === 'bike' ? '🏍️' : order.vehicleType === 'scooter' ? '🛵' : '🚗'} {order.vehicleType}
                  </span>
                </div>
              )}
              {order.pricingModel && order.pricingModel !== 'standard' && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Billing Model</span>
                  <span className="font-bold text-slate-800 capitalize">{order.pricingModel}</span>
                </div>
              )}
              {order.estimatedHours && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Est. Hours</span>
                  <span className="font-semibold text-slate-800">{order.estimatedHours}h</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Customer note */}
        {order.description && (
          <div className="card">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                <FileText size={15} strokeWidth={2} className="text-slate-500" />
              </div>
              <div>
                <p className="t-label mb-1">Customer Note</p>
                <p className="text-sm text-slate-600 leading-relaxed">{order.description}</p>
              </div>
            </div>
          </div>
        )}

        {/* Customer photos */}
        {order.images?.length > 0 && (
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <ImageIcon size={14} strokeWidth={2} className="text-blue-600" />
              </div>
              <p className="t-label">Photos from customer</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {order.images.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img src={url} alt={`Issue photo ${i + 1}`}
                    className="w-full aspect-square object-cover rounded-xl ring-1 ring-slate-100 hover:ring-blue-300 transition" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Earnings */}
        <motion.div className="relative rounded-2xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)', boxShadow: '0 8px 32px rgba(6,78,59,0.4)' }}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at 80% 20%, rgba(52,211,153,0.2) 0%, transparent 60%)' }} />
          <div className="relative flex items-center gap-4 p-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center shrink-0 border border-white/15">
              <BadgeIndianRupee size={22} strokeWidth={1.75} className="text-emerald-300" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/60 mb-0.5">Your Earnings</p>
              <p className="text-3xl font-black text-white">₹{order.pricing?.total || '—'}</p>
            </div>
            {status === 'completed' && (
              <span className="text-xs font-bold text-emerald-300 bg-emerald-300/10 ring-1 ring-emerald-400/30 px-3 py-1 rounded-full">Paid ✓</span>
            )}
          </div>
        </motion.div>

        {/* OTP input */}
        <AnimatePresence>
          {status === 'arrived' && (
            <motion.div initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}
              className="relative rounded-2xl overflow-hidden p-4"
              style={{ background: 'linear-gradient(135deg, #451a03 0%, #78350f 100%)', boxShadow: '0 8px 32px rgba(120,53,15,0.4)' }}>
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at 80% 10%, rgba(251,191,36,0.15) 0%, transparent 60%)' }} />
              <div className="relative">
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-8 h-8 rounded-xl bg-amber-400/20 flex items-center justify-center">
                    <KeyRound size={15} strokeWidth={2} className="text-amber-300" />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-amber-200 uppercase tracking-widest">Customer OTP</p>
                    <p className="text-[10px] text-amber-300/50 font-medium mt-0.5">Ask the customer for their 6-digit code</p>
                  </div>
                </div>
                <div className="flex gap-2 justify-center mb-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} onClick={() => otpInputRef.current?.focus()}
                      className={`flex-1 aspect-square max-w-[52px] rounded-2xl flex items-center justify-center text-xl font-black border-2 transition-all cursor-text ${
                        otp[i]
                          ? 'bg-amber-400/25 border-amber-400 text-white shadow-lg shadow-amber-500/20'
                          : 'bg-white/5 border-white/12 text-white/20'
                      }`}>
                      {otp[i] ? '●' : '–'}
                    </div>
                  ))}
                </div>
                <input ref={otpInputRef} className="w-full opacity-0 h-1 absolute" inputMode="numeric"
                  maxLength={6} value={otp} autoFocus
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                <button className="w-full mt-3 py-3 rounded-xl bg-white/5 border border-white/10 text-amber-200/60 text-xs font-semibold"
                  onClick={() => otpInputRef.current?.focus()}>
                  Tap here → enter OTP
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Vertical-specific panels (shown during in_progress) ── */}
        {status === 'in_progress' && (
          <>
            {/* Construction: live hourly timer */}
            {isHourly && <ConstructionTimerPanel orderId={order._id} />}

            {/* Vehicle: pre-damage / health documentation */}
            {isVehicle && <VehicleHealthPanel orderId={order._id} />}

            {/* Service checklist for all verticals */}
            <ServiceChecklistPanel orderId={order._id} service={order.service}
              onChecked={(ids) => console.log('[Checklist] Completed:', ids)} />

            {/* Proof of work photo upload */}
            <motion.div
              className="rounded-2xl overflow-hidden"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              style={{
                background: validPhotos.length > 0
                  ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)'
                  : 'linear-gradient(135deg, #faf5ff, #f3e8ff)',
                border: validPhotos.length > 0
                  ? '1px solid rgba(34,197,94,0.25)'
                  : '1px solid rgba(139,92,246,0.2)',
              }}
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                <motion.div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                    validPhotos.length > 0 ? 'bg-green-100' : 'bg-violet-100'
                  }`}
                  animate={validPhotos.length === 0 ? {
                    boxShadow: ['0 0 0 0px rgba(139,92,246,0.3)', '0 0 0 8px rgba(139,92,246,0)', '0 0 0 0px rgba(139,92,246,0)']
                  } : {}}
                  transition={{ duration: 2.5, repeat: Infinity }}
                >
                  {validPhotos.length > 0
                    ? <CheckCircle size={20} strokeWidth={2} className="text-green-600" />
                    : <Camera size={20} strokeWidth={1.75} className="text-violet-600" />
                  }
                </motion.div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-extrabold ${validPhotos.length > 0 ? 'text-green-800' : 'text-violet-900'}`}>
                    {validPhotos.length > 0 ? 'Proof photos ready' : 'Add proof-of-work photos'}
                  </p>
                  <p className={`text-[11px] font-medium mt-0.5 ${validPhotos.length > 0 ? 'text-green-600' : 'text-violet-500'}`}>
                    {validPhotos.length > 0
                      ? `${validPhotos.length} photo${validPhotos.length > 1 ? 's' : ''} uploaded — you can add ${3 - proofPhotos.length} more`
                      : 'Minimum 1 photo required before marking complete'}
                  </p>
                </div>
                {/* Counter pill */}
                <div className={`px-2.5 py-1 rounded-full text-xs font-extrabold shrink-0 ${
                  validPhotos.length >= 1 ? 'bg-green-500 text-white' : 'bg-violet-200 text-violet-700'
                }`}>
                  {validPhotos.length}/3
                </div>
              </div>

              {/* Photo grid */}
              {proofPhotos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 px-4 pb-3">
                  {proofPhotos.map((photo) => (
                    <div key={photo.id} className="relative aspect-square">
                      <img src={photo.preview} alt="Proof"
                        className={`w-full h-full object-cover rounded-2xl ${
                          photo.error ? 'ring-2 ring-red-400' : photo.uploading ? 'ring-2 ring-violet-300' : 'ring-2 ring-green-400'
                        }`}
                        style={{ boxShadow: photo.error ? '0 4px 12px rgba(239,68,68,0.25)' : '0 4px 12px rgba(0,0,0,0.12)' }}
                      />
                      {photo.uploading ? (
                        <div className="absolute inset-0 bg-black/50 rounded-2xl flex flex-col items-center justify-center gap-1">
                          <Loader2 size={18} className="text-white animate-spin" />
                          <p className="text-[9px] text-white font-bold">Uploading…</p>
                        </div>
                      ) : (
                        <>
                          <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow ${
                            photo.error ? 'bg-red-500' : 'bg-green-500'
                          }`}>
                            {photo.error
                              ? <X size={10} strokeWidth={3} className="text-white" />
                              : <CheckCircle size={11} strokeWidth={3} className="text-white" />
                            }
                          </div>
                          <button onClick={() => removePhoto(photo.id)}
                            className="absolute top-1.5 left-1.5 w-5 h-5 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center">
                            <X size={9} strokeWidth={3} className="text-white" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add photo button */}
              {proofPhotos.length < 3 && (
                <div className="px-4 pb-4">
                  <input ref={photoInputRef} type="file" accept="image/*" capture="environment"
                    className="hidden" onChange={handlePhotoCapture} />
                  <button 
                    onClick={() => photoInputRef.current?.click()}
                    className="w-full py-3 rounded-xl bg-white text-violet-700 font-bold text-sm ring-1 ring-violet-200 flex items-center justify-center gap-2"
                  >
                    <Camera size={17} strokeWidth={2} />
                    <span>{proofPhotos.length === 0 ? 'Take Proof Photo' : 'Add Another Photo'}</span>
                    {proofPhotos.length === 0 && (
                      <span className="ml-1 text-[10px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded-full">Required</span>
                    )}
                  </button>
                </div>
              )}
            </motion.div>

            {isPhone && <PhoneHealthPanel orderId={order._id} />}
          </>
        )}
      </div>

      {/* Fixed action bar (Docked at the bottom of the scrollable panel) */}
      <div className="shrink-0 z-20"
        style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)', boxShadow: '0 -8px 32px rgba(0,0,0,0.06)', borderTop: '1px solid rgba(0,0,0,0.04)' }}>
        <div className="px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">

          {status === 'assigned' && (() => {
            const idleMin        = Math.floor(idleSeconds / 60);
            const isUrgent       = idleSeconds >= 240;   // 4 min — amber warning
            const isCritical     = idleSeconds >= 360;   // 6 min — red, reassignment imminent
            const isReassigning  = idleSeconds >= 480;   // 8 min — server sweep already fired
            // Countdown shown from 4–6 min: seconds left before auto-reassign
            const secsToRedispatch = Math.max(0, 360 - idleSeconds);
            const ctdMin = Math.floor(secsToRedispatch / 60);
            const ctdSec = secsToRedispatch % 60;
            const isNearby  = myLocation && pickup
              && (myLocation.accuracy == null || myLocation.accuracy <= 120)
              && haversineMeters(myLocation, pickup) <= 200;
            return (
              <div className="space-y-2">

                {/* Nearby order — service must start soon */}
                {isNearby && (
                  <div className="flex items-center justify-center gap-1.5 mb-1 pt-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-extrabold text-emerald-600 uppercase tracking-wide">Customer is nearby (within 200m)</span>
                  </div>
                )}

                {/* Idle alert — amber at 5 min, red at 10 min, pulsing at 12 min */}
                {isUrgent && (
                  <motion.div
                    className="rounded-2xl px-4 py-3 flex items-center gap-3"
                    style={isReassigning
                      ? { background: 'linear-gradient(135deg,#1a0505,#450a0a)', border: '2px solid rgba(239,68,68,0.8)' }
                      : isCritical
                      ? { background: 'linear-gradient(135deg,#450a0a,#991b1b)', border: '1.5px solid rgba(239,68,68,0.5)' }
                      : { background: 'linear-gradient(135deg,#431407,#c2410c)', border: '1.5px solid rgba(249,115,22,0.5)' }}
                    animate={isReassigning
                      ? { scale: [1, 1.03, 1], opacity: [1, 0.85, 1] }
                      : isCritical ? { scale: [1, 1.02, 1] } : {}}
                    transition={{ duration: isReassigning ? 0.8 : 0.6, repeat: Infinity }}
                  >
                    <motion.span
                      className="text-xl shrink-0"
                      animate={{ rotate: (isCritical || isReassigning) ? [-10,10,-10,0] : [0] }}
                      transition={{ duration: 0.4, repeat: Infinity }}
                    >
                      {isReassigning ? '⛔' : isCritical ? '🚨' : '⚠️'}
                    </motion.span>
                    <div className="flex-1">
                      <p className={`text-sm font-black ${(isCritical || isReassigning) ? 'text-red-200' : 'text-orange-200'}`}>
                        {isReassigning
                          ? 'Reassigning your job now…'
                          : isCritical
                          ? 'Auto-reassign triggered — start NOW!'
                          : `${idleMin} min idle — customer is waiting!`}
                      </p>
                      <p className={`text-xs mt-0.5 ${(isCritical || isReassigning) ? 'text-red-400' : 'text-orange-400'}`}>
                        {isReassigning
                          ? 'You will lose this job and receive a penalty'
                          : isCritical
                          ? `Assigned ${idleMin} min ago · reassignment in progress`
                          : `Auto-cancel in ${ctdMin}:${String(ctdSec).padStart(2,'0')} · tap Start Trip`}
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Action row: Start Trip + Navigate side by side */}
                <div className="flex gap-2">
                  <motion.button onClick={onStartTrip} disabled={starting}
                    className="flex-1 relative overflow-hidden rounded-2xl py-4 flex items-center justify-center gap-2 text-white font-black text-sm disabled:opacity-60"
                    style={isCritical
                      ? { background: 'linear-gradient(135deg,#dc2626,#b91c1c)', boxShadow: '0 8px 24px rgba(220,38,38,0.5)' }
                      : { background: 'linear-gradient(135deg,#1d4ed8,#4f46e5)', boxShadow: '0 8px 24px rgba(79,70,229,0.4)' }}
                    whileTap={{ scale: 0.98 }}>
                    {starting ? <><Loader2 size={17} className="animate-spin" /> Starting…</> : <><Navigation size={17} strokeWidth={2.5} /> Start Trip</>}
                  </motion.button>

                  {pickup && (
                    <motion.button onClick={openNavigation}
                      className="w-14 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ background: 'linear-gradient(135deg,#065f46,#047857)', boxShadow: '0 4px 16px rgba(4,120,87,0.4)' }}
                      whileTap={{ scale: 0.92 }}
                      aria-label="Open navigation"
                    >
                      <span className="text-xl">🗺️</span>
                    </motion.button>
                  )}
                </div>
              </div>
            );
          })()}

          {status === 'on_the_way' && (() => {
            const distM   = myLocation && pickup ? haversineMeters(myLocation, pickup) : null;
            const withinFence = distM !== null && distM <= ARRIVED_GEOFENCE_M;
            // Progress 0→1 as distance drops from 300m → 0m (feels responsive)
            const progress = distM !== null ? Math.max(0, Math.min(1, 1 - distM / 50)) : 0;
            const pct      = Math.round(progress * 100);

            // ETA countdown from trip deadline stored on order
            const deadlineAt = order.tripDeadlineAt ? new Date(order.tripDeadlineAt) : null;
            const etaMins    = order.tripEtaMinutes;

            return (
              <div className="space-y-2">

                {/* ── ETA countdown card ─────────────────────────────── */}
                {deadlineAt && <WorkerETACard deadlineAt={deadlineAt} etaMins={etaMins} />}
                {/* Proximity indicator — only while GPS is available */}
                {distM !== null && (
                  <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 transition-colors ${
                    withinFence
                      ? 'bg-green-50 ring-1 ring-green-200'
                      : 'bg-amber-50 ring-1 ring-amber-200'
                  }`}>
                    {/* Arc progress ring */}
                    <div className="relative w-10 h-10 shrink-0">
                      <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
                        <circle cx="20" cy="20" r="16" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                        <circle
                          cx="20" cy="20" r="16" fill="none"
                          stroke={withinFence ? '#16a34a' : '#d97706'}
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeDasharray={`${2 * Math.PI * 16}`}
                          strokeDashoffset={`${2 * Math.PI * 16 * (1 - progress)}`}
                          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black"
                            style={{ color: withinFence ? '#16a34a' : '#d97706' }}>
                        {pct}%
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      {withinFence ? (
                        <>
                          <p className="text-sm font-extrabold text-green-800">You're at the location!</p>
                          <p className="text-xs text-green-600 font-medium">{Math.round(distM)} m · tap to confirm arrival</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-extrabold text-amber-800">
                            {Math.round(distM)} m away
                          </p>
                          <p className="text-xs text-amber-600 font-medium">
                            Get within {ARRIVED_GEOFENCE_M} m to enable arrived
                          </p>
                        </>
                      )}
                    </div>

                    <MapPin size={16} strokeWidth={2}
                      className={withinFence ? 'text-green-600 shrink-0' : 'text-amber-500 shrink-0'} />
                  </div>
                )}

                {/* Arrived button + Navigate side by side */}
                <div className="flex gap-2">
                  <motion.button
                    onClick={onArrive}
                    disabled={arriving || !withinFence}
                    className="flex-1 relative overflow-hidden rounded-2xl py-4 flex items-center justify-center gap-2 text-white font-black text-sm transition-all"
                    style={withinFence
                      ? { background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', boxShadow: '0 8px 24px rgba(22,163,74,0.45)' }
                      : { background: 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)', opacity: 0.7 }
                    }
                    whileTap={withinFence ? { scale: 0.98 } : {}}>
                    {arriving
                      ? <><Loader2 size={17} className="animate-spin" /> Updating…</>
                      : withinFence
                      ? <><CheckCircle2 size={17} strokeWidth={2.5} /> I've Arrived</>
                      : <><MapPin size={17} strokeWidth={2.5} /> {distM !== null ? `${Math.round(distM)} m away` : 'Waiting for GPS…'}</>
                    }
                  </motion.button>

                  {pickup && (
                    <motion.button onClick={openNavigation}
                      className="w-14 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ background: 'linear-gradient(135deg,#065f46,#047857)', boxShadow: '0 4px 16px rgba(4,120,87,0.4)' }}
                      whileTap={{ scale: 0.92 }}
                      aria-label="Open navigation"
                    >
                      <span className="text-xl">🗺️</span>
                    </motion.button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── No-response panel (#73): shown if worker has been arrived >3 min ── */}
          {status === 'arrived' && (
            <div className="rounded-2xl bg-amber-950/60 ring-1 ring-amber-800/40 p-4 space-y-3">
              <p className="text-[11px] font-bold text-amber-300 uppercase tracking-widest">Customer not responding?</p>
              {!showNoResponseConfirm ? (
                <button
                  onClick={() => setShowNoResponseConfirm(true)}
                  className="w-full py-2.5 rounded-xl bg-amber-800/50 text-amber-200 text-sm font-bold ring-1 ring-amber-700/40"
                >
                  Report no response — cancel penalty-free
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-amber-200/70">
                    You'll receive ₹35 arrival compensation. Customer is charged ₹50. This is reviewed by support.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        try {
                          await reportNoResponse(id).unwrap();
                          toast.success('Reported. Arrival compensation credited.');
                          nav('/worker');
                        } catch (err) {
                          toast.error(err?.data?.error || 'Failed — try again');
                        }
                        setShowNoResponseConfirm(false);
                      }}
                      disabled={reportingNoResponse}
                      className="flex-1 py-2.5 rounded-xl bg-red-700 text-white text-sm font-bold disabled:opacity-50"
                    >
                      {reportingNoResponse ? 'Sending…' : 'Confirm — No Response'}
                    </button>
                    <button onClick={() => setShowNoResponseConfirm(false)} className="px-4 py-2.5 rounded-xl bg-white/5 text-white/50 text-sm">
                      Back
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {status === 'arrived' && (
            <motion.button onClick={onStartService} disabled={startingService || otp.length < 6}
              className="w-full rounded-2xl py-4 flex items-center justify-center gap-2.5 text-white font-black text-base disabled:opacity-50"
              style={{
                background: otp.length === 6 ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' : 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
                boxShadow: otp.length === 6 ? '0 8px 24px rgba(22,163,74,0.4)' : 'none',
              }}
              whileTap={{ scale: 0.98 }}>
              {startingService ? <><Loader2 size={18} className="animate-spin" /> Verifying…</> : <><KeyRound size={18} strokeWidth={2.5} /> Verify OTP & Start Service</>}
            </motion.button>
          )}

          {status === 'in_progress' && (
            <div className="space-y-2">
              {validPhotos.length === 0 && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-center text-xs font-bold text-amber-700 bg-amber-50 ring-1 ring-amber-200 py-2.5 rounded-xl">
                  📷 Take at least 1 proof photo above to complete
                </motion.p>
              )}
              <motion.button onClick={onComplete}
                disabled={completing || validPhotos.length === 0 || proofPhotos.some(p => p.uploading)}
                className="w-full relative overflow-hidden rounded-2xl py-4 flex items-center justify-center gap-2.5 text-white font-black text-base disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', boxShadow: '0 8px 24px rgba(22,163,74,0.4)' }}
                whileTap={{ scale: 0.98 }}>
                <div className="absolute inset-0 opacity-20 pointer-events-none"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)', animation: 'shimmer 2s ease-in-out infinite' }} />
                {completing ? <><Loader2 size={18} className="animate-spin" /> Completing…</> : <><Zap size={18} strokeWidth={2.5} /> Mark Job Complete</>}
              </motion.button>

              {/* ── Part Unavailable (#71): electronics/repair verticals ── */}
              {(isPhone || order?.service?.includes('repair') || order?.service?.includes('replacement')) && (
                <div className="rounded-2xl bg-slate-800/60 ring-1 ring-slate-700/40 p-4 space-y-2">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Spare part issue?</p>
                  {!showPartUnavailableForm ? (
                    <button onClick={() => setShowPartUnavailableForm(true)}
                      className="w-full py-2.5 rounded-xl bg-slate-700/50 text-slate-300 text-sm font-bold ring-1 ring-slate-600/40">
                      Part unavailable — close with diagnostic fee
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-400">You'll receive ₹150 diagnostic fee. Customer refunded the rest.</p>
                      <input
                        value={partName}
                        onChange={(e) => setPartName(e.target.value)}
                        placeholder="Part name (e.g. iPhone 12 screen)"
                        className="w-full px-3 py-2 rounded-xl bg-slate-700 text-white text-sm placeholder:text-slate-500 outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            if (!partName.trim()) { toast.error('Enter the part name'); return; }
                            try {
                              await reportPartUnavailable({ id, partName: partName.trim(), notes: '' }).unwrap();
                              toast.success('Reported. ₹150 diagnostic fee credited.');
                              nav('/worker');
                            } catch (err) { toast.error(err?.data?.error || 'Failed'); }
                          }}
                          disabled={reportingPart}
                          className="flex-1 py-2.5 rounded-xl bg-orange-700 text-white text-sm font-bold disabled:opacity-50"
                        >
                          {reportingPart ? 'Submitting…' : 'Confirm Unavailable'}
                        </button>
                        <button onClick={() => setShowPartUnavailableForm(false)} className="px-4 py-2.5 rounded-xl bg-white/5 text-white/50 text-sm">
                          Back
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {terminal && (
            <div className="space-y-2">
              <motion.button onClick={() => nav('/worker')}
                className="w-full rounded-2xl py-4 flex items-center justify-center gap-2.5 font-black text-base"
                style={{ background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)', color: '#0f172a' }}
                whileTap={{ scale: 0.98 }}>
                <ArrowLeft size={18} strokeWidth={2.5} />Back to Dashboard
              </motion.button>
              {status === 'completed' && order?.userId && (
                <button
                  onClick={async () => {
                    if (!window.confirm('Flag this customer as unsafe or abusive? Our team will review.')) return;
                    try {
                      await blockCustomer({ userId: order.userId, orderId: order._id, reason: 'Worker flagged via job page' }).unwrap();
                      toast.success('Customer flagged for review');
                    } catch { toast.error('Failed to flag customer'); }
                  }}
                  disabled={blocking}
                  className="w-full py-2.5 rounded-xl text-xs font-bold text-red-500 bg-red-50 ring-1 ring-red-100 flex items-center justify-center gap-1.5 disabled:opacity-50">
                  {blocking ? <Loader2 size={12} className="animate-spin" /> : <AlertCircle size={12} />}
                  Flag Customer as Unsafe / Abusive
                </button>
              )}
            </div>
          )}

          {!terminal && (
            <div className="mt-2">
              <SOSButton orderId={order._id} lat={myLocation?.lat} lng={myLocation?.lng} service={order?.service} />
            </div>
          )}

          {/* Cancel is allowed only before service starts (not once in_progress). */}
          {['assigned', 'on_the_way', 'arrived'].includes(status) && (
            <div className="mt-2">
              <button onClick={() => setCancelOpen(true)}
                className="w-full h-11 rounded-2xl border border-rose-200 text-rose-600 font-bold text-sm active:bg-rose-50 transition-colors">
                Cancel job
              </button>
            </div>
          )}
        </div>
      </div>
      </div>

      <WorkerCancelSheet
        orderId={order._id}
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onCancelled={() => { setCancelOpen(false); nav('/worker'); }}
      />
    </div>
  );
}
