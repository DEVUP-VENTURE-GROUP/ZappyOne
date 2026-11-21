/**
 * Deleting an account from inside any app (Google Play account deletion), for
 * every account type: customer, worker, shop and events partner.
 *
 * Refused while something is still owed or under way, because deleting then
 * would strand the other side: an open job of any kind, money still to
 * withdraw, money owed to ZappyOne, or a withdrawal still on its way.
 * checkDeletion lists those first so the app can show them before the person
 * confirms; deleteAccount enforces the same list.
 *
 * What it removes: the sign-in details and personal data (the phone number is
 * released so it can sign up afresh, name, email, username, password, photo,
 * addresses, saved cards, bank accounts and UPI IDs, emergency contact, push
 * tokens), hides a provider from matching and from customers, and ends every
 * session. What it keeps: past bookings and money records, which no longer
 * point at a person, for tax and dispute obligations, and one AccountDeletion
 * row (reason, money position, last four digits) for admin.
 */
const mongoose = require('mongoose');
const logger = require('../../core/logger');

const err = (status, code, message, extra = {}) => Object.assign(new Error(message), { status, code, ...extra });
const rupees = (p) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

/** Why people leave, shown as choices; the code is stored. */
const REASONS = [
  { code: 'not_enough_work', label: 'Not getting enough work', roles: ['worker', 'shop', 'event_partner'] },
  { code: 'earnings_low', label: 'Earnings are too low', roles: ['worker', 'shop', 'event_partner'] },
  { code: 'fees_high', label: 'Fees or commission are too high', roles: ['worker', 'shop', 'event_partner'] },
  { code: 'payment_issues', label: 'Problems getting paid', roles: ['worker', 'shop', 'event_partner'] },
  { code: 'found_other_platform', label: 'Moving to another platform', roles: ['worker', 'shop', 'event_partner'] },
  { code: 'closing_business', label: 'Stopping this work or closing the business', roles: ['worker', 'shop', 'event_partner'] },
  { code: 'not_using', label: 'I do not use ZappyOne any more', roles: ['user'] },
  { code: 'bad_experience', label: 'Had a bad experience', roles: ['user', 'worker', 'shop', 'event_partner'] },
  { code: 'privacy', label: 'Privacy concerns', roles: ['user', 'worker', 'shop', 'event_partner'] },
  { code: 'app_problems', label: 'The app does not work well for me', roles: ['user', 'worker', 'shop', 'event_partner'] },
  { code: 'duplicate_account', label: 'I have another account', roles: ['user', 'worker', 'shop', 'event_partner'] },
  { code: 'other', label: 'Something else', roles: ['user', 'worker', 'shop', 'event_partner'] },
];
const reasonsFor = (role) => REASONS.filter((r) => r.roles.includes(role)).map(({ code, label }) => ({ code, label }));

const deletionSchema = new mongoose.Schema({
  role: { type: String, required: true, index: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, default: '' },
  phoneLast4: { type: String, default: '' },
  reason: { type: String, default: 'not_given', index: true },
  note: { type: String, default: '', maxlength: 500 },
  walletPaise: { type: Number, default: 0 },
  duesPaise: { type: Number, default: 0 },
  deletedAt: { type: Date, default: Date.now, index: true },
}, { timestamps: false });
deletionSchema.index({ deletedAt: -1 });
const AccountDeletion = mongoose.models.AccountDeletion || mongoose.model('AccountDeletion', deletionSchema);

/** The field each job model uses for this account type. */
const OWNER_FIELD = { user: 'userId', worker: 'workerId', shop: 'shopId', event_partner: 'partnerId' };
const ORDER_TERMINAL = ['completed', 'cancelled', 'failed'];

/** Jobs of any kind this account still has open. */
async function openJobCount(role, id) {
  const field = OWNER_FIELD[role];
  if (!field) return 0;
  const { KINDS } = require('../jobs/kinds');
  let n = 0;
  for (const kind of Object.values(KINDS)) {
    const terminal = kind.ops?.terminal;
    if (!terminal || typeof kind.model !== 'function') continue;
    const Model = kind.model();
    if (!Model.schema.path(field)) continue;
    n += await Model.countDocuments({ [field]: id, status: { $nin: terminal } });
  }
  const Order = require('../order/order.model');
  if (Order.schema.path(field)) n += await Order.countDocuments({ [field]: id, status: { $nin: ORDER_TERMINAL } });
  return n;
}

/** What the account holds and owes, from the ledgers money really lives in. */
async function moneyOf(role, id) {
  if (role === 'worker') {
    const balance = (await require('../wallet/wallet.service').getBalance({ kind: 'worker', id })).balancePaise;
    const Payout = require('../payout/payout.model');
    const inFlight = await Payout.findOne({ workerId: id, status: { $in: ['requested', 'approved', 'processing'] } }).select('amountPaise').lean();
    return { walletPaise: Math.max(0, balance), duesPaise: Math.max(0, -balance), payoutPaise: inFlight?.amountPaise || 0 };
  }
  if (role === 'shop') {
    const { duesOf } = require('../shop/shop-dues');
    const { balance, ShopPayout } = require('../shop/shop-payout');
    const [b, d, open] = await Promise.all([balance(id), duesOf(id), ShopPayout.findOne({ shopId: id, status: 'requested' }).select('amountPaise').lean()]);
    return { walletPaise: b.availablePaise || 0, duesPaise: d.duesPaise || 0, payoutPaise: open?.amountPaise || 0 };
  }
  if (role === 'user') {
    const balance = (await require('../wallet/wallet.service').getBalance({ kind: 'user', id })).balancePaise;
    return { walletPaise: Math.max(0, balance), duesPaise: 0, payoutPaise: 0 };
  }
  return { walletPaise: 0, duesPaise: 0, payoutPaise: 0 };
}

/** Everything in the way of deleting, each with a plain message; empty means it can go ahead. */
async function blockersOf(role, id) {
  const [open, money] = await Promise.all([openJobCount(role, id), moneyOf(role, id)]);
  const out = [];
  if (open > 0) {
    out.push({ code: 'ACTIVE_JOBS', count: open, message: open === 1
      ? 'You have a booking in progress. Finish or cancel it first.'
      : `You have ${open} bookings in progress. Finish or cancel them first.` });
  }
  if (money.duesPaise > 0) {
    out.push({ code: 'DUES_OWED', amountPaise: money.duesPaise, message: `You owe ZappyOne ${rupees(money.duesPaise)}. Pay it first, then delete your account.` });
  }
  if (money.payoutPaise > 0) {
    out.push({ code: 'PAYOUT_PENDING', amountPaise: money.payoutPaise, message: `Your withdrawal of ${rupees(money.payoutPaise)} is on its way. You can delete your account once it reaches you.` });
  }
  // A customer's leftover wallet (mostly cashback) never blocks leaving; it is recorded for admin.
  if (money.walletPaise > 0 && role !== 'user') {
    out.push({ code: 'WALLET_BALANCE', amountPaise: money.walletPaise, message: `You still have ${rupees(money.walletPaise)} to withdraw. Withdraw it first, then delete your account.` });
  }
  return { blockers: out, money };
}

async function checkDeletion({ role, id }) {
  const { blockers } = await blockersOf(role, id);
  return { canDelete: blockers.length === 0, blockers, reasons: reasonsFor(role) };
}

/** Personal fields cleared on every account type, set only where that model has them. */
const CLEAR = {
  name: 'Deleted account', ownerName: 'Deleted account', businessName: 'Deleted account',
  avatarKey: null, profilePhotoKey: null, coverImageUrl: null, galleryImages: [], bio: null,
  savedAddresses: [], recentLocations: [], savedBankAccounts: [], savedUpiIds: [], emergencyContact: null,
  deviceTokens: [], deviceIds: [], knownDevices: [],
};
const UNSET = ['email', 'username', 'passwordHash'];
/** Hidden from matching and from customers. */
const HIDE = { isBlocked: true, isActive: false, isOnline: false, isAvailable: false };

async function deleteAccount({ role, id, reason = null, note = '' }) {
  const { ROLES } = require('./account.service');
  const cfg = ROLES[role];
  if (!cfg) throw err(400, 'BAD_ROLE', 'Unknown account type');
  const Model = cfg.model();
  const account = await Model.findById(id).lean();
  if (!account) throw err(404, 'NOT_FOUND', 'Account not found');

  const { blockers, money } = await blockersOf(role, id);
  if (blockers.length) throw err(409, blockers[0].code, blockers[0].message, { blockers });

  const known = reasonsFor(role).some((r) => r.code === reason);
  // Kept before the details are cleared: what admin sees about who left and why.
  await AccountDeletion.create({
    role, accountId: id, name: String(cfg.nameOf(account) || account.businessName || '').slice(0, 120),
    phoneLast4: String(account.phone || '').slice(-4), reason: known ? reason : 'not_given', note: String(note || '').trim().slice(0, 500),
    walletPaise: money.walletPaise, duesPaise: money.duesPaise,
  });

  const has = (path) => !!Model.schema.path(path) || !!Model.schema.nested?.[path];
  const $set = { phone: `deleted-${id}`, deletedAt: new Date() };
  for (const [path, value] of Object.entries({ ...CLEAR, ...HIDE })) if (has(path)) $set[path] = value;
  if (has('isDeleted')) $set.isDeleted = true;
  if (has('deletionReason')) $set.deletionReason = known ? reason : 'Deleted by the account holder';
  const $unset = Object.fromEntries(UNSET.filter(has).map((p) => [p, 1]));
  await Model.updateOne({ _id: id }, { $set, ...(Object.keys($unset).length && { $unset }) }, { strict: false });

  if (role === 'user') await require('../payment/saved-card.model').deleteMany({ userId: id });
  // Out of the live pools and signed out everywhere; best effort, the record is already cleared.
  const { redis } = require('../../config/redis');
  await Promise.allSettled([
    role === 'worker' ? redis.zrem('workers:online', String(id)) : null,
    role === 'worker' ? redis.del(`worker:available:${id}`) : null,
    require('../auth/token.service').revokeAllForUser(String(id)),
  ]);
  logger.info({ role, id: String(id), reason: known ? reason : 'not_given' }, 'Account deleted by its holder');
  return { ok: true };
}

/** Admin: who left, newest first, with why and their money position at the time; filter by role or reason. */
async function listDeletions({ role, reason, page = 1, limit = 30 } = {}) {
  const q = { ...(role && { role }), ...(reason && { reason }) };
  const [rows, total, byReason] = await Promise.all([
    AccountDeletion.find(q).sort({ deletedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AccountDeletion.countDocuments(q),
    AccountDeletion.aggregate([{ $match: role ? { role } : {} }, { $group: { _id: '$reason', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
  ]);
  const label = Object.fromEntries([...REASONS.map((r) => [r.code, r.label]), ['not_given', 'Not given (older app)']]);
  return {
    deletions: rows.map((r) => ({ ...r, reasonLabel: label[r.reason] || r.reason })),
    total, page, pages: Math.max(1, Math.ceil(total / limit)),
    byReason: byReason.map((b) => ({ reason: b._id, label: label[b._id] || b._id, count: b.n })),
  };
}

module.exports = { deleteAccount, checkDeletion, listDeletions, openJobCount, REASONS, AccountDeletion };
