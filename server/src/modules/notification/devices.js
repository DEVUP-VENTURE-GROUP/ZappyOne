// Phone and browser push tokens for every kind of account, in one place: save, look up, prune.
// ringTokens are Android phones whose app can ring a job full-screen (native zappy-ring); they get job offers as data so the app draws the ring itself.
const MODELS = {
  user: () => require('../user/user.model'),
  worker: () => require('../worker/worker.model'),
  shop: () => require('../shop/shop.model'),
  event_partner: () => require('../events/event-partner.model'),
};

async function saveToken(kind, id, token, platform) {
  const M = MODELS[kind];
  if (!M || !id || !token) return false;
  const add = { deviceTokens: token, ...(platform === 'android-ring' && { ringTokens: token }) };
  await M().updateOne({ _id: id }, { $addToSet: add });
  return true;
}

async function tokensOf(kind, id) {
  const M = MODELS[kind];
  if (!M || !id) return { tokens: [], ring: [], phone: null };
  const doc = await M().findById(id).select('deviceTokens ringTokens phone').lean();
  return { tokens: doc?.deviceTokens || [], ring: doc?.ringTokens || [], phone: doc?.phone || null };
}

async function prune(stale) {
  if (!stale?.length) return;
  const pull = { $pull: { deviceTokens: { $in: stale }, ringTokens: { $in: stale } } };
  await Promise.all(Object.values(MODELS).map((M) => M().updateMany({ deviceTokens: { $in: stale } }, pull).catch(() => {})));
}

module.exports = { saveToken, tokensOf, prune, KINDS: Object.keys(MODELS) };
