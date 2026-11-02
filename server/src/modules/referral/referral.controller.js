const referralService = require('./referral.service');
const { ReferralCode, ReferralUse } = require('./referral.model');

async function getMyCode(req, res, next) {
  try {
    if (!['user', 'worker'].includes(req.auth.role)) {
      return res.status(403).json({ error: 'Referrals only for users/workers' });
    }
    const code = await referralService.getOrCreateCode({ kind: req.auth.role, id: req.auth.sub });
    const uses = await ReferralUse.countDocuments({ code: code.code });
    const rewarded = await ReferralUse.countDocuments({ code: code.code, status: 'rewarded' });
    res.json({
      code: code.code,
      shareUrl: `${(process.env.CLIENT_URL || 'https://zappyone.com').replace(/\/$/, '')}/login?ref=${code.code}`,
      // The real amounts (referral.service), so screens never promise a different reward.
      rewards: { friendPaise: referralService.REFEREE_BONUS_PAISE, youPaise: referralService.REFERRER_REWARD_PAISE },
      stats: {
        totalReferrals: uses,
        pendingReferrals: uses - rewarded,
        earnedPaise: code.totalRewardsPaise,
        signups: uses,
        rewarded,
        totalEarnedPaise: code.totalRewardsPaise,
      },
    });
  } catch (err) { next(err); }
}

async function applyCode(req, res, next) {
  try {
    const use = await referralService.applyAtSignup({
      code: req.body.code,
      referee: { kind: req.auth.role, id: req.auth.sub },
      refereeIp: req.ip,
      refereeDeviceId: req.get('x-device-id'),
    });
    res.status(201).json({ use });
  } catch (err) { next(err); }
}

async function getHistory(req, res, next) {
  try {
    const code = await ReferralCode.findOne({
      'owner.kind': req.auth.role,
      'owner.id': req.auth.sub,
    }).lean();
    if (!code) return res.json({ referrals: [] });

    const uses = await ReferralUse.find({ code: code.code })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({
      referrals: uses.map(u => ({
        _id: u._id,
        status: u.status,
        refereeBonusPaise: u.refereeSignupBonusPaise || 0,
        referrerRewardPaise: u.referrerRewardPaise || 0,
        qualifyingOrderId: u.qualifyingOrderId,
        createdAt: u.createdAt,
      })),
    });
  } catch (err) { next(err); }
}

module.exports = { getMyCode, applyCode, getHistory };
