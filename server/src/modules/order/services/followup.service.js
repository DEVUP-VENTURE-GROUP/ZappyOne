const orderRepo = require('../order.repository');
const Order = require('../order.model');
const Worker = require('../../worker/worker.model');
const { redis } = require('../../../config/redis');
const { createOrder } = require('./create.service');

/** After or during a job: one-tap rebook and the hand-off to a shop. */

/**
 * One-click rebook: clone a past order and place it again through createOrder,
 * so pricing is recomputed fresh and all gates (abuse, one-active-order,
 * geo-readiness, dispatch) apply exactly as a normal booking.
 */
async function rebookOrder({ userId, sourceOrderId }) {
  const src = await Order.findById(sourceOrderId).lean();
  if (!src) throw Object.assign(new Error('Original order not found'), { status: 404 });
  if (String(src.userId) !== String(userId)) throw Object.assign(new Error('Not your order'), { status: 403 });

  const p = src.pickupLocation || {};
  const pickupLocation = {
    lat: p.coordinates?.[1],
    lng: p.coordinates?.[0],
    address: p.address,
    landmark: p.landmark || '',
    flatNumber: p.flatNumber || '',
    notes: p.notes || '',
  };
  if (pickupLocation.lat == null || pickupLocation.lng == null || !pickupLocation.address) {
    throw Object.assign(new Error('Original order is missing location details — please book normally.'), { status: 400 });
  }

  const d = src.dropLocation;
  const dropLocation = d?.coordinates?.length === 2
    ? { lat: d.coordinates[1], lng: d.coordinates[0], address: d.address || pickupLocation.address }
    : undefined;

  return createOrder({
    userId,
    service: src.service,
    subCategory: src.subCategory || undefined,
    pickupLocation,
    dropLocation,
    description: src.description || '',
    images: [],
    scheduledAt: null, // rebook = now
    paymentMethod: src.payment?.method || 'upi',
    priority: src.priority === 'emergency' ? 'emergency' : 'normal',
    deviceBrand: src.deviceBrand || undefined,
    deviceModel: src.deviceModel || undefined,
    deviceSeries: src.deviceSeries || undefined,
    partsTier: src.partsTier || undefined,
    serviceMode: src.serviceMode || undefined,
    vehicleType: src.vehicleType || undefined,
    pricingModel: src.pricingModel || undefined,
    tier: src.tier || 'standard',
  });
}

/**
 * Mid-job "Pick & Go" escalation — the assigned worker determines the repair
 * needs shop tools/equipment and asks the customer to bring the device to a
 * shop instead of finishing on-site. Does not change order.status; it only
 * records the request and waits for the customer to confirm.
 */
async function requestShopHandoff({ orderId, workerId, shopId, reason }) {
  const order = await orderRepo.findById(orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (String(order.workerId) !== String(workerId)) {
    throw Object.assign(new Error('Not your order'), { status: 403 });
  }
  if (!['on_the_way', 'arrived', 'in_progress'].includes(order.status)) {
    throw Object.assign(new Error('Shop handoff can only be requested once the job has started'), { status: 409, code: 'INVALID_STATUS' });
  }
  if (order.fulfillmentMode === 'pickup_at_shop') {
    throw Object.assign(new Error('This order is already routed through a shop'), { status: 409, code: 'ALREADY_PICKUP' });
  }

  let resolvedShopId = shopId;
  if (!resolvedShopId) {
    resolvedShopId = (await Worker.findById(workerId).select('shopId').lean())?.shopId;
  }
  if (!resolvedShopId) {
    throw Object.assign(new Error('No shop to hand this job off to — you are not linked to a shop.'), { status: 400, code: 'NO_SHOP_LINKED' });
  }

  await Order.findByIdAndUpdate(orderId, {
    $set: {
      shopHandoff: {
        shopId: resolvedShopId,
        requestedBy: 'worker',
        reason: reason || undefined,
        requestedAt: new Date(),
        status: 'pending_confirmation',
      },
    },
  });

  redis.publish('order:event', JSON.stringify({
    orderId: String(orderId),
    event: 'order.shop_handoff_requested',
    payload: { shopId: String(resolvedShopId), reason: reason || null },
  })).catch(() => {});

  try {
    const notificationService = require('../../notification/notification.service');
    const Shop = require('../../shop/shop.model');
    const shop = await Shop.findById(resolvedShopId).select('businessName').lean();
    await notificationService.notify({
      recipient: { kind: 'user', id: order.userId },
      type: 'shop_handoff_requested',
      title: '🔧 This repair needs shop tools',
      body: `${reason ? reason + ' — ' : ''}Confirm sending your device to ${shop?.businessName || 'the shop'} to continue.`,
      deepLink: `/orders/${orderId}`,
      data: { orderId: String(orderId), shopId: String(resolvedShopId) },
    });
  } catch {}

  return orderRepo.findById(orderId);
}

/** Customer's response to a worker-initiated shop handoff request. */
async function respondShopHandoff({ orderId, userId, accept }) {
  const order = await orderRepo.findById(orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (String(order.userId) !== String(userId)) {
    throw Object.assign(new Error('Not your order'), { status: 403 });
  }
  if (order.shopHandoff?.status !== 'pending_confirmation') {
    throw Object.assign(new Error('No pending shop handoff request for this order'), { status: 409, code: 'NO_PENDING_HANDOFF' });
  }

  const shopId = order.shopHandoff.shopId;
  const update = accept
    ? {
        'shopHandoff.status': 'confirmed',
        'shopHandoff.respondedAt': new Date(),
        fulfillmentMode: 'pickup_at_shop',
        preferredShopId: shopId,
      }
    : {
        'shopHandoff.status': 'declined',
        'shopHandoff.respondedAt': new Date(),
      };

  await Order.findByIdAndUpdate(orderId, { $set: update });

  redis.publish('order:event', JSON.stringify({
    orderId: String(orderId),
    event: 'order.shop_handoff_responded',
    payload: { accept: !!accept },
  })).catch(() => {});

  try {
    const notificationService = require('../../notification/notification.service');
    await notificationService.notify({
      recipient: { kind: 'worker', id: order.workerId },
      type: accept ? 'shop_handoff_confirmed' : 'shop_handoff_declined',
      title: accept ? '✅ Customer confirmed shop drop-off' : 'Customer declined shop drop-off',
      body: accept ? 'They will bring the item to the shop.' : 'Continue the job on-site as originally planned.',
      deepLink: `/worker/jobs/${orderId}`,
      data: { orderId: String(orderId) },
    });
  } catch {}

  return orderRepo.findById(orderId);
}

module.exports = {
  rebookOrder,
  requestShopHandoff,
  respondShopHandoff,
};
