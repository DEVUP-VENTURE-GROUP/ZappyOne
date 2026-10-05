const Joi = require('joi');

/**
 * Booking for someone else: the person the provider meets at the door, when it
 * is not the customer who booked (a parent, a tenant, a colleague). Stored on
 * the booking; the provider sees it on the job and calls them, not the booker.
 */
const onSiteField = {
  name: { type: String, trim: true, maxlength: 60 },
  phone: { type: String, trim: true, maxlength: 10 },
};

/** For create-route schemas: a name and an Indian mobile number, or nothing. */
const onSiteSchema = Joi.object({
  name: Joi.string().trim().min(2).max(60).required()
    .messages({ 'string.min': 'Enter the name of the person who will be there' }),
  phone: Joi.string().trim().pattern(/^[6-9]\d{9}$/).required()
    .messages({ 'string.pattern.base': 'Enter their 10-digit mobile number' }),
}).allow(null);

/** Save it on a booking just created (never on a replayed one). Returns the value saved, or null. */
async function saveOnSite(Model, id, onSite, replayed) {
  if (!onSite || replayed) return null;
  const value = { name: onSite.name.trim(), phone: onSite.phone.trim() };
  await Model.updateOne({ _id: id }, { $set: { onSite: value } });
  return value;
}

module.exports = { onSiteField, onSiteSchema, saveOnSite };
