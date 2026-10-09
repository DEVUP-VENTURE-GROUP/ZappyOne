/**
 * Where a customer booked, on their own record (User.recentLocations): what
 * admin sees as their location, and the places their app offers next time.
 * The first version's orders already did this; every kind of booking does now.
 */
const { KINDS } = require('./kinds');

async function remember(kind, booking) {
  const doc = booking?.toObject ? booking.toObject() : booking;
  const at = require('./kinds').whereOf(kind, doc);
  if (!doc?.userId || !at?.address || typeof at.lat !== 'number') return;
  await require('../user/user.model').recordRecentLocation(doc.userId, { address: at.address, lat: at.lat, lng: at.lng });
}

module.exports = { remember };
