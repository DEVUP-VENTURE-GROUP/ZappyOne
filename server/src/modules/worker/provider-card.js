/**
 * Who is coming, for the person waiting at the door.
 *
 * Only what a customer legitimately needs: a name, a rating, and a number to
 * ring. Never the provider's own address or id.
 *
 * Callers decide when a provider is "introduced": before the job is accepted
 * the assignment can still move, and naming someone who never turns up is
 * worse than naming nobody.
 */
const Worker = require('./worker.model');
const Shop = require('../shop/shop.model');

const { shortName } = require('../jobs/privacy');

/**
 * `active: false` once the job is over: the customer keeps who did it and how
 * they rated, but the number is no longer handed out (jobs/privacy).
 */
async function providerCard({ workerId, shopId }, { fallbackName = 'Your pro', active = true } = {}) {
  if (!workerId && !shopId) return null;
  const p = workerId
    ? await Worker.findById(workerId).select('name phone rating reviewCount completedJobs avatar').lean()
    : await Shop.findById(shopId).select('businessName phone rating reviewCount completedJobs').lean();
  if (!p) return null;
  // A shop's technician is introduced with the shop the customer booked.
  const shop = workerId && shopId ? await Shop.findById(shopId).select('businessName rating reviewCount').lean() : null;
  // No ratings yet reads as "new", never a default five stars.
  const rated = p.reviewCount ? p.rating : shop?.reviewCount ? shop.rating : null;
  return {
    from: shop?.businessName || null,
    // A person is introduced by first name and initial; a shop by its name.
    name: p.businessName || shortName(p.name, fallbackName),
    phone: active ? p.phone || null : null,
    rating: rated || null,
    completedJobs: p.completedJobs || 0,
    avatar: p.avatar || null,
    kind: workerId ? 'person' : 'shop',
  };
}

module.exports = { providerCard };
