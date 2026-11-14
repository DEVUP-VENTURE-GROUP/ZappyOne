// A withdrawal goes only to a payout method the pro saved, with the real account number, and the UPI check says plainly when Razorpay has it off.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(90000);
let Worker; let payoutService; let walletService; let Payout; let config; let rz;
beforeAll(async () => {
  await startMongo();
  Worker = require('../src/modules/worker/worker.model');
  Payout = require('../src/modules/payout/payout.model');
  payoutService = require('../src/modules/payout/payout.service');
  walletService = require('../src/modules/wallet/wallet.service');
  config = require('../src/config');
  rz = require('../src/modules/payment/razorpay.client');
});
afterAll(stopMongo);
afterEach(async () => { jest.restoreAllMocks(); config.razorpay.keyId = ''; config.razorpay.keySecret = ''; await Payout.deleteMany({}); });

const pro = () => Worker.collection.insertOne({
  _id: new mongoose.Types.ObjectId(), name: 'Ravi', phone: `9${Math.floor(Math.random() * 1e9)}`,
  savedUpiIds: [{ _id: new mongoose.Types.ObjectId(), upiId: 'ravi@oksbi', verifiedName: 'RAVI KUMAR' }, { _id: new mongoose.Types.ObjectId(), upiId: 'ravi2@ybl', verifiedName: '' }],
  savedBankAccounts: [{ _id: new mongoose.Types.ObjectId(), accountName: 'Ravi Kumar', accountNumber: '123456789012', ifsc: 'SBIN0001234', bankName: 'SBI' }],
}).then((r) => r.insertedId);
const rich = () => jest.spyOn(walletService, 'getBalance').mockResolvedValue({ balancePaise: 1000000, isFrozen: false });

test('a saved UPI ID is paid with its checked name; any other is refused', async () => {
  rich(); const id = await pro();
  const p = await payoutService.requestPayout({ workerId: id, amountPaise: 10000, destination: { method: 'upi', upiId: ' RAVI@oksbi ' } });
  expect(p.method).toBe('upi'); expect(p.destination).toMatchObject({ upiId: 'ravi@oksbi', accountName: 'RAVI KUMAR' });
  await Payout.deleteMany({});
  const q = await payoutService.requestPayout({ workerId: id, amountPaise: 10000, destination: { method: 'upi', upiId: 'ravi2@ybl' } });
  expect(q.destination.accountName).toBeUndefined();
  await Payout.deleteMany({});
  await expect(payoutService.requestPayout({ workerId: id, amountPaise: 10000, destination: { method: 'upi', upiId: 'thief@ybl' } }))
    .rejects.toMatchObject({ code: 'PAYOUT_UNKNOWN_DESTINATION' });
  expect(await Payout.countDocuments({})).toBe(0);
});

test('the masked number the app sends becomes the saved full number; a wrong one is refused', async () => {
  rich(); const id = await pro();
  const p = await payoutService.requestPayout({ workerId: id, amountPaise: 10000, destination: { method: 'bank', bankAccount: 'XXXX9012', bankIfsc: 'sbin0001234', accountName: 'whatever' } });
  expect(p.destination).toMatchObject({ bankAccount: '123456789012', bankIfsc: 'SBIN0001234', accountName: 'Ravi Kumar' });
  await Payout.deleteMany({});
  await expect(payoutService.requestPayout({ workerId: id, amountPaise: 10000, destination: { method: 'bank', bankAccount: 'XXXX0000', bankIfsc: 'SBIN0001234' } }))
    .rejects.toMatchObject({ code: 'PAYOUT_UNKNOWN_DESTINATION' });
  await expect(payoutService.requestPayout({ workerId: id, amountPaise: 10000, destination: { method: 'bank', bankAccount: '999999999012', bankIfsc: 'SBIN0001234' } }))
    .rejects.toMatchObject({ code: 'PAYOUT_UNKNOWN_DESTINATION' });
  await expect(payoutService.requestPayout({ workerId: id, amountPaise: 10000, destination: { method: 'bank', bankAccount: 'XXXX9012', bankIfsc: 'HDFC0001234' } }))
    .rejects.toMatchObject({ code: 'PAYOUT_UNKNOWN_DESTINATION' });
});

test('an unknown pro cannot withdraw anywhere', async () => {
  rich();
  await expect(payoutService.requestPayout({ workerId: new mongoose.Types.ObjectId(), amountPaise: 10000, destination: { method: 'upi', upiId: 'a@ybl' } }))
    .rejects.toMatchObject({ code: 'PAYOUT_UNKNOWN_DESTINATION' });
});

test('Razorpay with UPI checks off: unchecked, marked not_enabled, never invalid', async () => {
  const { checkUpi } = require('../src/modules/payment/upi-check');
  config.razorpay.keyId = 'rzp_live_x'; config.razorpay.keySecret = 'y';
  jest.spyOn(rz, 'validateVpa').mockRejectedValue(Object.assign(new Error('The requested URL was not found on the server.'), { code: 'RAZORPAY_API_ERROR' }));
  expect(await checkUpi('ravi@oksbi')).toEqual({ status: 'unchecked', reason: 'not_enabled' });
  expect(await checkUpi('ravi@oksbi')).toEqual({ status: 'unchecked', reason: 'not_enabled' });
});
