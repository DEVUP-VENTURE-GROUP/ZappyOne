// Jobs left at the customer's door: 12 hours "arrived" with no step forward means nobody is doing it, so it is closed, not left in the queue forever.
// Only the at-the-door status: it cannot be a booking for later, and workshop work that takes days is never touched.
const logger = require('../../core/logger');

const ABANDON_AFTER_HOURS = 12;
const REASON = 'No progress for 12 hours after the pro arrived';

const since = (doc) => new Date((doc.statusHistory || []).at(-1)?.at || doc.updatedAt || doc.createdAt);

// Each kind closes through its own path, so notices, refunds and the pro's state are what a person closing it would get.
const RULES = {
  repair: {
    model: () => require('../repair/models/booking.model').RepairBooking,
    status: 'ARRIVED',
    // A paid repair may need a refund: left for a person.
    eligible: (doc) => doc.paymentStatus !== 'paid',
    close: (doc) => require('../repair/services/booking.service').transition(doc._id, 'FAILED', { actorRole: 'system', actorId: null, reason: REASON }),
  },
  pet: {
    model: () => require('../pet/models/booking.model').PetBooking,
    status: 'PROVIDER_ARRIVED',
    eligible: () => true,
    close: (doc) => require('../pet/services/booking.service').cancelBooking({ bookingId: doc._id, actorId: null, by: 'admin', reason: REASON }),
  },
  helping: {
    model: () => require('../helping/models/task.model').HelpingTask,
    status: 'ARRIVED',
    eligible: () => true,
    close: async (doc) => {
      const Task = require('../helping/models/task.model').HelpingTask;
      const task = await Task.findById(doc._id);
      return require('./cancel-fee').cancelHelping({ task, byRole: 'admin', actorId: null, reason: REASON });
    },
  },
};

async function sweep({ now = Date.now() } = {}) {
  const cutoff = new Date(now - ABANDON_AFTER_HOURS * 3600 * 1000);
  const closed = [];
  for (const [kind, rule] of Object.entries(RULES)) {
    // updatedAt is at least as late as the last status change, so it narrows the read before the exact check.
    const docs = await rule.model().find({ status: rule.status, updatedAt: { $lt: cutoff } })
      .select('_id reference status statusHistory updatedAt createdAt paymentStatus').limit(50).lean();
    for (const doc of docs) {
      if (since(doc) > cutoff || !rule.eligible(doc)) continue;
      try {
        await rule.close(doc);
        closed.push(`${kind}:${doc.reference || doc._id}`);
        logger.info({ kind, id: String(doc._id), reference: doc.reference }, '[abandoned] closed a job left at the door');
      } catch (err) {
        logger.warn({ kind, id: String(doc._id), err: err.message }, '[abandoned] could not close');
      }
    }
  }
  return { closed };
}

module.exports = { sweep, ABANDON_AFTER_HOURS, RULES };
