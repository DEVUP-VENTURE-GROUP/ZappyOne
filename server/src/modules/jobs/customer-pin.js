// One code per customer, like a ride app's PIN: made once, the same for every booking, shown in their app only when a pro is at the door.
const crypto = require('crypto');

const User = () => require('../user/user.model');

async function pinOf(userId) {
  if (!userId) return null;
  const found = await User().findById(userId).select('+startPin').lean();
  if (found?.startPin) return found.startPin;
  // Set once even if two screens ask together: the losing write reads the winner's PIN.
  const made = await User().findOneAndUpdate(
    { _id: userId, $or: [{ startPin: { $exists: false } }, { startPin: null }, { startPin: '' }] },
    { $set: { startPin: String(crypto.randomInt(1000, 10000)) } },
    { new: true },
  ).select('+startPin').lean();
  return made?.startPin || (await User().findById(userId).select('+startPin').lean())?.startPin || null;
}

function sameCode(expected, typed) {
  const a = Buffer.from(String(typed ?? '').trim());
  const b = Buffer.from(String(expected ?? ''));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { pinOf, sameCode };
