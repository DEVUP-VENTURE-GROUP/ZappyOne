/**
 * Admin operations that must hold under real use:
 *   - a refund the gateway refused can be retried, or recorded as a bank refund with proof
 *   - the cancellation policy can be saved more than once (versioned rows)
 *   - feature flags persist and are enforced where the feature runs
 *   - "notify me" customers hear once when a zone over them goes live
 */
jest.mock('../src/modules/payment/cashfree.client', () => ({
  createOrder: jest.fn(),
  getOrderPayments: jest.fn(),
  createRefund: jest.fn(),
  verifyWebhookSignature: jest.fn(() => true),
}));

const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const cashfree = require('../src/modules/payment/cashfree.client');
const PaymentIntent = require('../src/modules/payment/payment-intent.model');
const paymentAdmin = require('../src/modules/payment/payment-admin.service');

jest.setTimeout(60000);
beforeAll(startMongo);
afterAll(stopMongo);

const owner = { kind: 'user', id: new mongoose.Types.ObjectId() };
const failedRefund = (extra = {}) => PaymentIntent.create({
  cfOrderId: `zpy_pet_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
  owner, purpose: 'wallet_topup', amountPaise: 50000, status: 'captured', cfPaymentId: `p_${Math.random()}`,
  refund: { status: 'manual_required', amountPaise: 50000, reason: 'Cancelled' },
  reconciliationRequired: true, reconciliationReason: 'refund failed: gateway down', ...extra,
});

describe('payments needing a person', () => {
  test('lists a refused refund under needs action', async () => {
    const intent = await failedRefund();
    const out = await paymentAdmin.list({ needsAction: true });
    expect(out.items.map((i) => i.cfOrderId)).toContain(intent.cfOrderId);
    const sum = await paymentAdmin.summary({ days: 7 });
    expect(sum.needsActionCount).toBeGreaterThanOrEqual(1);
  });

  test('retry goes back through the gateway and leaves the queue on success', async () => {
    const intent = await failedRefund();
    cashfree.createRefund.mockResolvedValueOnce({ cf_refund_id: 'rf_ok' });
    const out = await paymentAdmin.retryRefund({ cfOrderId: intent.cfOrderId });
    expect(out.refunded).toBe(true);
    const fresh = await PaymentIntent.findById(intent._id).lean();
    expect(fresh.refund.status).toBe('requested');
    const queue = await paymentAdmin.list({ needsAction: true });
    expect(queue.items.map((i) => i.cfOrderId)).not.toContain(intent.cfOrderId);
  });

  test('a bank refund needs a real reference, is recorded once, and cannot be recorded twice', async () => {
    const intent = await failedRefund();
    await expect(paymentAdmin.markRefundedManually({ cfOrderId: intent.cfOrderId, reference: '12', adminId: owner.id }))
      .rejects.toMatchObject({ code: 'REFERENCE_REQUIRED' });
    const done = await paymentAdmin.markRefundedManually({ cfOrderId: intent.cfOrderId, reference: 'UTR998877', adminId: owner.id });
    expect(done.status).toBe('refunded');
    expect(done.refund.status).toBe('processed');
    await expect(paymentAdmin.markRefundedManually({ cfOrderId: intent.cfOrderId, reference: 'UTR998877', adminId: owner.id }))
      .rejects.toMatchObject({ code: 'NOT_AWAITING_REFUND' });
  });

  test('refuses a reference that is not one of ours', async () => {
    await expect(paymentAdmin.retryRefund({ cfOrderId: 'evil$where' })).rejects.toMatchObject({ code: 'BAD_REFERENCE' });
  });
});

describe('cancellation policy', () => {
  const cancellation = require('../src/modules/order/cancellation.service');

  test('can be saved repeatedly; each save is a new active version', async () => {
    await cancellation.updateConfig({ workerCancelLimit: 4 }, owner.id);
    const second = await cancellation.updateConfig({ userCancelFeeArrivedPaise: 6000 }, owner.id);
    expect(second.version).toBe(2);
    const cfg = await cancellation.getConfig();
    expect(cfg.workerCancelLimit).toBe(4); // earlier change carried forward
    expect(cfg.userCancelFeeArrivedPaise).toBe(6000);
    const CancellationConfig = require('../src/modules/order/cancellation-config.model');
    expect(await CancellationConfig.countDocuments({ isActive: true })).toBe(1);
  });

  test('the worker share of a late-cancel fee comes from the policy', async () => {
    await cancellation.updateConfig({ workerShareArrivedPct: 80, freeCancelWindowSec: 0 }, owner.id);
    const fee = await cancellation.calculateUserCancelFee({
      status: 'arrived', createdAt: new Date(Date.now() - 3600_000),
      statusHistory: [{ status: 'assigned', at: new Date(Date.now() - 3600_000) }],
    });
    expect(fee.workerCompensationPaise).toBe(Math.round(fee.feePaise * 0.8));
  });
});

describe('feature flags', () => {
  const flags = require('../src/modules/feature-flags/feature-flag.service');
  const promo = require('../src/modules/promo/promo.service');

  test('persist without expiring, and switching one off is enforced', async () => {
    await flags.set('promo_codes', false, owner.id);
    expect(await flags.isEnabled('promo_codes')).toBe(false);
    await expect(promo.applyPromo({ code: 'ANY', userId: owner.id, orderTotalPaise: 1000 }))
      .rejects.toMatchObject({ code: 'FEATURE_OFF' });
    await flags.set('promo_codes', true, owner.id);
    await expect(promo.applyPromo({ code: 'ANY', userId: owner.id, orderTotalPaise: 1000 }))
      .rejects.toMatchObject({ code: 'PROMO_INVALID' });
  });

  test('an unknown flag is refused rather than silently created', async () => {
    await expect(flags.set('free_money', true, owner.id)).rejects.toMatchObject({ code: 'UNKNOWN_FLAG' });
  });
});

describe('launch interest', () => {
  const LaunchInterest = require('../src/modules/zone/launch-interest.model');
  const zoneService = require('../src/modules/zone/zone.service');
  const notificationService = require('../src/modules/notification/notification.service');

  test('a zone going live notifies the people inside it, once each', async () => {
    const spy = jest.spyOn(notificationService, 'notify').mockResolvedValue({});
    await LaunchInterest.init();
    const inside = new mongoose.Types.ObjectId();
    const outside = new mongoose.Types.ObjectId();
    await LaunchInterest.create([
      { userId: inside, location: { type: 'Point', coordinates: [78.38, 17.44] }, cell: '17.44:78.38' },
      { userId: inside, location: { type: 'Point', coordinates: [78.385, 17.445] }, cell: '17.45:78.39' },
      { userId: outside, location: { type: 'Point', coordinates: [77.59, 12.97] }, cell: '12.97:77.59' },
    ]);
    const zone = {
      _id: new mongoose.Types.ObjectId(), name: 'Gachibowli',
      polygon: { type: 'Polygon', coordinates: [[[78.37, 17.43], [78.40, 17.43], [78.40, 17.46], [78.37, 17.46], [78.37, 17.43]]] },
    };
    const first = await zoneService.notifyLaunchInterest(zone);
    expect(first.sent).toBe(1); // two cells, one person, one message
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'service_live_in_area', recipient: { kind: 'user', id: inside } }));
    const again = await zoneService.notifyLaunchInterest(zone);
    expect(again.sent).toBe(0);
    expect(await LaunchInterest.countDocuments({ userId: outside, notifiedAt: null })).toBe(1);
    spy.mockRestore();
  });
});
