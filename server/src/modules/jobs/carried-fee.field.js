const mongoose = require('mongoose');

/**
 * An earlier cancellation fee riding on this booking (jobs/cancel-fee): its own
 * line on the bill, paid with the booking, and put in the shield fund when the
 * booking settles. Kept apart from the service price so a re-quote never
 * touches it. Its own file so models can load it without the fee logic.
 */
module.exports = new mongoose.Schema({
  paise: { type: Number, default: 0 },
  recordIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  from: { type: Date, default: null },
  settledAt: { type: Date, default: null },
}, { _id: false });
