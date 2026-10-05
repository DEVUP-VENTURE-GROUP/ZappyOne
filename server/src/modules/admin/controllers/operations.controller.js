const Order = require('../../order/order.model');
const { redis } = require('../../../config/redis');
const auditService = require('../audit.service');
const cachedAnalytics = require('../lib/cached-analytics');


async function listSupportTickets(req, res, next) {
  try {
    const SupportTicket = require('../../engagement/support-ticket.model');
    const page = Number(req.query.page) || 1;
    const limit = 30;
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.category) filter.category = req.query.category;
    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
        .sort({ priority: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SupportTicket.countDocuments(filter),
    ]);
    res.json({ tickets, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

async function replyToSupportTicket(req, res, next) {
  try {
    const SupportTicket = require('../../engagement/support-ticket.model');
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const update = {
      $push: {
        messages: {
          from: 'admin',
          fromId: req.auth.sub,
          text: req.body.text,
          at: new Date(),
        },
      },
    };
    const setFields = {};
    if (!ticket.firstResponseAt) setFields.firstResponseAt = new Date();
    if (req.body.status) {
      setFields.status = req.body.status;
      if (req.body.status === 'resolved') setFields.resolvedAt = new Date();
    }
    if (Object.keys(setFields).length) update.$set = setFields;
    const updated = await SupportTicket.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true },
    );
    await auditService.fromRequest(
      req,
      'admin.support_reply',
      { kind: 'ticket', id: req.params.id },
      null,
      { text: req.body.text, status: req.body.status },
    );
    res.json({ ticket: updated });
  } catch (err) {
    next(err);
  }
}

async function getLiveOps(req, res, next) {
  try {
    // 10s cache — admin live-ops map updates fast enough at 10s; the full
    // Order.find() of all active orders is expensive at scale (~100+ docs × 30s poll).
    const result = await cachedAnalytics('admin:liveops', 10, async () => {
      const [activeOrders, workerIds] = await Promise.all([
        Order.find({
          status: {
            $in: [
              'searching',
              'assigned',
              'on_the_way',
              'arrived',
              'in_progress',
            ],
          },
        })
          .select('_id status service pickupLocation createdAt workerId')
          .lean(),
        redis.zrange('workers:online', 0, 199),
      ]);

      let workerLocations = [];
      if (workerIds.length > 0) {
        const positions = await redis.geopos('workers:online', ...workerIds);
        positions.forEach((pos, i) => {
          if (pos && pos[0] != null) {
            workerLocations.push({
              id: workerIds[i],
              lng: parseFloat(pos[0]),
              lat: parseFloat(pos[1]),
            });
          }
        });
      }

      const byStatus = {};
      for (const o of activeOrders)
        byStatus[o.status] = (byStatus[o.status] || 0) + 1;

      // Every v1 job kind, from the job registry.
      const ops = require('../../jobs/ops.service');
      const jobs = await ops.liveJobs();

      return {
        activeOrders: activeOrders.map((o) => ({
          _id: o._id,
          status: o.status,
          service: o.service,
          lat: o.pickupLocation?.coordinates?.[1] ?? null,
          lng: o.pickupLocation?.coordinates?.[0] ?? null,
          createdAt: o.createdAt,
          hasWorker: !!o.workerId,
        })),
        workerLocations,
        jobs,
        jobCounts: ops.summarise(jobs),
        counts: {
          total: activeOrders.length,
          byStatus,
          onlineWorkers: workerIds.length,
        },
        checkedAt: new Date().toISOString(),
      };
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getCashbackConfig(req, res, next) {
  try {
    const cashbackService = require('../../wallet/cashback.service');
    const rules = await cashbackService.getRules();
    res.json({ config: rules });
  } catch (err) {
    next(err);
  }
}

async function setCashbackConfig(req, res, next) {
  try {
    const cashbackService = require('../../wallet/cashback.service');
    const updated = await cashbackService.setRules(req.body);
    await auditService.fromRequest(
      req,
      'admin.cashback_config_update',
      { kind: 'system', id: null },
      null,
      req.body,
    );
    res.json({ config: updated });
  } catch (err) {
    next(err);
  }
}

async function getCashbackStats(req, res, next) {
  try {
    const Transaction = require('../../payment/transaction.model');
    const days = Math.min(Number(req.query.days) || 30, 365);
    const since = new Date(Date.now() - days * 86400_000);

    const [agg, byDay, topOrders] = await Promise.all([
      Transaction.aggregate([
        {
          $match: {
            reason: 'cashback',
            status: 'succeeded',
            createdAt: { $gte: since },
          },
        },
        {
          $group: {
            _id: null,
            totalPaise: { $sum: '$amountPaise' },
            count: { $sum: 1 },
          },
        },
      ]),
      Transaction.aggregate([
        {
          $match: {
            reason: 'cashback',
            status: 'succeeded',
            createdAt: { $gte: since },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            totalPaise: { $sum: '$amountPaise' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Transaction.find({
        reason: 'cashback',
        status: 'succeeded',
        createdAt: { $gte: since },
      })
        .sort({ amountPaise: -1 })
        .limit(10)
        .select('amountPaise refOrderId owner createdAt description')
        .lean(),
    ]);

    res.json({
      days,
      totalPaise: agg[0]?.totalPaise || 0,
      totalRupees: Math.round((agg[0]?.totalPaise || 0) / 100),
      totalCount: agg[0]?.count || 0,
      avgPaise: agg[0]?.count
        ? Math.round((agg[0].totalPaise || 0) / agg[0].count)
        : 0,
      byDay: byDay.map((d) => ({
        day: d._id,
        totalPaise: d.totalPaise,
        totalRupees: Math.round(d.totalPaise / 100),
        count: d.count,
      })),
      topOrders: topOrders.map((t) => ({
        amountRupees: Math.round(t.amountPaise / 100),
        orderId: t.refOrderId,
        userId: t.owner?.id,
        at: t.createdAt,
        description: t.description,
      })),
    });
  } catch (err) {
    next(err);
  }
}

async function getReferralStats(req, res, next) {
  try {
    const { ReferralUse, ReferralCode } = require('../../referral/referral.model');
    const Transaction = require('../../payment/transaction.model');
    const days = Math.min(Number(req.query.days) || 30, 365);
    const since = new Date(Date.now() - days * 86400_000);

    const [totalUses, rewarded, rewardSpend, topReferrers] = await Promise.all([
      ReferralUse.countDocuments({ createdAt: { $gte: since } }),
      ReferralUse.countDocuments({
        status: 'rewarded',
        createdAt: { $gte: since },
      }),
      Transaction.aggregate([
        {
          $match: {
            reason: 'referral_reward',
            status: 'succeeded',
            createdAt: { $gte: since },
          },
        },
        { $group: { _id: null, totalPaise: { $sum: '$amountPaise' } } },
      ]),
      ReferralUse.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: '$referrer.id',
            count: { $sum: 1 },
            rewarded: {
              $sum: { $cond: [{ $eq: ['$status', 'rewarded'] }, 1, 0] },
            },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    res.json({
      days,
      totalSignups: totalUses,
      converted: rewarded,
      conversionPct: totalUses ? Math.round((rewarded / totalUses) * 100) : 0,
      totalSpendPaise: rewardSpend[0]?.totalPaise || 0,
      totalSpendRupees: Math.round((rewardSpend[0]?.totalPaise || 0) / 100),
      topReferrers: topReferrers.map((r) => ({
        referrerId: r._id,
        signups: r.count,
        converted: r.rewarded,
      })),
    });
  } catch (err) {
    next(err);
  }
}

async function listRecentReferrals(req, res, next) {
  try {
    const { ReferralUse } = require('../../referral/referral.model');
    const page = Number(req.query.page) || 1;
    const limit = 50;
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const [uses, total] = await Promise.all([
      ReferralUse.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ReferralUse.countDocuments(filter),
    ]);
    res.json({
      uses,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listSupportTickets,
  replyToSupportTicket,
  getLiveOps,
  getCashbackConfig,
  setCashbackConfig,
  getCashbackStats,
  getReferralStats,
  listRecentReferrals,
};
