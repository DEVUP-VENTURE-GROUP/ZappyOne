// What a ServicePro partner must fill in before their dashboard opens: one rule per kind of account, decided here so every app shows the same list. Each missing item says where in ServicePro it is filled.
const SUBMITTED = (s) => !!s && s !== 'not_submitted' && s !== 'rejected';
const filled = (v, min = 1) => typeof v === 'string' ? v.trim().length >= min : v != null && v !== '';

const RULES = {
  shop: (p) => [
    ['businessName', 'Business name', filled(p.businessName, 2), '/shop/profile'],
    ['ownerName', 'Owner name', filled(p.ownerName, 2), '/shop/profile'],
    ['email', 'Email for receipts and notices', filled(p.email, 5), '/shop/account'],
    ['address', 'Address and map pin', filled(p.address?.text, 5) && p.address?.location?.coordinates?.length === 2, '/shop/profile'],
    ['photo', 'Storefront or work photo', filled(p.coverImageUrl), '/shop/profile'],
    ['hours', 'Working hours', (p.hours || []).length > 0, '/shop/profile'],
    ['bio', 'About your work (30 letters or more)', filled(p.bio, 30), '/shop/profile'],
    ['years', 'Years in this work', Number.isFinite(p.yearsActive) && p.yearsActive >= 0, '/shop/profile'],
    ['kyc', 'Identity documents sent for verification', SUBMITTED(p.kyc?.status), '/shop/kyc'],
  ],
  event_partner: (p) => [
    ['businessName', 'Business name', filled(p.businessName, 2), '/partner/profile'],
    ['ownerName', 'Owner name', filled(p.ownerName, 2), '/partner/profile'],
    ['cities', 'Cities you serve', (p.cities || []).length > 0, '/partner/profile'],
    ['photo', 'Business photo', filled(p.profilePhotoKey), '/partner/profile'],
    ['bio', 'About your work (30 letters or more)', filled(p.bio, 30), '/partner/profile'],
    ['years', 'Years of experience', Number.isFinite(p.yearsExperience) && p.yearsExperience >= 0, '/partner/profile'],
    ['kyc', 'Identity documents sent for verification', SUBMITTED(p.kyc?.status), '/partner/profile'],
  ],
  worker: (p) => [
    ['name', 'Your name', filled(p.name, 2), '/worker/profile'],
    ['photo', 'Your photo', filled(p.profilePhotoKey), '/worker/profile'],
    ['kyc', 'Identity documents sent for verification', SUBMITTED(p.kyc?.status), '/worker/kyc'],
  ],
};

const FIELDS = {
  shop: 'businessName ownerName email address hours coverImageUrl bio yearsActive kyc.status',
  event_partner: 'businessName ownerName cities profilePhotoKey bio yearsExperience kyc.status',
  worker: 'name profilePhotoKey kyc.status',
};

async function profileStatus(role, id) {
  const Model = role === 'shop' ? require('../shop/shop.model') : role === 'event_partner' ? require('../events/event-partner.model') : require('../worker/worker.model');
  if (!RULES[role]) return { complete: true, missing: [], total: 0 };
  const doc = await Model.findById(id).select(FIELDS[role]).lean();
  const items = RULES[role](doc || {});
  const missing = items.filter(([, , done]) => !done).map(([key, label, , path]) => ({ key, label, path }));
  return { complete: missing.length === 0, missing, total: items.length };
}

// A shop's road from sign-up to taking work, so the home can say what is done, what waits on ZappyOne and what to do next. Each step reads the same records the matching gate reads.
async function setupJourney(shopId) {
  const { ProviderEnrolment } = require('./onboarding.model');
  const { ProviderPricing } = require('../repair/models/pricing.model');
  const { ProviderServiceArea } = require('../repair/models/config.model');
  const Shop = require('../shop/shop.model');
  const { isLive, LIVE_FIELDS } = require('../shop/shop.service');
  const [profile, enrolments, priced, area, shop] = await Promise.all([
    profileStatus('shop', shopId),
    ProviderEnrolment.find({ shopId }).select('status').lean(),
    ProviderPricing.exists({ shopId, isActive: { $ne: false } }),
    ProviderServiceArea.exists({ shopId }),
    Shop.findById(shopId).select(`${LIVE_FIELDS} kyc.status`).lean(),
  ]);
  const has = (st) => enrolments.some((e) => st.includes(e.status));
  const steps = [
    { key: 'profile', label: 'Profile complete', done: profile.complete, path: profile.missing[0]?.path || '/shop/profile' },
    { key: 'services', label: 'Choose your services', done: has(['pending_review', 'approved']), path: '/provider/onboarding' },
    { key: 'approved', label: 'ZappyOne checks your documents', done: has(['approved']) && shop?.kyc?.status === 'approved', waiting: (!has(['approved']) && has(['pending_review'])) || shop?.kyc?.status === 'pending_review', path: '/provider/onboarding' },
    { key: 'prices', label: 'Set your work and prices', done: !!priced, path: '/provider/services' },
    { key: 'area', label: 'Where you work', done: !!area, path: '/provider/services' },
  ];
  const live = isLive(shop);
  const next = steps.find((st) => !st.done && !st.waiting) || null;
  return { live, steps, next, done: steps.filter((st) => st.done).length, total: steps.length };
}

module.exports = { profileStatus, setupJourney, RULES };
