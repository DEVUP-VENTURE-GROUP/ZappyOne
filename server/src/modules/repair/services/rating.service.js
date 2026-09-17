const Worker = require('../../worker/worker.model');
const Shop = require('../../shop/shop.model');

/**
 * Fold a finished repair's rating into the provider's running average.
 *
 * The same rolling formula the order flow uses — `(avg × (n−1) + new) / n` —
 * rather than a second way of computing the same number. A provider's rating is
 * what the matcher ranks on and what the customer reads on the provider card,
 * so two formulas would mean two different truths about the same person.
 *
 * A repair can belong to a SHOP rather than to one technician, which orders
 * never have to handle: the shop carries the reputation, because the customer
 * chose the shop and the shop decided who held the screwdriver.
 */
async function applyRepairRating({ workerId, shopId, rating }) {
  if (!rating) return { updated: false, reason: 'no_rating' };

  // The shop owns the relationship when it holds the booking.
  const target = shopId
    ? { model: Shop, id: shopId }
    : workerId
      ? { model: Worker, id: workerId }
      : null;

  if (!target) return { updated: false, reason: 'no_provider' };

  const doc = await target.model.findById(target.id).select('rating reviewCount completedJobs');
  if (!doc) return { updated: false, reason: 'not_found' };

  /**
   * Count ratings, not jobs.
   *
   * The order flow divides by `completedJobs`, which quietly assumes every job
   * gets rated — it does not, so an unrated job drags the average toward the
   * next rating far harder than it should. `reviewCount` is the honest divisor
   * because it counts exactly the opinions being averaged.
   */
  const previous = doc.reviewCount || 0;
  const next = previous + 1;
  const average = previous === 0
    ? rating
    : ((doc.rating || 0) * previous + rating) / next;

  doc.rating = Number(average.toFixed(2));
  doc.reviewCount = next;
  await doc.save();

  return { updated: true, rating: doc.rating, reviewCount: next };
}

module.exports = { applyRepairRating };
