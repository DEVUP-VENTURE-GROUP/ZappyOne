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

  // Counted in one atomic step, so ratings landing together are never lost.
  const doc = await target.model.findOneAndUpdate({ _id: target.id }, averagePipeline('rating', 'reviewCount', rating), { new: true }).select('rating reviewCount').lean();
  if (!doc) return { updated: false, reason: 'not_found' };
  return { updated: true, rating: doc.rating, reviewCount: doc.reviewCount };
}

// Running average over ratings (not jobs: an unrated job must not drag it), as one update pipeline.
function averagePipeline(avgField, countField, stars) {
  const count = { $ifNull: ['$' + countField, 0] };
  const avg = { $ifNull: ['$' + avgField, 0] };
  return [{ $set: {
    [avgField]: { $round: [{ $divide: [{ $add: [{ $multiply: [avg, count] }, stars] }, { $add: [count, 1] }] }, 2] },
    [countField]: { $add: [count, 1] },
  } }];
}

module.exports = { applyRepairRating, averagePipeline };
