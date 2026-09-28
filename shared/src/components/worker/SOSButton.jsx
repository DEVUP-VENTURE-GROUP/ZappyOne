/**
 * Worker SOS Emergency Button
 * 3-second hold to trigger. Sends GPS + order details to emergency contact.
 *
 * Pet service variant (#75): after trigger, shows emergency vet contacts
 * (AWBI helpline, Blue Cross India) alongside the standard 112 alert.
 */
import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Phone, Heart } from 'lucide-react';
import { useTriggerSOSMutation } from '../../services/api';
import toast from 'react-hot-toast';

// India pet emergency contacts shown after SOS triggers on a pet service job
const PET_EMERGENCY_CONTACTS = [
  { label: 'AWBI Helpline',      number: '1962',         hint: '24h Animal Welfare Board of India' },
  { label: 'Blue Cross India',   number: '044-22350959', hint: 'Chennai — national vet referral' },
  { label: 'PETA India',         number: '1800-22-PETA', hint: 'Emergency cruelty / welfare line' },
  { label: 'General Emergency',  number: '112',          hint: 'Police / Ambulance' },
];

const PET_SERVICES = new Set([
  'pet_grooming', 'pet_walking', 'pet_transport', 'pet_sitting', 'pet_vet_assist', 'pet_training_assist',
]);

export default function SOSButton({ orderId, lat, lng, service }) {
  const [holding,   setHolding]   = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [triggered, setTriggered] = useState(false);
  const [triggerSOS] = useTriggerSOSMutation();
  const timerRef   = useRef(null);
  const intervalRef = useRef(null);
  const HOLD_MS    = 3000;
  const isPetJob   = PET_SERVICES.has(service);

  function startHold() {
    if (triggered) return;
    setHolding(true);
    setProgress(0);
    const start = Date.now();
    intervalRef.current = setInterval(() => {
      const pct = Math.min(((Date.now() - start) / HOLD_MS) * 100, 100);
      setProgress(pct);
    }, 50);
    timerRef.current = setTimeout(() => {
      clearInterval(intervalRef.current);
      setHolding(false);
      setProgress(100);
      fire();
    }, HOLD_MS);
  }

  function cancelHold() {
    clearTimeout(timerRef.current);
    clearInterval(intervalRef.current);
    setHolding(false);
    setProgress(0);
  }

  async function fire() {
    if (lat == null || lng == null) {
      toast.error('GPS not ready. Call 112 directly.', { duration: 6000 });
      setTriggered(false);
      return;
    }
    try {
      await triggerSOS({ orderId, lat, lng, type: isPetJob ? 'pet_emergency' : 'worker_sos' }).unwrap();
      setTriggered(true);
      const msg = isPetJob
        ? '🐾 SOS sent. Emergency contact + support notified. See vet contacts below.'
        : '🆘 SOS sent. Emergency contact + support notified.';
      toast.error(msg, { duration: 8000 });
    } catch {
      toast.error('SOS failed to send. Call 112 immediately.');
    }
  }

  return (
    <div className="space-y-3">
      {/* Emergency & SOS Actions grouped side-by-side */}
      <div className="flex items-stretch gap-2">
        <a
          href="tel:112"
          className="flex-1 py-3 rounded-2xl flex items-center justify-center gap-1.5 font-bold text-[13px] bg-slate-800 text-white shadow-sm hover:bg-slate-700 active:bg-slate-900 transition-colors"
        >
          <Phone size={14} strokeWidth={2.5} />
          Call 112
        </a>

        <div className="relative flex-[1.5]">
          <motion.button
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            whileTap={{ scale: 0.96 }}
            className={`w-full h-full rounded-2xl flex items-center justify-center gap-1.5 font-bold text-[13px] transition-all select-none ${
              triggered
                ? 'bg-red-50 text-red-600 ring-1 ring-red-200'
                : 'bg-red-600 text-white shadow-md shadow-red-200/50 hover:bg-red-700'
            }`}
            style={{ WebkitUserSelect: 'none' }}
          >
            {triggered ? <Phone size={14} /> : isPetJob ? <Heart size={14} /> : <ShieldAlert size={14} />}
            {triggered
              ? 'SOS Active'
              : lat == null
                ? 'GPS off — Hold SOS'
                : 'Hold 3s for SOS'}

            {/* Progress ring */}
            {holding && (
              <svg width="18" height="18" viewBox="0 0 20 20" className="-rotate-90 absolute right-3">
                <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" />
                <circle
                  cx="10" cy="10" r="8" fill="none"
                  stroke="white" strokeWidth="2.5"
                  strokeDasharray={50.27}
                  strokeDashoffset={50.27 * (1 - progress / 100)}
                  strokeLinecap="round"
                />
              </svg>
            )}
          </motion.button>

          {holding && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[11px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap shadow-xl"
              >
                Keep holding… {Math.round((HOLD_MS - (progress / 100 * HOLD_MS)) / 1000) + 1}s
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* ── Pet emergency contacts — shown after SOS triggers on a pet job (#75) ── */}
      <AnimatePresence>
        {triggered && isPetJob && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl bg-rose-50 ring-1 ring-rose-200 p-4 space-y-3 mt-1">
              <div className="flex items-center gap-2">
                <Heart size={13} strokeWidth={2.5} className="text-rose-600 fill-rose-600" />
                <p className="text-xs font-extrabold text-rose-800 uppercase tracking-widest">Pet Emergency Contacts</p>
              </div>
              {PET_EMERGENCY_CONTACTS.map((c) => (
                <div key={c.number} className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-rose-100">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{c.label}</p>
                    <p className="text-[10px] text-slate-500">{c.hint}</p>
                  </div>
                  <a
                    href={`tel:${c.number.replace(/[^0-9+]/g, '')}`}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-100 text-rose-700 text-xs font-bold hover:bg-rose-200 transition-colors"
                  >
                    <Phone size={11} strokeWidth={2.5} />
                    {c.number}
                  </a>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
