import { RotateCcw, X } from 'lucide-react';

/** Shown when a booking flow reopens on a saved draft: carry on, or start over. */
export default function ResumeBanner({ onStartOver, onDismiss }) {
  return (
    <div className="mx-auto mt-3 flex max-w-2xl items-center gap-3 rounded-card border border-zappy-100 bg-zappy-50 px-4 py-2.5 text-[13px] text-ink-700 sm:px-5">
      <span className="flex-1">Continuing where you left off.</span>
      <button type="button" onClick={onStartOver} className="flex items-center gap-1 font-semibold text-zappy-700 hover:text-zappy-800">
        <RotateCcw size={13} /> Start over
      </button>
      <button type="button" onClick={onDismiss} aria-label="Hide" className="text-ink-400 hover:text-ink-700"><X size={15} /></button>
    </div>
  );
}
