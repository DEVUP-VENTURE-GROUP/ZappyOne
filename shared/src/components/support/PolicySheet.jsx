import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import { useGetPolicyQuery } from '../../services/api';
import PolicyBody from './PolicyBody';

// A policy read over the current screen, so reading the terms never leaves a half-filled form (sign-up kept losing its step on back).
export default function PolicySheet({ slug, open, onClose }) {
  const { data, isLoading, isError } = useGetPolicyQuery(slug, { skip: !open });
  const policy = data?.policy;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink-900/40 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div role="dialog" aria-modal="true" aria-label={policy?.title || 'Terms'} onClick={(e) => e.stopPropagation()}
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-t-3xl bg-white sm:rounded-3xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <p className="truncate text-[16px] font-extrabold text-ink-900">{policy?.title || 'Terms'}</p>
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"><X size={17} /></button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              {isLoading ? <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-zappy-500" /></div>
                : isError || !policy ? <p className="py-12 text-center text-sm text-slate-500">The terms did not load. Try again in a moment.</p>
                  : <PolicyBody policy={policy} />}
            </div>
            <div className="border-t border-slate-100 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <button type="button" onClick={onClose} className="btn-primary w-full">Back to sign-up</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
