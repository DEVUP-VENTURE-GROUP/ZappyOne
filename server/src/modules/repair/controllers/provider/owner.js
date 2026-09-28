const mongoose = require('mongoose');



/** The owning entity, taken from the verified token — never from user input. */
function ownerOf(req) {
  if (req.auth.role === 'shop') return { shopId: new mongoose.Types.ObjectId(req.auth.sub), workerId: null };
  return { shopId: null, workerId: new mongoose.Types.ObjectId(req.auth.sub) };
}

/** Mongo filter matching only this provider's rows. */
function ownerFilter(req) {
  const o = ownerOf(req);
  return o.shopId ? { shopId: o.shopId } : { workerId: o.workerId };
}

module.exports = {
  ownerOf,
  ownerFilter,
};
