// A partner's own monthly plans and packs (ServicePro), customers' subscriptions to them, and every visit a subscription books.
const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;
const owner = { kind: { type: String, enum: ['shop', 'worker'], required: true }, id: { type: ObjectId, required: true } };
const item = new mongoose.Schema({ repairCode: { type: String, required: true }, brandCode: { type: String, default: null }, name: { type: String, required: true } }, { _id: false });

const planSchema = new mongoose.Schema({
  owner,
  vertical: { type: String, required: true, lowercase: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, default: '', maxlength: 500 },
  // monthly: visits through each month; pack: one visit doing several jobs at a bundle price.
  type: { type: String, enum: ['monthly', 'pack'], required: true },
  items: { type: [item], validate: (v) => v.length > 0 && v.length <= 10 },
  visitsPerMonth: { type: Number, min: 1, max: 31, default: 1 },
  // Days of the week visits fall on (0 Sunday … 6 Saturday); empty means every day.
  weekdays: { type: [Number], default: [] },
  pricePaise: { type: Number, required: true, min: 100 },
  // Off the monthly price for paying for more months at once, set by the partner.
  durations: { type: [{ _id: false, months: { type: Number, enum: [1, 3, 5, 6, 12] }, discountPct: { type: Number, min: 0, max: 40, default: 0 } }], default: [{ months: 1, discountPct: 0 }] },
  pauseDaysPerMonth: { type: Number, min: 0, max: 10, default: 4 },
  // The standard price of the same visits, at the time it was set, so review can judge it.
  referencePaise: { type: Number, default: null },
  status: { type: String, enum: ['draft', 'pending', 'live', 'paused', 'rejected'], default: 'draft', index: true },
  reviewNote: { type: String, default: '' },
}, { timestamps: true });
planSchema.index({ 'owner.kind': 1, 'owner.id': 1, status: 1 });
planSchema.index({ status: 1, updatedAt: 1 });

const subscriptionSchema = new mongoose.Schema({
  userId: { type: ObjectId, required: true, index: true },
  planId: { type: ObjectId, required: true, index: true },
  owner,
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  months: { type: Number, required: true },
  address: { text: { type: String, required: true, maxlength: 300 }, location: { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: { type: [Number], required: true } } },
  timeSlot: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
  startDay: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  endDay: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  monthlyPaise: { type: Number, required: true },
  totalPaise: { type: Number, required: true },
  platformFeePaise: { type: Number, default: 0 },
  commissionPct: { type: Number, default: 0 },
  paymentMethod: { type: String, enum: ['cash'], default: 'cash' },
  // One entry per plan month: what is due, and when the partner confirmed they were paid.
  billing: { type: [{ _id: false, index: Number, fromDay: String, duePaise: Number, paidAt: Date, settled: Boolean }], default: [] },
  pauseDays: { type: [String], default: [] },
  status: { type: String, enum: ['active', 'paused', 'cancelled', 'completed'], default: 'active', index: true },
  cancelledAt: Date,
  cancelReason: { type: String, default: '' },
  idempotencyKey: { type: String, required: true },
}, { timestamps: true });
subscriptionSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
subscriptionSchema.index({ 'owner.kind': 1, 'owner.id': 1, status: 1 });
subscriptionSchema.index({ status: 1, endDay: 1 });

const visitSchema = new mongoose.Schema({
  subscriptionId: { type: ObjectId, required: true, index: true },
  userId: { type: ObjectId, required: true, index: true },
  owner,
  workerId: { type: ObjectId, default: null },
  day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  at: { type: Date, required: true, index: true },
  status: { type: String, enum: ['scheduled', 'started', 'done', 'missed', 'paused', 'cancelled'], default: 'scheduled', index: true },
  startCode: { type: String, required: true },
  startedAt: Date,
  doneAt: Date,
  photoKeys: { type: [String], default: [] },
  note: { type: String, default: '' },
  // A visit the partner missed is made good with an extra one at the end of the plan.
  makeupFor: { type: ObjectId, default: null },
  rating: { stars: { type: Number, min: 1, max: 5 }, comment: { type: String, maxlength: 500 } },
}, { timestamps: true });
visitSchema.index({ subscriptionId: 1, day: 1, makeupFor: 1 }, { unique: true });
visitSchema.index({ 'owner.kind': 1, 'owner.id': 1, day: 1 });
visitSchema.index({ workerId: 1, day: 1 }, { partialFilterExpression: { workerId: { $type: 'objectId' } } });
// The 5-minute sweep reads only visits still scheduled and overdue.
visitSchema.index({ status: 1, at: 1 });

const configSchema = new mongoose.Schema({
  key: { type: String, default: 'main', unique: true },
  // Charged to the customer once per plan month, like the platform fee on a booking.
  platformFeePaise: { type: Number, default: 4900, min: 0 },
  // A plan is live at once when its price per visit is within this band of the standard price; otherwise admin reviews it.
  autoApproveMinPct: { type: Number, default: 25 },
  autoApproveMaxPct: { type: Number, default: 130 },
  bookAheadDays: { type: Number, default: 7, min: 1, max: 30 },
}, { timestamps: true });

module.exports = {
  ServicePlan: mongoose.models.ServicePlan || mongoose.model('ServicePlan', planSchema),
  PlanSubscription: mongoose.models.PlanSubscription || mongoose.model('PlanSubscription', subscriptionSchema),
  PlanVisit: mongoose.models.PlanVisit || mongoose.model('PlanVisit', visitSchema),
  PlanConfig: mongoose.models.PlanConfig || mongoose.model('PlanConfig', configSchema),
};
