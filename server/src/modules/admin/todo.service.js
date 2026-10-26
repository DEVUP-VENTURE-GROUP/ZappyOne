// Admin to-do: what is waiting on a person right now, one count per queue, each linked to its page; an admin sees only the areas their role can read.
const QUEUES = [
  { key: 'verification', label: 'Service applications to review', tab: 'verification', area: 'providers',
    count: () => require('../onboarding/onboarding.model').ProviderEnrolment.countDocuments({ status: 'pending_review' }) },
  { key: 'shop_kyc', label: 'Shop verifications to review', tab: 'shops', area: 'providers',
    count: () => require('../shop/shop.model').countDocuments({ 'kyc.status': 'pending_review' }) },
  { key: 'event_kyc', label: 'Event partner verifications', tab: 'events', area: 'events',
    count: () => require('../events/event-partner.model').countDocuments({ 'kyc.status': 'pending' }) },
  { key: 'appeals', label: 'Appeals to decide', tab: 'appeals', area: 'providers',
    count: () => require('../worker/appeal.model').countDocuments({ status: { $in: ['pending', 'under_review'] } }) },
  { key: 'shop_payouts', label: 'Partner payouts to pay', tab: 'money', area: 'money',
    count: () => require('../shop/shop-payout').ShopPayout.countDocuments({ status: 'requested' }) },
  { key: 'dues_claims', label: 'Dues payments to confirm', tab: 'economics', area: 'money',
    count: () => require('../worker/worker-dues.service').DuesClaim.countDocuments({ status: 'pending' }) },
  { key: 'disputes', label: 'Disputes open', tab: 'helpdesk', area: 'support',
    count: () => require('../dispute/dispute.model').countDocuments({ status: { $in: ['open', 'under_review'] } }) },
  { key: 'tickets', label: 'Support tickets open', tab: 'helpdesk', area: 'support',
    count: () => require('../engagement/support-ticket.model').countDocuments({ status: { $in: ['open', 'in_progress'] } }) },
];

async function forAdmin(admin) {
  const { can } = require('./access/permissions');
  const mine = QUEUES.filter((q) => can(admin, q.area, 'read'));
  // One slow or missing queue never empties the whole list.
  const counts = await Promise.all(mine.map((q) => Promise.resolve().then(q.count).catch(() => null)));
  const items = mine.map((q, i) => ({ key: q.key, label: q.label, tab: q.tab, count: counts[i] })).filter((x) => x.count > 0);
  return { items, total: items.reduce((s, x) => s + x.count, 0) };
}

module.exports = { forAdmin, QUEUES };
