/**
 * Recurring pet care — a schedule that produces bookings (§32).
 *
 * "Walk my dog at 7am, Monday to Friday, for a month" is one decision the
 * customer makes once. Modelling it as thirty separate bookings they must
 * each manage is how a good product becomes a chore.
 *
 * WHY OCCURRENCES ARE REAL BOOKINGS. A generated occurrence IS a PetBooking,
 * pointing back here by `recurringId`. It can be individually skipped,
 * reassigned to a different provider on one day, cancelled, or disputed —
 * exactly like a one-off booking, because from the provider's side that is
 * precisely what it is. A parallel "occurrence" type would need every feature
 * bookings already have.
 *
 * WHY THEY ARE GENERATED IN A ROLLING WINDOW. Materialising a year of walks
 * up front means a year of rows to rewrite every time a customer changes the
 * time, and a year of stale provider assignments. A scheduler creates the
 * next `generateAheadDays` worth and no more.
 */

const mongoose = require('mongoose');
const { pointField, stripEmptyPoints } = require('../../../core/geo/point');

const FREQUENCIES = ['daily', 'alternate_days', 'weekly', 'custom'];

const recurringSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    petIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'PetPassport', default: [] },

    categoryCode: { type: String, required: true, lowercase: true, index: true },
    variantCode: { type: String, required: true, lowercase: true },
    serviceMode: { type: String, required: true },
    addonCodes: { type: [String], default: [] },
    durationMinutes: { type: Number, default: null },

    /** Keeping the same person is most of the value of a recurring booking. */
    preferredWorkerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null },
    preferredShopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },

    frequency: { type: String, enum: FREQUENCIES, required: true },
    /** 0=Sunday … 6=Saturday. Used by `weekly` and `custom`. */
    daysOfWeek: { type: [Number], default: [] },
    /** Local time of day, "07:00" — not a Date, because it repeats. */
    timeOfDay: { type: String, required: true },

    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, default: null },
    /** Alternative to endDate: stop after this many occurrences. */
    totalOccurrences: { type: Number, default: null, min: 1 },

    serviceLocation: pointField({ address: String }),
    customerInstructions: { type: String, default: '', maxlength: 2000 },

    status: {
      type: String,
      enum: ['active', 'paused', 'completed', 'cancelled'],
      default: 'active',
      index: true,
    },

    /* Generation bookkeeping */
    generateAheadDays: { type: Number, default: 14, min: 1, max: 90 },
    /** The last date an occurrence has been created for. */
    generatedThrough: { type: Date, default: null },
    occurrencesCreated: { type: Number, default: 0 },
    occurrencesCompleted: { type: Number, default: 0 },

    /** Dates the customer chose to skip. Stored as YYYY-MM-DD. */
    skippedDates: { type: [String], default: [] },

    packageCode: { type: String, default: null, lowercase: true },
    pausedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

stripEmptyPoints(recurringSchema, ['serviceLocation']);

recurringSchema.index({ status: 1, generatedThrough: 1 });
recurringSchema.index({ userId: 1, status: 1 });

/** `2026-09-17` in local terms — the key skips and duplicate-guards use. */
function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Does the schedule call for a visit on this date? */
recurringSchema.methods.occursOn = function occursOn(date) {
  if (this.skippedDates.includes(dateKey(date))) return false;
  if (date < this.startDate) return false;
  if (this.endDate && date > this.endDate) return false;

  switch (this.frequency) {
    case 'daily':
      return true;
    case 'alternate_days': {
      // Counted from the start date so the rhythm never drifts.
      const days = Math.floor((date - this.startDate) / 86400000);
      return days >= 0 && days % 2 === 0;
    }
    case 'weekly':
    case 'custom':
      return this.daysOfWeek.includes(date.getDay());
    default:
      return false;
  }
};

/**
 * The dates needing an occurrence between now and the generation horizon.
 *
 * Returns dates only — creating the bookings is the service's job, because
 * each one needs pricing, a capacity check and a provider, none of which
 * belong in a model method.
 */
recurringSchema.methods.dueDates = function dueDates(now = new Date()) {
  if (this.status !== 'active') return [];

  const horizon = new Date(now.getTime() + this.generateAheadDays * 86400000);
  const from = this.generatedThrough && this.generatedThrough > now
    ? new Date(this.generatedThrough.getTime() + 86400000)
    : new Date(Math.max(now.getTime(), this.startDate.getTime()));

  const out = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= horizon) {
    if (this.totalOccurrences && this.occurrencesCreated + out.length >= this.totalOccurrences) break;
    if (this.occursOn(cursor)) {
      const [hh, mm] = String(this.timeOfDay || '09:00').split(':').map(Number);
      const at = new Date(cursor);
      at.setHours(hh || 9, mm || 0, 0, 0);
      // A slot already in the past by the time generation runs is skipped
      // rather than created and immediately missed.
      if (at > now) out.push(at);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return out;
};

const PetRecurringBooking = mongoose.model('PetRecurringBooking', recurringSchema);

module.exports = { PetRecurringBooking, FREQUENCIES, dateKey };
