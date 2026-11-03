const payoutService = require('./payout.service');
const Payout = require('./payout.model');

async function requestPayout(req, res, next) {
  try {
    const { amountPaise, ...dest } = req.body;
    const payout = await payoutService.requestPayout({ workerId: req.auth.sub, amountPaise, destination: dest });
    res.status(201).json({ payout });
  } catch (err) { next(err); }
}

async function listMine(req, res, next) {
  try {
    const page = Number(req.query.page) || 1;
    const result = await payoutService.listForWorker(req.auth.sub, { page });
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = { requestPayout, listMine };
