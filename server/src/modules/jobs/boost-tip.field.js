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

module.exports = { boost, tip };
