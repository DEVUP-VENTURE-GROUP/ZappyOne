const User = require('./user.model');
const SavedCard = require('../payment/saved-card.model');

async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.auth.sub).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) { next(err); }
}

// Only these fields may be self-updated. Explicit whitelist so privileged fields
// (role, isBlocked, rating, wallet, abuse counters…) can NEVER be mass-assigned,
// independent of whatever the route validator allows.
const SELF_EDITABLE_FIELDS = ['name', 'email', 'defaultPayment'];

async function updateMe(req, res, next) {
  try {
    const update = {};
    for (const f of SELF_EDITABLE_FIELDS) {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    }
    const user = await User.findByIdAndUpdate(req.auth.sub, update, { new: true, runValidators: true });
    res.json({ user });
  } catch (err) { next(err); }
}

async function getAddresses(req, res, next) {
  try {
    const user = await User.findById(req.auth.sub).select('savedAddresses recentLocations').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      addresses: user.savedAddresses || [],
      recentLocations: (user.recentLocations || [])
        .sort((a, b) => new Date(b.usedAt) - new Date(a.usedAt))
        .slice(0, 5),
    });
  } catch (err) { next(err); }
}

async function addAddress(req, res, next) {
  try {
    const user = await User.findByIdAndUpdate(
      req.auth.sub,
      {
        $push: {
          savedAddresses: {
            label: req.body.label,
            address: req.body.address,
            location: { type: 'Point', coordinates: [req.body.lng, req.body.lat] },
            landmark: req.body.landmark,
            flatNumber: req.body.flatNumber,
            notes: req.body.notes,
            tag: req.body.tag || 'other',
          },
        },
      },
      { new: true }
    );
    res.json({ addresses: user.savedAddresses });
  } catch (err) { next(err); }
}

async function deleteAddress(req, res, next) {
  try {
    const user = await User.findByIdAndUpdate(
      req.auth.sub,
      { $pull: { savedAddresses: { _id: req.params.addrId } } },
      { new: true }
    );
    res.json({ addresses: user.savedAddresses });
  } catch (err) { next(err); }
}

async function editAddress(req, res, next) {
  try {
    const { addrId } = req.params;
    const update = {};
    const textFields = ['label', 'address', 'tag', 'landmark', 'flatNumber', 'notes'];
    for (const key of textFields) {
      if (req.body[key] !== undefined) update[`savedAddresses.$.${key}`] = req.body[key];
    }
    if (req.body.lat !== undefined && req.body.lng !== undefined) {
      update['savedAddresses.$.location'] = {
        type: 'Point',
        coordinates: [parseFloat(req.body.lng), parseFloat(req.body.lat)],
      };
    }
    if (!Object.keys(update).length) return res.status(400).json({ error: 'No fields to update' });
    const user = await User.findOneAndUpdate(
      { _id: req.auth.sub, 'savedAddresses._id': addrId },
      { $set: update },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'Address not found' });
    res.json({ addresses: user.savedAddresses });
  } catch (err) { next(err); }
}

async function setDefaultAddress(req, res, next) {
  try {
    const { addrId } = req.params;
    await User.updateOne({ _id: req.auth.sub }, { $set: { 'savedAddresses.$[].isDefault': false } });
    const user = await User.findOneAndUpdate(
      { _id: req.auth.sub, 'savedAddresses._id': addrId },
      { $set: { 'savedAddresses.$.isDefault': true } },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'Address not found' });
    res.json({ addresses: user.savedAddresses });
  } catch (err) { next(err); }
}

async function listPaymentMethods(req, res, next) {
  try {
    const methods = await SavedCard.find({ userId: req.auth.sub }).sort({ isDefault: -1, createdAt: -1 }).lean();
    res.json({ methods });
  } catch (err) { next(err); }
}

async function addPaymentMethod(req, res, next) {
  try {
    const { type, last4, network, cardName, expiryMM, expiryYY, upiId, upiProvider } = req.body;
    const method = await SavedCard.create({
      userId: req.auth.sub, type, last4, network, cardName, expiryMM, expiryYY, upiId, upiProvider,
    });
    res.status(201).json({ method });
  } catch (err) { next(err); }
}

async function deletePaymentMethod(req, res, next) {
  try {
    const result = await SavedCard.deleteOne({ _id: req.params.methodId, userId: req.auth.sub });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Payment method not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function getNotificationPrefs(req, res, next) {
  try {
    const user = await User.findById(req.auth.sub).select('notificationPrefs').lean();
    res.json({ prefs: user?.notificationPrefs || {} });
  } catch (err) { next(err); }
}

async function updateNotificationPrefs(req, res, next) {
  try {
    const setFields = Object.fromEntries(
      Object.entries(req.body).map(([k, v]) => [`notificationPrefs.${k}`, v])
    );
    const user = await User.findByIdAndUpdate(
      req.auth.sub,
      { $set: setFields },
      { new: true }
    ).select('notificationPrefs');
    res.json({ prefs: user.notificationPrefs });
  } catch (err) { next(err); }
}

async function getSpending(req, res, next) {
  try {
    const Order = require('../order/order.model');
    const orders = await Order.find({
      userId: req.auth.sub,
      status: 'completed',
      completedAt: { $gte: new Date(Date.now() - 180 * 86400000) },
    }).select('service pricing completedAt promoCode').lean();

    const byMonth = {};
    const byService = {};
    let totalSavingsPaise = 0;

    for (const o of orders) {
      const d = new Date(o.completedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const amt = o.pricing?.total || 0;
      byMonth[key] = (byMonth[key] || 0) + amt;
      byService[o.service] = (byService[o.service] || 0) + amt;
      if (o.pricing?.discountPaise) totalSavingsPaise += o.pricing.discountPaise;
    }

    const monthly = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, totalRupees]) => ({ month, totalRupees }));

    const topServices = Object.entries(byService)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([service, totalRupees]) => ({ service, totalRupees }));

    res.json({
      monthly,
      topServices,
      totalSavingsPaise,
      orderCount: orders.length,
      totalSpentRupees: orders.reduce((s, o) => s + (o.pricing?.total || 0), 0),
    });
  } catch (err) { next(err); }
}

async function deleteAccount(req, res, next) {
  try {
    await User.findByIdAndUpdate(req.auth.sub, {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        name: 'Deleted User',
        email: null,
        deviceTokens: [],
      },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function setDefaultPaymentMethod(req, res, next) {
  try {
    await SavedCard.updateMany({ userId: req.auth.sub }, { $set: { isDefault: false } });
    const method = await SavedCard.findOneAndUpdate(
      { _id: req.params.methodId, userId: req.auth.sub },
      { $set: { isDefault: true } },
      { new: true }
    );
    if (!method) return res.status(404).json({ error: 'Payment method not found' });
    res.json({ method });
  } catch (err) { next(err); }
}

async function saveRecentLocation(req, res, next) {
  try {
    const { address, lat, lng } = req.body;
    await User.recordRecentLocation(req.auth.sub, { address, lat, lng });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function registerDeviceToken(req, res, next) {
  try {
    await User.updateOne(
      { _id: req.auth.sub },
      { $addToSet: { deviceTokens: req.body.token } }
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = {
  getMe, updateMe,
  getAddresses, addAddress, deleteAddress, editAddress, setDefaultAddress,
  listPaymentMethods, addPaymentMethod, deletePaymentMethod, setDefaultPaymentMethod,
  getNotificationPrefs, updateNotificationPrefs,
  getSpending, deleteAccount,
  saveRecentLocation, registerDeviceToken,
};
