/**
 * "What's new", shown once per account after an update (account.lastSeenRelease).
 * Bump `id` and rewrite the lists when an update ships; everyone who has used
 * the app before sees it on their next visit. Only list what people can use.
 */
export const RELEASE = {
  id: '2026-11',
  /** Accounts created on or after this date start on this release; it is not news to them. */
  since: '2026-10-30',
  user: [
    ['Tracking, redone', 'See who is coming, how many minutes away, and your start code on one screen.'],
    ['Look before you sign in', 'Browse brands, problems and prices first; sign in only when you book.'],
    ['Late pro, free cancel', 'If your pro misses the promised time, cancelling costs you nothing.'],
    ['Know when it needs longer', 'Your pro tells you when a job needs more time, and why.'],
  ],
  worker: [
    ['Ask for more time', 'Tell the customer the job needs longer, with a reason, from the job screen.'],
    ['Safety check', 'On long visits we check you are safe; one tap answers.'],
    ['Skip a customer', 'After a bad visit, choose not to get jobs from that customer again.'],
    ['Cash not paid', 'If a customer will not pay cash, report it from the job and we follow up.'],
  ],
  shop: [
    ['Ask for more time', 'Your team can tell the customer a job needs longer, with a reason.'],
    ['Safety check', 'On long visits we check your technician is safe.'],
    ['Cash not paid', 'Report a customer who will not pay cash, right from the job.'],
  ],
  // Nothing new for event partners in this release.
  event_partner: [],
};
