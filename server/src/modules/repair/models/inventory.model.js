const mongoose = require('mongoose');

/**
 * Provider-held stock of a Part.
 *
 * Status is derived, never hand-set: it is recomputed from `quantity` against
 * `lowStockThreshold` on every save, so "IN_STOCK with 0 units" cannot exist.
 * The one status a human does control is ON_ORDER, which is why it is stored
 * separately as a flag rather than being an eighth mutually-exclusive state.
 *
 * Reservations exist so two concurrent bookings cannot both claim the last
 * screen: booking reserves, completion consumes, cancellation releases.
 * `available` (quantity - reserved) is what serviceability actually reads.
 */

const STOCK_STATUSES = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'ON_ORDER'];

const inventorySchema = new mongoose.Schema(
  {
    /**
     * Owner of the stock. A provider is a Shop (multi-worker business) or a
     * standalone Worker, so exactly one of these is set.
     */
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null, index: true },
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },

    partId: { type: mongoose.Schema.Types.ObjectId, ref: 'Part', required: true, index: true },
    partSku: { type: String, required: true, uppercase: true, index: true },

    quantity: { type: Number, default: 0, min: 0 },
    /** Units promised to open bookings but not yet consumed. */
    reserved: { type: Number, default: 0, min: 0 },

    lowStockThreshold: { type: Number, default: 2, min: 0 },
    status: { type: String, enum: STOCK_STATUSES, default: 'OUT_OF_STOCK', index: true },
    onOrder: { type: Boolean, default: false },

    /** What this provider actually paid — may differ from Part.costPaise. */
    costPaise: { type: Number, default: 0, min: 0 },

    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    lastRestockedAt: { type: Date, default: null },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

// One stock row per provider per part.
inventorySchema.index({ shopId: 1, partId: 1 }, { unique: true, partialFilterExpression: { shopId: { $type: 'objectId' } } });
inventorySchema.index({ workerId: 1, partId: 1 }, { unique: true, partialFilterExpression: { workerId: { $type: 'objectId' } } });
inventorySchema.index({ partSku: 1, status: 1 });

/** Units that can still be promised to a new booking. */
inventorySchema.virtual('available').get(function available() {
  return Math.max(0, (this.quantity || 0) - (this.reserved || 0));
});

/** Status is a function of stock, so it is recomputed rather than trusted. */
inventorySchema.methods.recomputeStatus = function recomputeStatus() {
  const avail = Math.max(0, (this.quantity || 0) - (this.reserved || 0));
  if (avail <= 0) this.status = this.onOrder ? 'ON_ORDER' : 'OUT_OF_STOCK';
  else if (avail <= (this.lowStockThreshold ?? 0)) this.status = 'LOW_STOCK';
  else this.status = 'IN_STOCK';
  return this.status;
};

inventorySchema.pre('save', function preSave(next) {
  this.recomputeStatus();
  next();
});

inventorySchema.set('toJSON', { virtuals: true });
inventorySchema.set('toObject', { virtuals: true });

const ProviderInventory = mongoose.model('ProviderInventory', inventorySchema);

module.exports = { ProviderInventory, STOCK_STATUSES };
