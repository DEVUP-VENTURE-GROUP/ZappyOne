const { ProviderInventory } = require('../../models/inventory.model');

/** Part stock for a booking: reserve on booking, release if it falls through, consume on completion. */

/**
 * Reserve one unit atomically. The filter itself asserts availability, so the
 * check and the write cannot drift apart under concurrency.
 */
async function reserveStock({ shopId, workerId, partId, session = null }) {
  if (!partId) return { reserved: false, needed: false };
  const owner = shopId ? { shopId } : { workerId };

  const res = await ProviderInventory.findOneAndUpdate(
    { ...owner, partId, $expr: { $gt: [{ $subtract: ['$quantity', '$reserved'] }, 0] } },
    { $inc: { reserved: 1 } },
    { new: true, ...(session ? { session } : {}) },
  );

  if (!res) return { reserved: false, needed: true };
  // Keep the derived status honest after a raw $inc.
  res.recomputeStatus();
  await res.save({ ...(session ? { session } : {}) });
  return { reserved: true, needed: true, inventoryId: res._id };
}

/** Release a reservation that never became a completed job. */
async function releaseStock({ shopId, workerId, partId }) {
  if (!partId) return;
  const owner = shopId ? { shopId } : { workerId };
  const res = await ProviderInventory.findOneAndUpdate(
    { ...owner, partId, reserved: { $gt: 0 } },
    { $inc: { reserved: -1 } },
    { new: true },
  );
  if (res) { res.recomputeStatus(); await res.save(); }
}

/** Consume a reservation on completion — stock leaves the shelf for good. */
async function consumeStock({ shopId, workerId, partId }) {
  if (!partId) return;
  const owner = shopId ? { shopId } : { workerId };
  const res = await ProviderInventory.findOneAndUpdate(
    { ...owner, partId, quantity: { $gt: 0 }, reserved: { $gt: 0 } },
    { $inc: { quantity: -1, reserved: -1 } },
    { new: true },
  );
  if (res) { res.recomputeStatus(); await res.save(); }
}

module.exports = {
  reserveStock,
  releaseStock,
  consumeStock,
};
