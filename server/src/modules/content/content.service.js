const Content = require('./content.model');
const logger = require('../../core/logger');

/**
 * Default content seeded ONCE if the collection is empty. This only populates
 * the database with a starting point — admins edit/replace all of it from the
 * panel, and the client always reads from the DB (nothing hardcoded client-side).
 */
const DEFAULT_FAQS = [
  { category: 'Bookings', order: 1, question: 'How do I book a service?', answer: 'Pick a service from the home screen, confirm your location, review the price and ETA, then tap Book. A nearby verified pro is assigned automatically.' },
  { category: 'Bookings', order: 2, question: 'Can I schedule a booking for later?', answer: 'Yes. On the booking screen choose "Schedule" and pick a date and time. We start looking for a pro shortly before your slot.' },
  { category: 'Bookings', order: 3, question: 'What happens if no worker is available?', answer: "If we can't find a pro within a short window, the order is cancelled automatically and any prepaid amount is refunded to your wallet. You can try again anytime." },
  { category: 'Payments', order: 1, question: 'What payment methods are supported?', answer: 'You can pay by UPI, card, cash, or your Zappy wallet balance. Choose your method during checkout.' },
  { category: 'Payments', order: 2, question: 'How do refunds work?', answer: 'Eligible refunds are credited to your Zappy wallet, usually instantly. See our Refund Policy for full details.' },
  { category: 'Cancellations', order: 1, question: 'How do I cancel a booking?', answer: "Open the order and tap Cancel. A cancellation fee may apply depending on how far the pro has progressed — you'll see the exact amount before you confirm." },
  { category: 'Safety & Trust', order: 1, question: 'Are the workers verified?', answer: 'Every pro completes KYC verification before they can accept jobs. You can see their rating and completed-job count on the tracking screen.' },
  { category: 'Warranty', order: 1, question: 'Is my service covered by warranty?', answer: "Many repair services include a service warranty. If a covered issue recurs within the warranty period, we'll re-service it. See the Warranty Guidelines for what's covered." },
];

const DEFAULT_POLICIES = [
  {
    slug: 'refund-policy',
    title: 'Refund Policy',
    body: [
      'We want every booking to go smoothly. This policy explains when and how refunds are issued.',
      '',
      '1. No worker found — If we cannot assign a pro in time and the order is auto-cancelled, any amount you paid is refunded in full to your Zappy wallet.',
      '2. You cancel before the pro starts — If you cancel before service begins, you are refunded minus any applicable cancellation fee shown at the time of cancellation.',
      '3. Worker cancels / no-show — If the pro cancels or does not arrive, you are not charged, and any prepaid amount is refunded in full.',
      '4. Service quality issues — If a completed job has a problem covered by warranty, we re-service it first. Where re-service is not possible, a partial or full refund may be issued after review.',
      '',
      'Refunds are credited to your Zappy wallet, typically instantly. Wallet balance can be used for future bookings. For disputes, open a ticket from Help & Support.',
    ].join('\n'),
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    body: [
      'Your privacy matters to us. This summary explains what we collect and why.',
      '',
      'Information we collect: your name and phone number, your service location, booking history, and device information needed to deliver the service.',
      'How we use it: to match you with nearby pros, process payments, provide support, and improve the service.',
      'Sharing: we share only the details a pro needs to complete your job (such as your location and contact for the active order). We do not sell your personal data.',
      'Your controls: you can update your profile, manage saved addresses, and request account deletion from the app.',
      '',
      'For any privacy questions, contact us through Help & Support.',
    ].join('\n'),
  },
  {
    slug: 'warranty-guidelines',
    title: 'Warranty Guidelines',
    body: [
      'Select repair services come with a service warranty for your peace of mind.',
      '',
      "What's covered: the specific fault that was repaired. If the same issue recurs within the warranty period, we will re-service it at no additional labour cost.",
      "What's not covered: new/unrelated faults, physical or liquid damage after the service, issues caused by third-party repairs, and normal wear of consumable parts.",
      'Warranty period: shown on your booking and invoice. It starts from the service completion date.',
      'How to claim: open the completed order, tap the warranty option, and describe the issue. A pro will be assigned to inspect and re-service under warranty.',
      '',
      'Warranty terms may vary by service and parts used. The exact period is always shown before you book.',
    ].join('\n'),
  },
];

let _seeded = false;

/** Idempotent one-time seed — only inserts when the collection is empty. */
async function ensureSeeded() {
  if (_seeded) return;
  try {
    const count = await Content.estimatedDocumentCount();
    if (count === 0) {
      await Content.insertMany([
        ...DEFAULT_FAQS.map((f) => ({ type: 'faq', ...f, audience: 'all', isActive: true })),
        ...DEFAULT_POLICIES.map((p) => ({ type: 'policy', ...p, audience: 'all', isActive: true })),
      ], { ordered: false });
      logger.info('[CONTENT] Seeded default FAQs + policy pages');
    }
    _seeded = true;
  } catch (err) {
    // Duplicate-key from a concurrent seed is fine; anything else is non-fatal.
    if (err.code !== 11000) logger.warn({ err: err.message }, '[CONTENT] Seed skipped');
    _seeded = true;
  }
}

/** Public: active FAQs grouped by category, ordered. */
async function listFaqs({ audience } = {}) {
  await ensureSeeded();
  const filter = { type: 'faq', isActive: true };
  if (audience) filter.audience = { $in: [audience, 'all'] };
  const faqs = await Content.find(filter)
    .select('question answer category order')
    .sort({ category: 1, order: 1, createdAt: 1 })
    .lean();

  const groups = new Map();
  for (const f of faqs) {
    const key = f.category || 'General';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: String(f._id), question: f.question, answer: f.answer });
  }
  return Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
}

/** Public: a single active policy page by slug. */
async function getPolicy(slug) {
  await ensureSeeded();
  const doc = await Content.findOne({ type: 'policy', slug: String(slug).toLowerCase(), isActive: true })
    .select('slug title body updatedAt')
    .lean();
  if (!doc) return null;
  return { slug: doc.slug, title: doc.title, body: doc.body, updatedAt: doc.updatedAt };
}

/** Public: list of active policy pages (slug + title) — used for footer/menus. */
async function listPolicies() {
  await ensureSeeded();
  return Content.find({ type: 'policy', isActive: true })
    .select('slug title')
    .sort({ order: 1, title: 1 })
    .lean()
    .then((docs) => docs.map((d) => ({ slug: d.slug, title: d.title })));
}

module.exports = { ensureSeeded, listFaqs, getPolicy, listPolicies };
