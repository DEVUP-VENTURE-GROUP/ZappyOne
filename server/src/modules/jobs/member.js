// What a customer's active plan (subscription) changes on a booking's price; never throws, so pricing never fails over it.
async function perks(userId) {
  if (!userId) return { waivePlatformFee: false, noSurge: false };
  try {
    const fx = await require('../subscription/subscription.service').getEffects({ kind: 'user', id: userId });
    return { waivePlatformFee: !!fx.waivePlatformFee, noSurge: typeof fx.surgeCap === 'number' && fx.surgeCap <= 1 };
  } catch {
    return { waivePlatformFee: false, noSurge: false };
  }
}

module.exports = { perks };
