// The customer's "I've paid" (jobs/pay-direct): how and when; the pro still confirms it by recording the payment.
module.exports = {
  method: { type: String, enum: ['upi', 'cash'] },
  amountPaise: { type: Number, min: 0 },
  at: { type: Date },
  // The timed follow-up (jobs/pay-direct sweep): when the pro was reminded, and when ZappyOne was called in.
  remindedAt: { type: Date },
  escalatedAt: { type: Date },
};
