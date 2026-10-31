// A service the customer added after booking; already inside the booking's totals and paid in cash at the end.
module.exports = [{
  _id: false,
  code: { type: String, required: true, lowercase: true },
  name: { type: String, default: '' },
  petIndex: { type: Number, default: null },
  pricePaise: { type: Number, required: true, min: 0 },
  taxPaise: { type: Number, default: 0, min: 0 },
  addedAt: { type: Date, default: Date.now },
}];
