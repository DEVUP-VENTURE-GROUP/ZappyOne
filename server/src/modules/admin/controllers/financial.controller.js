const auditService = require('../audit.service');

async function adjustWallet(req, res, next) {
  try {
    const walletService = require('../../wallet/wallet.service');
    const Transaction = require('../../payment/transaction.model');
    const { kind, id, type, amountPaise, description } = req.body;

    if (!['user', 'worker'].includes(kind)) {
      return res.status(400).json({ error: 'kind must be user or worker' });
    }
    if (!['credit', 'debit'].includes(type)) {
      return res.status(400).json({ error: 'type must be credit or debit' });
    }
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      return res
        .status(400)
        .json({ error: 'amountPaise must be a positive integer' });
    }

    const reason =
      type === 'credit'
        ? Transaction.REASONS.ADMIN_ADJUSTMENT_CREDIT
        : Transaction.REASONS.ADMIN_ADJUSTMENT_DEBIT;

    const idempotencyKey = `admin:adj:${req.auth.sub}:${kind}:${id}:${Date.now()}`;

    const result = await walletService.apply({
      kind,
      id,
      type,
      amountPaise,
      reason,
      idempotencyKey,
      description: description || `Admin ${type} by ${req.auth.sub}`,
      metadata: { adminId: req.auth.sub },
      allowDebt: kind === 'worker', // a correction to what a worker owes
    });

    await auditService.fromRequest(
      req,
      `admin.wallet_${type}`,
      { kind, id },
      null,
      { amountPaise, description },
    );

    res.json({
      transaction: result.transaction,
      newBalancePaise: result.wallet.balancePaise,
      newBalanceRupees: Math.round(result.wallet.balancePaise / 100),
    });
  } catch (err) {
    next(err);
  }
}

async function reconcileWallet(req, res, next) {
  try {
    const walletService = require('../../wallet/wallet.service');
    const { kind, id } = req.params;
    const result = await walletService.reconcile({ kind, id });
    await auditService.fromRequest(
      req,
      'admin.wallet_reconcile',
      { kind, id },
      null,
      result,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { adjustWallet, reconcileWallet };
