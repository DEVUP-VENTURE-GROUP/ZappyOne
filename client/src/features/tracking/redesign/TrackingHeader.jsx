import { ArrowLeft, CalendarClock, Zap } from 'lucide-react';

const when = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// Service name with how it was booked, and the two buttons a customer reaches for: Help and SOS.
export default function TrackingHeader({ job, terminal, onBack, onSOS, onSupport }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-3 py-2.5 sm:px-5">
        <button type="button" onClick={onBack} aria-label="Back" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-900 hover:bg-sunken">
          <ArrowLeft size={21} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold capitalize leading-tight text-ink-900">{job.service}</p>
          {job.scheduledAt ? (
            <p className="flex items-center gap-1 text-[12.5px] font-semibold text-ink-500"><CalendarClock size={13} /> {when(job.scheduledAt)}</p>
          ) : (
            <p className="flex items-center gap-1 text-[12.5px] font-semibold text-green-700"><Zap size={13} fill="currentColor" strokeWidth={0} /> Instant</p>
          )}
        </div>
        {onSupport && (
          <button type="button" onClick={onSupport} className="h-9 shrink-0 rounded-lg border border-line px-3.5 text-[13.5px] font-semibold text-ink-900 hover:bg-sunken">Help</button>
        )}
        {!terminal && job.provider && onSOS && (
          <button type="button" onClick={onSOS} aria-label="Emergency SOS" className="h-9 shrink-0 rounded-lg border border-line px-3 text-[13.5px] font-bold text-red-700 hover:bg-red-50">SOS</button>
        )}
      </div>
    </header>
  );
}
