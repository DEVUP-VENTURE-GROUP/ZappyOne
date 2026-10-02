import { ArrowLeft, Share2, ShieldAlert, HeadphonesIcon, Clock } from 'lucide-react';
import { STATUS_PILL, shortId } from './_shared';

/**
 * The tracking page's header, for every job kind: where am I (service and
 * reference), what is happening (status, ETA, distance), and the few actions
 * that belong here (share, SOS, support). Light surface; status is carried by
 * labelled chips, not by colour alone.
 *
 * `job` is the common tracked-job shape (tracking/kinds.js). Pricing lives in
 * <BookingSummary/>.
 */
function IconAction({ label, onClick, danger = false, children }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className={`flex h-10 w-10 items-center justify-center rounded-btn transition-colors duration-150 ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-ink-700 hover:bg-sunken'}`}>
      {children}
    </button>
  );
}

export default function TrackingHeader({
  job, status, eta, distanceKm, terminal,
  onBack, onShare, onSOS, onSupport,
}) {
  const pill = STATUS_PILL[status] || STATUS_PILL.searching;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto w-full max-w-2xl px-4 pb-3 pt-2.5 sm:px-6 lg:max-w-4xl">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} aria-label="Back" className="back-btn -ml-1.5">
            <ArrowLeft size={19} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-bold capitalize leading-tight text-ink-900">{job.service}</p>
            <p className="truncate text-[12px] tabular-nums text-ink-500">
              {job.reference || `#${shortId(job.id)}`}{job.subtitle ? ` · ${job.subtitle}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center">
            {!terminal && onShare && <IconAction label="Share trip" onClick={onShare}><Share2 size={18} /></IconAction>}
            {!terminal && job.provider && onSOS && (
              <IconAction label="Emergency SOS" onClick={onSOS} danger><ShieldAlert size={18} /></IconAction>
            )}
            {onSupport && <IconAction label="Support" onClick={onSupport}><HeadphonesIcon size={18} /></IconAction>}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`chip ${pill.live ? 'bg-green-50 text-green-700' : 'bg-sunken text-ink-700'}`}>
            {pill.live && <span className="h-1.5 w-1.5 rounded-full bg-green-600" aria-hidden="true" />}
            {job.statusLabel || pill.label}
          </span>
          {!terminal && eta != null && ['assigned', 'on_the_way'].includes(status) && (
            <span className="chip bg-zappy-50 text-zappy-700 tabular-nums"><Clock size={12} /> About {eta} min</span>
          )}
          {['assigned', 'on_the_way'].includes(status) && distanceKm != null && (
            <span className="chip bg-sunken text-ink-700 tabular-nums">{Number(distanceKm).toFixed(1)} km away</span>
          )}
        </div>
      </div>
    </header>
  );
}
