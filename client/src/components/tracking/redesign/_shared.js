/* Shared constants + utils for the tracking screen — every job kind uses these. */

/**
 * The lifecycle every kind maps onto (see tracking/kinds.js): each kind's own
 * statuses collapse into these seven stages, so one timeline, one header pill
 * and one activity feed serve repair, pet care, helping and past orders alike.
 * `noun` is who does the work ("technician", "pet pro", "helper").
 */
export function stepsFor(noun = 'pro') {
  const Noun = noun[0].toUpperCase() + noun.slice(1);
  return [
    { key: 'searching',   label: `Finding your ${noun}`,     desc: `Matching you with a verified ${noun} nearby` },
    { key: 'assigned',    label: `${Noun} confirmed`,        desc: `A ${noun} has accepted your booking` },
    { key: 'on_the_way',  label: 'On the way to you',        desc: `Your ${noun} is heading over` },
    { key: 'arrived',     label: 'Arrived',                  desc: `Your ${noun} has reached you` },
    { key: 'in_progress', label: 'Work in progress',         desc: 'Your service is being done' },
    { key: 'completed',   label: 'Completed',                desc: 'All done. Thanks for using ZappyOne' },
  ];
}

/** Kept for the order screen's existing imports. */
export const STEPS = stepsFor('technician');

// Live-status pill copy — { label, live: is-dot-pulsing }
export const STATUS_PILL = {
  searching:   { label: 'Finding a pro', live: true },
  assigned:    { label: 'Confirmed',     live: true },
  on_the_way:  { label: 'On the way',    live: true },
  arrived:     { label: 'Arrived',       live: true },
  in_progress: { label: 'In progress',   live: true },
  completed:   { label: 'Completed',     live: false },
  cancelled:   { label: 'Cancelled',     live: false },
  failed:      { label: 'Not completed', live: false },
};

/** Activity-feed copy per stage; null when a stage shouldn't create an entry. */
export function feedCopy(stage, firstName, noun = 'pro') {
  const who = firstName || `Your ${noun}`;
  switch (stage) {
    case 'searching':   return `Booking placed. Finding a ${noun}`;
    case 'assigned':    return `${firstName || `A ${noun}`} accepted your booking`;
    case 'on_the_way':  return `${who} started heading to you`;
    case 'arrived':     return `${who} arrived`;
    case 'in_progress': return 'Work started';
    case 'completed':   return 'Completed';
    case 'cancelled':   return 'Booking cancelled';
    case 'failed':      return 'Could not be completed';
    default:            return null;
  }
}

export const fmtTime = (d) => {
  try { return new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }); }
  catch { return ''; }
};

export const firstNameOf = (n) => (n ? String(n).trim().split(/\s+/)[0] : '');
export const shortId = (id) => (id ? String(id).slice(-6).toUpperCase() : '');
export const money = (v) => `₹${Number(v).toLocaleString('en-IN')}`;
export const rupeesOf = (paise) => `₹${Math.round((Number(paise) || 0) / 100).toLocaleString('en-IN')}`;
