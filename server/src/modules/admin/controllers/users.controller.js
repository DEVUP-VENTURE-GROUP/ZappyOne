const User = require('../../user/user.model');
const Order = require('../../order/order.model');
const auditService = require('../audit.service');

async function listUsers(req, res, next) {
  try {
    const { q, blocked, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (q)
      filter.$or = [
        { name: new RegExp(q, 'i') },
        { phone: new RegExp(q, 'i') },
      ];
    if (blocked !== undefined) filter.isBlocked = blocked === 'true';
    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(filter),
    ]);
    res.json({ users, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
}

async function blockUser(req, res, next) {
  try {
    const before = await User.findById(req.params.id)
      .select('isBlocked')
      .lean();
    if (!before) return res.status(404).json({ error: 'User not found' });
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isBlocked: req.body.blocked } },
      { new: true },
    );
    const { invalidateBanCache } = require('../../../middlewares/auth');
    invalidateBanCache('user', String(req.params.id)).catch(() => {});
    await auditService.fromRequest(
      req,
      req.body.blocked ? 'admin.user_block' : 'admin.user_unblock',
      { kind: 'user', id: req.params.id },
      { isBlocked: before.isBlocked },
      { isBlocked: user.isBlocked },
    );
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

async function getUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -otp -otpExpiry')
      .lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const orders = await Order.find({ userId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('service status totalPaise surgeMultiplier createdAt address workerName rating')
      .lean();

    res.json({ user, orders });
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, getUser, blockUser };
