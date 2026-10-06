const mongoose = require('mongoose');

/**
 * Money the customer adds for the provider on top of the price (jobs/boost-tip):
 * a boost while we look for someone, a tip once the job is done. Kept apart
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
  method: { type: String, enum: ['wallet', 'cash'], default: 'wallet' },
  message: { type: String, default: '', maxlength: 200 },
  at: { type: Date, default: null },
}, { _id: false });

module.exports = { boost, tip };
