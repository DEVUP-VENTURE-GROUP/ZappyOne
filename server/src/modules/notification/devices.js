// Phone and browser push tokens for every kind of account, in one place: save, look up, prune.
// nativeTokens are Android phones running ZappyOne's own push code (mobile/packages/native): offers ring full-screen and job updates keep one live card, so they get those as data and draw them.
const MODELS = {
  user: () => require('../user/user.model'),
  worker: () => require('../worker/worker.model'),
  shop: () => require('../shop/shop.model'),
  event_partner: () => require('../events/event-partner.model'),
};

async function saveToken(kind, id, token, platform) {
  const M = MODELS[kind];
  if (!M || !id || !token) return false;
  const add = { deviceTokens: token, ...(platform === 'android-native' && { nativeTokens: token }) };
  await M().updateOne({ _id: id }, { $addToSet: add });
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

module.exports = { saveToken, tokensOf, prune, KINDS: Object.keys(MODELS) };
