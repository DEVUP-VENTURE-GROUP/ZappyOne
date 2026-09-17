const mongoose = require('mongoose');

/**
 * Device custody + QA records.
 *
 * When a provider takes a customer's phone away, "we'll bring it back" is not
 * good enough — a dispute two weeks later needs evidence of what the device
 * looked like, who held it, and when it moved. These three models are that
 * evidence chain:
 *
 *   DeviceInspection — condition at a point in time (check-in, pre-repair, post-repair)
 *   DeviceHandover   — a custody transfer, OTP-confirmed by the party giving it up
 *   QAInspection     — functional test results, gating completion
 *
 * Records here are append-only by intent: a later inspection is a new document,
 * never an edit of the earlier one.
 */

const CONDITION_ITEMS = ['screen', 'body', 'back', 'camera', 'buttons', 'ports', 'water_indicator'];

const inspectionPhotoSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    angle: { type: String, default: '' },
    takenAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const conditionNoteSchema = new mongoose.Schema(
  {
    item: { type: String, required: true },
    status: { type: String, enum: ['ok', 'minor_damage', 'major_damage', 'not_applicable'], default: 'ok' },
    note: { type: String, default: '' },
  },
  { _id: false },
);

const deviceInspectionSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'RepairBooking', required: true, index: true },

    /** When in the job this snapshot was taken. */
    stage: {
      type: String,
      enum: ['check_in', 'pre_repair', 'post_repair', 'return'],
      required: true,
      index: true,
    },

    /** Device identity as observed, not as claimed at booking time. */
    imei: { type: String, default: '' },
    serialNumber: { type: String, default: '' },
    observedModel: { type: String, default: '' },

    conditions: { type: [conditionNoteSchema], default: [] },
    accessories: { type: [String], default: [] },
    photos: { type: [inspectionPhotoSchema], default: [] },
    notes: { type: String, default: '' },

    /** Whether the device powers on at all — decides which QA tests are possible. */
    powersOn: { type: Boolean, default: null },

    performedByWorkerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: undefined },
    },
    performedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

deviceInspectionSchema.index({ bookingId: 1, stage: 1, performedAt: -1 });

const deviceHandoverSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'RepairBooking', required: true, index: true },

    /** Direction of the transfer. */
    kind: {
      type: String,
      enum: ['customer_to_worker', 'worker_to_workshop', 'workshop_to_worker', 'worker_to_customer'],
      required: true,
      index: true,
    },

    fromRole: { type: String, enum: ['customer', 'worker', 'shop'], required: true },
    toRole: { type: String, enum: ['customer', 'worker', 'shop'], required: true },
    fromId: { type: mongoose.Schema.Types.ObjectId, default: null },
    toId: { type: mongoose.Schema.Types.ObjectId, default: null },

    inspectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeviceInspection', default: null },

    /**
     * OTP proves the handover happened with the other party present. Stored
     * hashed-at-rest is overkill for a 6-digit short-lived code, but the
     * verification flag is what the state machine actually reads.
     */
    otpVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },

    signatureUrl: { type: String, default: '' },
    photos: { type: [inspectionPhotoSchema], default: [] },
    notes: { type: String, default: '' },

    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: undefined },
    },
    occurredAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

deviceHandoverSchema.index({ bookingId: 1, occurredAt: -1 });

const qaResultSchema = new mongoose.Schema(
  {
    itemCode: { type: String, required: true },
    label: { type: String, required: true },
    required: { type: Boolean, default: true },
    result: { type: String, enum: ['pass', 'fail', 'not_applicable', 'not_tested'], default: 'not_tested' },
    note: { type: String, default: '' },
  },
  { _id: false },
);

const qaInspectionSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'RepairBooking', required: true, index: true },
    stage: { type: String, enum: ['before', 'after'], required: true, index: true },

    checklistCode: { type: String, default: '' },
    results: { type: [qaResultSchema], default: [] },

    /** Derived on save — a single failed REQUIRED item blocks completion (§27). */
    passed: { type: Boolean, default: false, index: true },
    failedRequiredCount: { type: Number, default: 0 },

    photos: { type: [inspectionPhotoSchema], default: [] },
    notes: { type: String, default: '' },

    performedByWorkerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null },
    performedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

qaInspectionSchema.index({ bookingId: 1, stage: 1, performedAt: -1 });

/** Pass/fail is computed, never supplied by the client. */
qaInspectionSchema.methods.recomputeOutcome = function recomputeOutcome() {
  const failed = (this.results || []).filter((r) => r.required && r.result === 'fail');
  const untested = (this.results || []).filter((r) => r.required && r.result === 'not_tested');
  this.failedRequiredCount = failed.length;
  this.passed = failed.length === 0 && untested.length === 0;
  return this.passed;
};

qaInspectionSchema.pre('save', function preSave(next) {
  this.recomputeOutcome();
  next();
});

const DeviceInspection = mongoose.model('DeviceInspection', deviceInspectionSchema);
const DeviceHandover = mongoose.model('DeviceHandover', deviceHandoverSchema);
const QAInspection = mongoose.model('QAInspection', qaInspectionSchema);

module.exports = { DeviceInspection, DeviceHandover, QAInspection, CONDITION_ITEMS };
