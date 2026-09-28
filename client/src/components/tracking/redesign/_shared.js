/* Shared constants + utils for the redesigned tracking screen */

// Service-agnostic lifecycle steps.
// key must match `order.status` values from the server (see order.model.js).
export const STEPS = [
  { key: 'searching',   label: 'Finding your technician', desc: 'Matching you with the best nearby pro' },
  { key: 'assigned',    label: 'Technician assigned',     desc: 'A pro has accepted your request' },
  { key: 'on_the_way',  label: 'On the way to you',       desc: 'Your technician is heading over' },
  { key: 'arrived',     label: 'Arrived at your location',desc: 'Your technician has reached you' },
  { key: 'in_progress', label: 'Service in progress',     desc: 'Your service is being completed' },
  { key: 'completed',   label: 'Service completed',       desc: 'All done — thanks for using Zappy' },
];

// Live-status pill copy — { label, live: is-dot-pulsing }
export const STATUS_PILL = {
  created:     { label: 'Finding worker', live: true },
  searching:   { label: 'Finding worker', live: true },
  assigned:    { label: 'Worker assigned',live: true },
  on_the_way:  { label: 'On the way',     live: true },
  arrived:     { label: 'Arrived',        live: true },
  in_progress: { label: 'In service',     live: true },
  completed:   { label: 'Completed',      live: false },
  cancelled:   { label: 'Cancelled',      live: false },
  failed:      { label: 'No workers',     live: false },
};

// Grounded, service-agnostic activity-feed copy per status.
// Returns null if this status shouldn't create a feed entry.
export function feedCopy(statusKey, firstName) {
  switch (statusKey) {
    case 'created':     return 'Order placed — searching for a technician';
    case 'searching':   return 'Searching nearby technicians…';
    case 'assigned':    return `${firstName || 'A technician'} accepted your request`;
    case 'on_the_way':  return `${firstName || 'Your technician'} started heading to you`;
    case 'arrived':     return `${firstName || 'Your technician'} arrived at your location`;
    case 'in_progress': return 'Service started';
    case 'completed':   return 'Service completed';
    case 'cancelled':   return 'Order cancelled';
    case 'failed':      return 'No technicians available right now';
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
