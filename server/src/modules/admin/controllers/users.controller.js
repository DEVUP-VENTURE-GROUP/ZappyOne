const User = require('../../user/user.model');
const Order = require('../../order/order.model');
const auditService = require('../audit.service');

const escapeRe = (v) => String(v).slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function listUsers(req, res, next) {
  try {
    const { q, blocked, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (q)
      filter.$or = [
        { name: new RegExp(escapeRe(q), 'i') },
        { phone: new RegExp(escapeRe(q), 'i') },
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

    const { KINDS } = require('../../jobs/kinds');
    const [orders, jobs, cashDues] = await Promise.all([
      Order.find({ userId: req.params.id })
        .sort({ createdAt: -1 })
        .limit(20)
        .select('service status totalPaise surgeMultiplier createdAt address workerName rating')
        .lean(),
      Promise.all(['repair', 'pet', 'helping'].map(async (kind) => {
        const k = KINDS[kind];
        const rows = await k.model().find({ userId: req.params.id }).sort({ createdAt: -1 }).limit(20)
          .select(`${k.ops.fields} ${k.earning.fields} paymentStatus`).lean();
        return rows.map((r) => {
          let totalPaise = 0;
          try { totalPaise = k.earning.gross(r) || 0; } catch { totalPaise = 0; }
          return { _id: r._id, kind, service: k.ops.title(r), status: r.status, totalPaise, paymentStatus: r.paymentStatus, reference: r.reference, createdAt: r.createdAt };
        });
      })).then((lists) => lists.flat()),
      require('../../jobs/give-back').openCashDues(req.params.id),
    ]);
    const recent = [...orders, ...jobs].sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt)).slice(0, 20);

    res.json({ user, orders: recent, cashDues });
  } catch (err) {
    next(err);
  }
}

async function waiveCashDue(req, res, next) {
  try {
    const out = await require('../../jobs/give-back').waiveCashDue(req.params.id, req.params.jobId);
    await auditService.fromRequest(req, 'admin.user_cash_due_waived', { kind: 'user', id: req.params.id }, null, { jobId: req.params.jobId });
    res.json(out);
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, getUser, blockUser, waiveCashDue };
