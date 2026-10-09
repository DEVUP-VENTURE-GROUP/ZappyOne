const mongoose = require('mongoose');

/**
 * Money the customer adds for the provider on top of the price (jobs/boost-tip):
 * a boost while we look for someone, a tip on the bill or after the job. Kept apart
 * from the service price so a re-quote never touches them, and 100% the
 * provider's. Its own file so models load it without the logic.
 */
const boost = new mongoose.Schema({
  paise: { type: Number, default: 0 },
  history: { type: [{ _id: false, paise: Number, at: Date }], default: [] },
  settledAt: { type: Date, default: null },
}, { _id: false });

const tip = new mongoose.Schema({
  paise: { type: Number, default: 0 },
  // with_payment: added to the bill and paid with it (cash or online).
  method: { type: String, enum: ['wallet', 'cash', 'with_payment'], default: 'wallet' },
  message: { type: String, default: '', maxlength: 200 },
  at: { type: Date, default: null },
  settledAt: { type: Date, default: null },
}, { _id: false });

/**
 * Surge on this booking (jobs/surge): busy area, rain, night — each its own
 * line, frozen at booking. Paid with the booking; split at settlement between
 * the provider (providerPaise) and ZappyOne (platformPaise).
 */
const surge = new mongoose.Schema({
  paise: { type: Number, default: 0 },
  // `type` is a field here, so it is spelled as one (a bare `type: String` would make the line a string).
  lines: { type: [new mongoose.Schema({ type: { type: String }, label: String, reason: String, paise: Number }, { _id: false })], default: [] },
  multiplier: { type: Number, default: 1 },
  zone: { type: String, default: '' },
  line: { type: String, default: '' },
  providerPaise: { type: Number, default: 0 },
  platformPaise: { type: Number, default: 0 },
  quoteId: { type: String, default: '' },
  settledAt: { type: Date, default: null },
}, { _id: false });

/** The provider's rating of the customer (jobs/customer-rating). Never shown to the customer. */
const customerRating = new mongoose.Schema({
  stars: { type: Number, min: 1, max: 5 },
  tags: { type: [String], default: [] },
  note: { type: String, default: '', maxlength: 300 },
  at: { type: Date, default: null },
  byRole: { type: String, default: '' },
  by: { type: mongoose.Schema.Types.ObjectId, default: null },
}, { _id: false });

module.exports = { boost, tip, surge, customerRating };
