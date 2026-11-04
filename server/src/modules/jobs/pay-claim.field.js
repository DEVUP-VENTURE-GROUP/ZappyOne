// The customer's "I've paid" (jobs/pay-direct): how and when; the pro still confirms it by recording the payment.
module.exports = {
  method: { type: String, enum: ['upi', 'cash'] },
  amountPaise: { type: Number, min: 0 },
  at: { type: Date },
  // The 12-digit UPI reference the customer typed; the pro checks it in their UPI app.
  utr: { type: String, maxlength: 12 },
  // The timed follow-up (jobs/pay-direct sweep): two reminders to the pro, then a UPI payment counts as received.
  remindedAt: { type: Date },
  remindedAgainAt: { type: Date },
  autoReceivedAt: { type: Date },
};
