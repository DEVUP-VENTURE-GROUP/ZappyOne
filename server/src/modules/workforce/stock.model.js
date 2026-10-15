const mongoose = require('mongoose');

/**
 * A hub's stock (the dark store's shelves, workforce/stock.service): parts and
 * supplies its staff take out to jobs. Quantity on hand, the average cost it
 * was bought at, and the level that should trigger a reorder.
 */
const itemSchema = new mongoose.Schema({
  hubId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hub', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  sku: { type: String, default: '', trim: true, maxlength: 40 },
  unit: { type: String, default: 'piece', trim: true, maxlength: 20 },
  qty: { type: Number, default: 0 },
  avgCostPaise: { type: Number, default: 0, min: 0 },
  reorderAt: { type: Number, default: 0, min: 0 },
}, { timestamps: true });
itemSchema.index({ hubId: 1, name: 1 }, { unique: true });

/**
 * Every change to stock, kept: what came in (purchase, from whom, at what
 * cost), what went out (issued to a staff member, for which job) and
 * corrections after a count.
 */
const moveSchema = new mongoose.Schema({
  hubId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hub', required: true, index: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockItem', required: true, index: true },
  type: { type: String, enum: ['purchase', 'issue', 'adjust'], required: true },
  qty: { type: Number, required: true }, // + in, − out
  unitCostPaise: { type: Number, default: 0 },
  supplier: { type: String, default: '', trim: true, maxlength: 80 },
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null },
  jobRef: { type: String, default: '', trim: true, maxlength: 40 },
  note: { type: String, default: '', trim: true, maxlength: 200 },
  day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  by: { type: String, default: null },
}, { timestamps: true });

module.exports = {
  StockItem: mongoose.models.StockItem || mongoose.model('StockItem', itemSchema),
  StockMove: mongoose.models.StockMove || mongoose.model('StockMove', moveSchema),
};
