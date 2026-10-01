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

async function providerCard({ workerId, shopId }, { fallbackName = 'Your pro' } = {}) {
  if (!workerId && !shopId) return null;
  const p = workerId
    ? await Worker.findById(workerId).select('name phone rating completedJobs avatar').lean()
    : await Shop.findById(shopId).select('businessName phone rating completedJobs').lean();
  if (!p) return null;
  // A shop's technician is introduced with the shop the customer booked.
  const shop = workerId && shopId ? await Shop.findById(shopId).select('businessName rating').lean() : null;
  return {
    from: shop?.businessName || null,
    name: p.name || p.businessName || fallbackName,
    phone: p.phone || null,
    rating: p.rating || shop?.rating || null,
    completedJobs: p.completedJobs || 0,
    avatar: p.avatar || null,
    kind: workerId ? 'person' : 'shop',
  };
}

module.exports = { providerCard };
