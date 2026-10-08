const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const appealSchema = new mongoose.Schema(
  {
    // A worker's appeal or a shop's: exactly one of these is set.
    workerId:   { type: ObjectId, ref: 'Worker', default: null, index: true },
    shopId:     { type: ObjectId, ref: 'Shop', default: null, index: true },
    type:       { type: String, enum: ['rating', 'penalty', 'cancellation', 'order_issue', 'pause', 'dues', 'verification'], required: true },
    // The booking it is about, of any kind (repair, pet, helping); orderId kept for older appeals.
    orderId:    { type: ObjectId, ref: 'Order', default: null },
    jobRef:     { type: String, default: '', maxlength: 40 },
    subject:    { type: String, required: true, maxlength: 200 },
    description:{ type: String, required: true, maxlength: 2000 },
    status:     { type: String, enum: ['pending', 'under_review', 'upheld', 'dismissed'], default: 'pending', index: true },
    // Resolution
    adminNote:  { type: String, maxlength: 1000 },
    resolvedBy: { type: ObjectId, ref: 'Admin', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

appealSchema.index({ workerId: 1, createdAt: -1 });

module.exports = mongoose.model('WorkerAppeal', appealSchema);
