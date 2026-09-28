const mongoose = require('mongoose');

// Advertiser credit wallet — topped up via Cashfree, spent per ad event.
const adWalletSchema = new mongoose.Schema({
  advertiserId:   { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  advertiserKind: { type: String, enum: ['event_partner', 'admin', 'external'], default: 'event_partner' },
  advertiserName: String,

  creditsPaise:       { type: Number, default: 0 },  // current balance
  lifetimeTopUpPaise: { type: Number, default: 0 },
  lifetimeSpentPaise: { type: Number, default: 0 },

  // Rolling ledger (last 200 entries)
  ledger: [{
    _id:         false,
    type:        { type: String, enum: ['topup', 'spend', 'refund', 'adjustment'] },
    amountPaise: Number,
    balancePaise:Number,
    adId:        { type: mongoose.Schema.Types.ObjectId },
    ref:         String, // Cashfree order ID for topups
    note:        String,
    at:          { type: Date, default: Date.now },
  }],
}, { timestamps: true });

module.exports = mongoose.model('AdWallet', adWalletSchema);
