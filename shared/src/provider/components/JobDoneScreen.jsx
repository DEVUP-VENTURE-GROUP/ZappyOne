import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useJobEarningsQuery } from '../../services/api';
import { formatPaise } from '../../utils/money';
import RateCustomerCard from '../../components/worker/RateCustomerCard';

// The moment a job is completed: a tick that lands, what the pro earned, the customer rating, and where to go next (the app's JobDoneScreen).
export default function JobDoneScreen({ jobId, reference, onHome, onNext }) {
  const { data } = useJobEarningsQuery(jobId);
  const earned = data?.earnings?.youEarnPaise;
  const still = useReducedMotion();
  useEffect(() => { try { navigator.vibrate?.([40, 60, 40]); } catch { /* not every browser vibrates */ } }, []);
  const up = still ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.35, duration: 0.32 } };
  return (
    <div className="fixed inset-0 z-[130] overflow-y-auto bg-canvas" role="dialog" aria-modal="true" aria-label="Job done">
      <div className="mx-auto flex min-h-full max-w-md flex-col items-center gap-5 px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-14">
        <motion.span initial={still ? false : { scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}
          className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-600 text-white">
          <Check size={48} strokeWidth={3} />
        </motion.span>
        <motion.div {...up} className="text-center">
          <h1 className="text-[26px] font-black text-navy">Job done</h1>
          {reference && <p className="text-[13px] text-slate-500">Booking {reference}</p>}
          {earned != null && <p className="mt-1 text-[20px] font-extrabold text-emerald-700">You earned {formatPaise(earned)}</p>}
        </motion.div>
        <motion.div {...up} className="w-full">
          <RateCustomerCard jobId={jobId} rated={false} />
        </motion.div>
        <div className="mt-auto flex w-full flex-col gap-2">
          <button type="button" onClick={onNext} className="btn-primary h-12 w-full">See my next jobs</button>
          <button type="button" onClick={onHome} className="h-11 w-full rounded-xl border border-slate-200 bg-white text-[14px] font-semibold text-slate-700">Back to Home</button>
        </div>
      </div>
    </div>
  );
}
