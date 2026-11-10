// A booking's status in its own words, for the website and the app alike: header label and what is happening now. Words come from the service (repairBasket termsOf).
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The customer's start code card, in the service's own words (a bike wash is not a repair).
export const startCodeCopy = (terms = {}) => ({
  title: 'Your code to start',
  hint: `Give these 4 numbers to your ${terms.pro || 'pro'} when they are with you. They need them to start.`,
});

export function repairStatus(status, terms = {}) {
  const pro = terms.pro || 'technician';
  const job = terms.job || 'repair';
  const Pro = cap(pro);
  const Job = cap(job);
  // A packaged service is done where the customer is: no device, no workshop, no tests.
  const visit = !!terms.packaged;
  const T = {
    PENDING: ['Booking placed', 'Waiting for confirmation.'],
    CONFIRMED: ['Confirmed', `Finding a ${pro} for you.`],
    PROVIDER_ASSIGNED: [`${Pro} assigned`, 'Waiting for them to accept.'],
    WORKER_ACCEPTED: [`${Pro} accepted`, 'They will be on their way shortly.'],
    ON_THE_WAY: ['On the way', `Your ${pro} is travelling to you.`],
    ARRIVED: ['Arrived', `Your ${pro} has arrived.`],
    DIAGNOSING: ['Diagnosing', 'Inspecting your device.'],
    QUOTE_PENDING: ['Preparing quote', `Your ${pro} is writing up the quote.`],
    CUSTOMER_APPROVAL_PENDING: ['Your approval needed', 'Review the quote below to continue.'],
    APPROVED: ['Quote approved', 'Work can now begin.'],
    PICKUP_SCHEDULED: ['Pickup scheduled', 'We will collect your device.'],
    DEVICE_PICKED_UP: ['Device collected', 'On its way to the workshop.'],
    AT_WORKSHOP: ['At workshop', 'Your device has arrived at the workshop.'],
    REPAIR_IN_PROGRESS: [`${Job} in progress`, visit ? `Your ${pro} is on it.` : 'Work is underway.'],
    QA_PENDING: ['Final checks', visit ? `Your ${pro} is finishing up.` : `Running post-${job} tests.`],
    READY_FOR_RETURN: ['Ready for return', 'Repaired and ready to come back.'],
    OUT_FOR_RETURN: ['Out for return', 'On its way back to you.'],
    COMPLETED: ['Completed', `${Job} finished.`],
    CANCELLED: ['Cancelled', ''],
    REJECTED: ['Quote rejected', 'No work was carried out.'],
    EXPIRED: ['Expired', ''],
    FAILED: ['Could not complete', ''],
  };
  const [label, hint] = T[status] || [String(status || '').replace(/_/g, ' ').toLowerCase(), ''];
  return { label, hint };
}
