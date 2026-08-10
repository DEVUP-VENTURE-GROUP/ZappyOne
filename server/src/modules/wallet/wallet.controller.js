const walletService = require('./wallet.service');
const paymentService = require('../payment/payment.service');
const duesService = require('../worker/worker-dues.service');
const config = require('../../config');

async function getBalance(req, res, next) {
  try {
    if (!['user', 'worker'].includes(req.auth.role)) {
      return res.status(403).json({ error: 'Wallets only for users/workers', code: 'NO_WALLET_FOR_ROLE' });
    }
    const balance = await walletService.getBalance({ kind: req.auth.role, id: req.auth.sub });
    if (req.auth.role === 'worker') {
      const dues = await duesService.getDuesStatus(req.auth.sub);
      return res.json({ wallet: { ...balance, dues } });
    }
    res.json({ wallet: balance });
  } catch (err) { next(err); }
}

async function getDues(req, res, next) {
  try {
    const dues = await duesService.getDuesStatus(req.auth.sub);
    res.json({ dues });
  } catch (err) { next(err); }
}

async function listTransactions(req, res, next) {
  try {
    const result = await walletService.listTransactions({
      kind: req.auth.role,
      id: req.auth.sub,
      page: Number(req.query.page),
      // Cap client-supplied limit — same reason as the notifications endpoint.
      limit: Math.min(Number(req.query.limit) || 50, 100),
      reason: req.query.reason,
    });
    res.json(result);
  } catch (err) { next(err); }
}

async function topup(req, res, next) {
  try {
    if (!['user', 'worker'].includes(req.auth.role)) {
      return res.status(403).json({ error: 'Wallets only for users/workers' });
    }
    const result = await paymentService.createOrderForPurpose({
      owner: { kind: req.auth.role, id: req.auth.sub },
      purpose: 'wallet_topup',
      amountPaise: req.body.amountPaise,
    });
    res.status(201).json({
      paymentIntentId:  result.paymentIntent._id,
      cfOrderId:        result.cfOrder.order_id,
      paymentSessionId: result.cfOrder.payment_session_id,
      amountPaise:      result.paymentIntent.amountPaise,
      currency:         'INR',
      cashfreeEnv:      config.cashfree.env,
    });
  } catch (err) { next(err); }
}

module.exports = { getBalance, getDues, listTransactions, topup };
