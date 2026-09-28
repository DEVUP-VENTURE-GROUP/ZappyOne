/**
 * Live Service Photos
 * ---------------------------------------------------------------------------
 * Worker captures before/during/after photos during in_progress state.
 * Photos appear in the customer's tracking page in real-time via socket.
 * Creates accountability, reduces disputes, and builds enormous trust.
 *
 * No Indian competitor has real-time in-service photo streaming.
 * Urban Company only shows photos AFTER completion. We show them LIVE.
 * ---------------------------------------------------------------------------
 */

const Order   = require('./order.model');
const { redis } = require('../../config/redis');
const logger  = require('../../core/logger');

const PHASE_LABELS = {
  before:   'Before service',
  during:   'Work in progress',
  after:    'After service',
  issue:    'Issue found',
  material: 'Materials used',
};

async function addServicePhoto({ orderId, workerId, url, phase = 'during', caption }) {
  const order = await Order.findById(orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (String(order.workerId) !== String(workerId)) {
    throw Object.assign(new Error('Not your order'), { status: 403 });
  }
  if (!['assigned', 'on_the_way', 'arrived', 'in_progress'].includes(order.status)) {
    throw Object.assign(new Error('Can only add photos during active service'), { status: 409 });
  }

  const photo = {
    url,
    phase,
    caption: caption || PHASE_LABELS[phase] || 'Service photo',
    takenAt: new Date(),
  };

  await Order.findByIdAndUpdate(orderId, {
    $push: { servicePhotos: { $each: [photo], $slice: -20 } }, // keep last 20
  });

  /* Real-time push to customer via socket */
  await redis.publish('order:event', JSON.stringify({
    orderId: String(orderId),
    event:   'service.photo',
    payload: {
      ...photo,
      takenAt: photo.takenAt.toISOString(),
      workerName: order.workerName || 'Worker',
    },
  }));

  logger.info({ orderId, phase, workerId }, '[ServicePhoto] Photo added and broadcast');
  return photo;
}

async function listServicePhotos(orderId) {
  const order = await Order.findById(orderId).select('servicePhotos').lean();
  return order?.servicePhotos || [];
}

module.exports = { addServicePhoto, listServicePhotos };
