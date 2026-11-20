// Moves the old events engine onto the one store engine: each event partner becomes a shop on the Events line, each live setup a menu item, each booking a job.
// Dry run by default (reports, writes nothing); apply: true writes. Safe to run again: partners match by phone, setups by name, bookings by their old id.
const logger = require('../../core/logger');

const LINE = 'event_decoration';
const DOMAIN = 'events';
const TYPE = 'evedec_one';
const FALLBACK_JOB = 'evedec_birthday';

// Old booking status to the job status it continues from.
const STATUS = {
  pending_payment: 'PROVIDER_ASSIGNED', confirmed: 'PROVIDER_ASSIGNED', partner_assigned: 'WORKER_ACCEPTED',
  in_progress: 'REPAIR_IN_PROGRESS', completed: 'COMPLETED', cancelled: 'CANCELLED', disputed: 'FAILED',
};
const KYC = { not_submitted: 'not_submitted', pending: 'pending_review', approved: 'approved', rejected: 'rejected' };
const ENROLMENT = { approved: 'approved', pending: 'pending_review', rejected: 'rejected', not_submitted: 'draft' };

const models = () => ({
  EventPartner: require('./event-partner.model'),
  EventTheme: require('./event-theme.model'),
  EventBooking: require('./event-booking.model'),
  Shop: require('../shop/shop.model'),
  ProviderEnrolment: require('../onboarding/onboarding.model').ProviderEnrolment,
  RepairBooking: require('../repair/models/booking.model').RepairBooking,
});

// "10:00 AM" on the event day, as one moment (IST).
function startOf(date, slot) {
  const d = new Date(date);
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(slot || '').trim());
  if (!m) return d;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  const ist = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, Number(m[2])) - 330 * 60000);
  return Number.isNaN(ist.getTime()) ? d : ist;
}

// The shop an event partner becomes: same sign-in phone, business, KYC state and push tokens.
function shopFields(p) {
  const kyc = p.kyc || {};
  return {
    businessName: p.businessName, ownerName: p.ownerName || p.businessName, phone: p.phone, email: p.email || undefined,
    isActive: p.isActive !== false && !p.isBlocked && !p.suspendedAt,
    kyc: { status: KYC[kyc.status] || 'not_submitted', ownerIdUrl: kyc.aadharFront || kyc.panCard, selfieUrl: kyc.liveSelfie, selfieMetadata: kyc.liveSelfieMeta || undefined },
    bio: p.bio || undefined, deviceTokens: p.deviceTokens || [], nativeTokens: p.nativeTokens || [],
  };
}

async function partnerToShop(p, { apply, report }) {
  const { Shop, ProviderEnrolment } = models();
  let shop = p.phone ? await Shop.findOne({ phone: p.phone }).lean() : null;
  if (!shop && !p.phone) { report.skipped.push({ partner: String(p._id), why: 'no phone to sign in with' }); return null; }
  if (!shop) {
    report.shopsCreated += 1;
    if (apply) {
      shop = (await Shop.create(shopFields(p))).toObject();
    }
  } else report.shopsLinked += 1;
  if (apply && shop) {
    await ProviderEnrolment.updateOne(
      { providerKind: 'shop', shopId: shop._id, lineCode: LINE },
      { $setOnInsert: { providerKind: 'shop', shopId: shop._id, domainCode: DOMAIN, lineCode: LINE, status: ENROLMENT[p.kyc?.status] || 'draft' } },
      { upsert: true },
    );
  }
  return shop;
}

async function themesToMenu(p, shop, { apply, report }) {
  const { EventTheme } = models();
  const themes = await EventTheme.find({ partnerId: p._id, status: { $in: ['approved', 'featured', 'pending'] } }).lean();
  const codeOf = new Map();
  for (const t of themes) {
    report.menuItems += 1;
    if (!apply || !shop) continue;
    const menu = require('../repair/services/provider-menu.service');
    const out = await menu.saveItem({ shopId: shop._id, workerId: null }, LINE, {
      name: String(t.title).slice(0, 80), includes: (t.includedItems || []).slice(0, 12), minutes: t.setupDurationMinutes || 120,
      photoKey: t.coverImage, prices: { [TYPE]: t.startingPricePaise },
    }, { role: 'admin', id: null }).catch((e) => { report.errors.push({ theme: String(t._id), error: e.message }); return null; });
    const item = out?.items?.find((i) => i.own && i.name === String(t.title).slice(0, 80));
    if (item) codeOf.set(String(t._id), item.repairCode);
  }
  return codeOf;
}

// The job an event booking becomes: same customer, venue, date and money; its own details kept on occasion.
function jobFields(b, shop, codeOf) {
  const status = STATUS[b.status] || 'PROVIDER_ASSIGNED';
  const paid = b.remainingPayment?.status === 'paid' && b.advancePayment?.status === 'paid';
  const a = b.address || {};
  return {
    reference: `EV${String(b._id).slice(-8).toUpperCase()}`, userId: b.userId, shopId: shop._id,
    vertical: LINE, brandCode: TYPE, modelCode: TYPE, repairCode: codeOf.get(String(b.themeId)) || FALLBACK_JOB,
    serviceMode: 'doorstep', status, paymentMethod: 'cash', paymentStatus: paid ? 'paid' : 'pending',
    scheduledAt: startOf(b.eventDate, b.eventTimeSlot),
    location: { type: 'Point', coordinates: [Number(a.lng), Number(a.lat)], address: [a.line1, a.city, a.pincode].filter(Boolean).join(', ') },
    priceSnapshot: { subtotalPaise: b.pricing?.themePricePaise ?? b.pricing.totalPaise, totalPaise: b.pricing.totalPaise },
    occasion: { guests: b.guestCount ?? null, timeSlot: b.eventTimeSlot || '', notes: b.notes || '', legacyEventBookingId: b._id },
    completionPhotos: b.setupPhotos?.after || [],
    ...(b.userRating ? { rating: b.userRating } : {}),
    statusHistory: [{ status, at: b.updatedAt || new Date(), actorRole: 'system', reason: 'Moved from the events engine' }],
  };
}

async function bookingsToJobs(p, shop, codeOf, { apply, report }) {
  const { EventBooking, RepairBooking } = models();
  const rows = await EventBooking.find({ partnerId: p._id }).lean();
  for (const b of rows) {
    if (await RepairBooking.exists({ 'occasion.legacyEventBookingId': b._id })) { report.bookingsAlready += 1; continue; }
    const lat = Number(b.address?.lat); const lng = Number(b.address?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { report.skipped.push({ booking: String(b._id), why: 'no map point for the venue' }); continue; }
    report.bookings += 1;
    if (b.advancePayment?.status === 'paid') report.warnings.push({ booking: String(b._id), why: `advance of ${b.pricing?.advancePaise} paise was paid online: settle by hand` });
    if (!apply || !shop) continue;
    const status = STATUS[b.status] || 'PROVIDER_ASSIGNED';
    await RepairBooking.create(jobFields(b, shop, codeOf));
  }
}

async function migrate({ apply = false } = {}) {
  const { EventPartner } = models();
  const report = { apply, partners: 0, shopsCreated: 0, shopsLinked: 0, menuItems: 0, bookings: 0, bookingsAlready: 0, skipped: [], warnings: [], errors: [] };
  const partners = await EventPartner.find({}).lean();
  for (const p of partners) {
    report.partners += 1;
    const shop = await partnerToShop(p, { apply, report });
    const codeOf = await themesToMenu(p, shop, { apply, report });
    await bookingsToJobs(p, shop, codeOf, { apply, report });
  }
  logger.info({ ...report, skipped: report.skipped.length, warnings: report.warnings.length, errors: report.errors.length }, '[events→store] done');
  return report;
}

module.exports = { migrate, startOf, STATUS, jobFields, shopFields };
