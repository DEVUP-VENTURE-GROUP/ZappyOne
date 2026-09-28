/**
 * With no payout gateway, an approved payout must never be reported as paid.
 * It waits for an admin to transfer the money and record the reference.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const Payout = require('../src/modules/payout/payout.model');
const payoutService = require('../src/modules/payout/payout.service');
const walletService = require('../src/modules/wallet/wallet.service');

jest.setTimeout(60000);
beforeAll(startMongo);
afterAll(stopMongo);

test('no gateway: approval reserves the money but does not claim it was sent', async () => {
  const spy = jest.spyOn(walletService, 'apply').mockResolvedValue({});
  const p = await Payout.create({ workerId: new mongoose.Types.ObjectId(), amountPaise: 50000, method: 'upi', status: 'requested' });

  const out = await payoutService.approvePayout({ payoutId: p._id, adminId: new mongoose.Types.ObjectId() });
  expect(out.status).toBe('approved');
  expect(out.manualTransferRequired).toBe(true);
  expect(out.gatewayPayoutId).toBeUndefined();

  await expect(payoutService.markPaidManually({ payoutId: p._id, reference: '12' }))
    .rejects.toMatchObject({ code: 'REFERENCE_REQUIRED' });
  const paid = await payoutService.markPaidManually({ payoutId: p._id, adminId: new mongoose.Types.ObjectId(), reference: 'UTR123456789' });
  expect(paid).toMatchObject({ status: 'paid', transferReference: 'UTR123456789', manualTransferRequired: false });

  await expect(payoutService.markPaidManually({ payoutId: p._id, reference: 'UTR123456789' }))
    .rejects.toMatchObject({ code: 'NOT_AWAITING_TRANSFER' });
  spy.mockRestore();
});
