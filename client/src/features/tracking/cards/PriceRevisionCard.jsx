/**
 * Price Revision Card — shown when worker requests mid-service price change.
 * Customer approves/rejects inline with photo evidence.
 * No Indian competitor has this. Eliminates mid-service disputes.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DollarSign, Clock, CheckCircle2, XCircle, Image as ImageIcon } from 'lucide-react';
import { useRespondPriceRevisionMutation } from '@shared/services/api';
import toast from 'react-hot-toast';

export default function PriceRevisionCard({ revision, onResolved }) {
  const [secondsLeft, setSecondsLeft] = useState(
    Math.max(0, Math.ceil((new Date(revision.expiresAt) - Date.now()) / 1000))
  );
  const [respond, { isLoading }] = useRespondPriceRevisionMutation();

  useEffect(() => {
    const t = setInterval(() => {
      setSecondsLeft(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const urgentColor = secondsLeft < 60 ? 'text-red-600' : secondsLeft < 120 ? 'text-amber-600' : 'text-slate-600';
  const increase    = revision.requestedTotal - revision.originalTotal;

  async function handle(approved) {
    try {
      await respond({
        id:         revision.orderId,
        revisionId: revision._id || revision.revisionId,
        approved,
      }).unwrap();
      toast.success(approved ? 'Price revision approved' : 'Revision rejected — original price stands');
      onResolved?.(approved);
    } catch (err) {
      toast.error(err.data?.error || 'Could not respond');
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        className="card bg-amber-50 ring-2 ring-amber-300"
      >
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
            <DollarSign size={16} strokeWidth={2} className="text-amber-700" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-extrabold text-amber-800">Worker found extra work</p>
            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">{revision.reason}</p>
          </div>
          <div className={`flex items-center gap-1 text-xs font-bold ${urgentColor}`}>
            <Clock size={11} />
            {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
          </div>
        </div>

        {/* Price comparison */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-white/70 rounded-xl p-2.5 text-center">
            <p className="text-base font-extrabold text-slate-500 line-through">₹{revision.originalTotal}</p>
            <p className="text-[9px] text-slate-400 font-bold uppercase">Original</p>
          </div>
          <div className="bg-white/70 rounded-xl p-2.5 text-center">
            <p className="text-base font-extrabold text-red-600">+₹{increase}</p>
            <p className="text-[9px] text-slate-400 font-bold uppercase">Extra</p>
          </div>
          <div className="bg-amber-100 rounded-xl p-2.5 text-center ring-1 ring-amber-200">
            <p className="text-base font-extrabold text-amber-800">₹{revision.requestedTotal}</p>
            <p className="text-[9px] text-amber-600 font-bold uppercase">New Price</p>
          </div>
        </div>

        {/* Evidence photos */}
        {revision.evidenceUrls?.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <ImageIcon size={11} className="text-amber-600" />
              <p className="text-[10px] text-amber-700 font-semibold">Photo evidence from worker</p>
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {revision.evidenceUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img src={url} alt="Evidence" className="w-16 h-16 object-cover rounded-xl ring-1 ring-amber-200 flex-shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Auto-approve notice */}
        {secondsLeft > 0 && (
          <p className="text-[10px] text-amber-600 mb-2 font-medium">
            ⚠️ Auto-approved if no response in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
          </p>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => handle(false)}
            disabled={isLoading || secondsLeft === 0}
            className="flex-1 py-2.5 rounded-xl bg-white ring-1 ring-slate-200 text-slate-600 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <XCircle size={14} /> Reject
          </button>
          <button
            onClick={() => handle(true)}
            disabled={isLoading || secondsLeft === 0}
            className="flex-[2] py-2.5 rounded-xl bg-amber-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-amber-100"
          >
            <CheckCircle2 size={14} /> Approve ₹{revision.requestedTotal}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
