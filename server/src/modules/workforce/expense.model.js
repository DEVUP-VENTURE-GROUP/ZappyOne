const mongoose = require('mongoose');

/**
 * A fleet expense (workforce/finance): what running a hub or the fleet cost,
 * kept apart from the marketplace's money. A hub's own (rent, electricity) or
 * the whole fleet's (hubId null: uniforms bought centrally). A receipt photo
 * backs each one.
 */
const CATEGORIES = ['rent', 'electricity', 'internet', 'fuel', 'travel', 'tools', 'uniforms', 'parts', 'repairs', 'salary_advance', 'other'];

const expenseSchema = new mongoose.Schema({
  hubId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hub', default: null, index: true },
  category: { type: String, enum: CATEGORIES, required: true },
  amountPaise: { type: Number, required: true, min: 1 },
  day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  note: { type: String, default: '', trim: true, maxlength: 200 },
  receiptKey: { type: String, default: '', maxlength: 300 },
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null }, // a salary advance or travel paid to someone
  createdBy: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.models.FleetExpense || mongoose.model('FleetExpense', expenseSchema);
module.exports.CATEGORIES = CATEGORIES;
