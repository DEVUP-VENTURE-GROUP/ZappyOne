import { motion } from 'framer-motion';
import { Loader2, Check, Megaphone } from 'lucide-react';
import { useMarkReleaseSeenMutation } from '../../services/api';
import { RELEASE } from '../../config/releases';

/**
 * Shown once per account after an update: what changed, in a few lines.
 * Closing it records the update as seen on the account, so it does not come
 * back on another phone or after a refresh.
 */
export default function WhatsNew({ role, appName = 'ZappyOne' }) {
  const [seen, { isLoading }] = useMarkReleaseSeenMutation();
  const items = RELEASE[role] || [];
  const close = () => seen(RELEASE.id).catch(() => {});
  if (!items.length) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-[250] flex items-end justify-center bg-ink-900/40 sm:items-center"
      role="dialog" aria-modal="true" aria-labelledby="whatsnew-title">
      <motion.section initial={{ y: 30 }} animate={{ y: 0 }} transition={{ duration: 0.2 }}
        className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-sheet bg-white pt-6 sm:rounded-sheet">
        <div className="shrink-0 px-6">
        <span className="flex h-11 w-11 items-center justify-center rounded-btn bg-zappy-50 text-zappy-600"><Megaphone size={20} /></span>
        <h2 id="whatsnew-title" className="mt-3 text-[22px] font-bold text-ink-900">What&apos;s new in {appName}</h2>
        </div>
        <ul className="mt-4 min-h-0 flex-1 space-y-3.5 overflow-y-auto overscroll-contain px-6 pb-2">
          {items.map(([title, text]) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zappy-600 text-white"><Check size={12} strokeWidth={3} /></span>
              <span>
                <span className="block text-[15px] font-semibold text-ink-900">{title}</span>
                <span className="block text-[14px] leading-snug text-ink-500">{text}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="shrink-0 border-t border-line px-6 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-4">
          <button type="button" onClick={close} disabled={isLoading} className="btn-primary w-full">
            {isLoading && <Loader2 size={16} className="animate-spin" />} Got it
          </button>
        </div>
      </motion.section>
    </motion.div>
  );
}

export { RELEASE };
