// Phone and browser push tokens for every kind of account, in one place: save, look up, prune.
// nativeTokens are Android phones running ZappyOne's own push code (mobile/packages/native): offers ring full-screen and job updates keep one live card, so they get those as data and draw them.
const MODELS = {
  user: () => require('../user/user.model'),
  worker: () => require('../worker/worker.model'),
  shop: () => require('../shop/shop.model'),
  event_partner: () => require('../events/event-partner.model'),
};

// iPhones hand the app a raw APNs device token; it is kept as is and sent straight to Apple (notification/apns), FCM tokens go to Firebase.

async function saveToken(kind, id, token, platform) {
  const M = MODELS[kind];
  if (!M || !id || !token) return false;
  // One phone, one account: a token new to this account leaves any other account first (a repeat save skips the sweep).
  if (!(await M().exists({ _id: id, deviceTokens: token }))) await prune([token]);
  const add = { deviceTokens: token, ...(platform === 'android-native' && { nativeTokens: token }) };
  await M().updateOne({ _id: id }, { $addToSet: add });
  return true;
}

// Sign-out: this phone's token comes off the account it signed out of.
async function removeToken(kind, id, token) {
  const M = MODELS[kind];
  if (!M || !id || !token) return false;
  await M().updateOne({ _id: id }, { $pull: { deviceTokens: token, nativeTokens: token } });
  return true;
}

async function tokensOf(kind, id) {
  const M = MODELS[kind];
  if (!M || !id) return { tokens: [], native: [], phone: null };
  const doc = await M().findById(id).select('deviceTokens nativeTokens phone').lean();
  return { tokens: doc?.deviceTokens || [], native: doc?.nativeTokens || [], phone: doc?.phone || null };
}

async function prune(stale) {
  if (!stale?.length) return;
  const pull = { $pull: { deviceTokens: { $in: stale }, nativeTokens: { $in: stale } } };
  await Promise.all(Object.values(MODELS).map((M) => M().updateMany({ deviceTokens: { $in: stale } }, pull).catch(() => {})));
}

module.exports = { saveToken, removeToken, tokensOf, prune, KINDS: Object.keys(MODELS) };
