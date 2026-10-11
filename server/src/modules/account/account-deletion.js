/**
 * Deleting an account from inside any app (Google Play account deletion), for
 * every account type: customer, worker, shop and events partner.
 *
 * Refused while something is still owed or under way, because deleting then
 * would strand the other side: an open job of any kind, or money still in a
 * provider's wallet (withdraw it first).
 *
 * What it removes: the sign-in details and personal data (the phone number is
 * released so it can sign up afresh, name, email, username, password, photo,
 * addresses, saved cards, bank accounts and UPI IDs, emergency contact, push
 * tokens), hides a provider from matching and from customers, and ends every
 * session. What it keeps: past bookings and money records, which no longer
 * point at a person, for tax and dispute obligations.
 */
const logger = require('../../core/logger');

const err = (status, code, message) => Object.assign(new Error(message), { status, code });

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

async function deleteAccount({ role, id }) {
  const { ROLES } = require('./account.service');
  const cfg = ROLES[role];
  if (!cfg) throw err(400, 'BAD_ROLE', 'Unknown account type');
  const Model = cfg.model();
  const account = await Model.findById(id).lean();
  if (!account) throw err(404, 'NOT_FOUND', 'Account not found');

  const open = await openJobCount(role, id);
  if (open > 0) {
    throw err(409, 'ACTIVE_JOBS', open === 1
      ? 'You have a booking in progress. Finish or cancel it first, then delete your account.'
      : `You have ${open} bookings in progress. Finish or cancel them first, then delete your account.`);
  }
  if ((account.wallet?.balance || 0) > 0) {
    throw err(409, 'WALLET_BALANCE', 'You still have money in your wallet. Withdraw it first, then delete your account.');
  }

  const has = (path) => !!Model.schema.path(path) || !!Model.schema.nested?.[path];
  const $set = { phone: `deleted-${id}`, deletedAt: new Date() };
  for (const [path, value] of Object.entries({ ...CLEAR, ...HIDE })) if (has(path)) $set[path] = value;
  if (has('isDeleted')) $set.isDeleted = true;
  if (has('deletionReason')) $set.deletionReason = 'Deleted by the account holder';
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
  logger.info({ role, id: String(id) }, 'Account deleted by its holder');
  return { ok: true };
}

module.exports = { deleteAccount, openJobCount };
