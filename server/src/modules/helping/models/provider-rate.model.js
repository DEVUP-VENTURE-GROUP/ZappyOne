const mongoose = require('mongoose');

// A helper's own rates for one kind of errand: ZappyOne sets no helping price, only its platform fee, tax and commission (helping/services/pricing).
const rateSchema = new mongoose.Schema({
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null },
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  serviceType: { type: String, required: true, lowercase: true },
  baseFeePaise: { type: Number, required: true, min: 100 },
  perKmPaise: { type: Number, default: 0, min: 0 },
  includedKm: { type: Number, default: 0, min: 0 },
  waitingPerMinutePaise: { type: Number, default: 0, min: 0 },
  extraStopPaise: { type: Number, default: 0, min: 0 },
  specialHandlingPaise: { type: Number, default: 0, min: 0 },
}, { timestamps: true });
rateSchema.index({ workerId: 1, serviceType: 1 }, { unique: true, partialFilterExpression: { workerId: { $type: 'objectId' } } });
rateSchema.index({ shopId: 1, serviceType: 1 }, { unique: true, partialFilterExpression: { shopId: { $type: 'objectId' } } });

module.exports = mongoose.models.HelpingProviderRate || mongoose.model('HelpingProviderRate', rateSchema);
