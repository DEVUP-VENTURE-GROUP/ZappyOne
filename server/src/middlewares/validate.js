/**
 * Request validation with messages people can act on.
 *
 * Joi's own messages ('"unitPricePaise" must be greater than or equal to 0')
 * read like code, and most screens show the server's `error` as it is. So
 * every failure becomes a plain sentence about the field in everyday words,
 * money in rupees: "Price must be at least ₹1", "Enter a valid 10-digit
 * mobile number". `error` is the first problem; `details` lists them all;
 * `fields` names the inputs, for forms that highlight them.
 */

/** Everyday names for field keys that don't read well on their own. */
const LABELS = {
  phone: 'mobile number', otp: 'code', pincode: 'PIN code', email: 'email', password: 'password',
  newPassword: 'new password', currentPassword: 'current password', identifier: 'mobile number or email',
  lat: 'location', lng: 'location', coordinates: 'location', address: 'address', line1: 'address',
  businessName: 'business name', ownerName: 'your name', name: 'name', reason: 'reason',
  diagnosisSummary: 'what you found', label: 'description', quantity: 'quantity',
  eventDate: 'event date', eventTimeSlot: 'time', guestCount: 'number of guests',
  scheduledAt: 'date and time', rating: 'rating', comment: 'comment', title: 'title',
};

const PHONE_KEYS = new Set(['phone', 'contactPhone', 'emergencyPhone']);

function labelOf(key) {
  if (!key) return 'this field';
  if (LABELS[key]) return LABELS[key];
  return String(key)
    .replace(/Paise$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .trim() || 'this field';
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const rupees = (paise) => `₹${(Number(paise) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function humanize(d) {
  // An item in a list is named by its list ("one of the ways of working"), never "3".
  const path = (d.path || []).filter((p) => typeof p === 'string');
  const key = typeof d.context?.key === 'number' || /^\d+$/.test(String(d.context?.key ?? ''))
    ? path[path.length - 1]
    : d.context?.key;
  const isMoney = /Paise$/.test(key || '');
  const label = labelOf(key);
  const limit = d.context?.limit;
  switch (d.type) {
    case 'any.required':
    case 'string.empty':
      return `Please enter ${label}.`;
    case 'string.min':
      return `${cap(label)} is too short. Use at least ${limit} characters.`;
    case 'string.max':
      return `${cap(label)} is too long. Use at most ${limit} characters.`;
    case 'string.email':
      return 'Enter a valid email address.';
    case 'string.pattern.base':
    case 'string.pattern.name':
      if (PHONE_KEYS.has(key)) return 'Enter a valid 10-digit mobile number.';
      if (key === 'otp' || key === 'code') return 'Enter the code exactly as you received it.';
      if (key === 'pincode') return 'Enter a valid 6-digit PIN code.';
      return `${cap(label)} is not in the right format.`;
    case 'number.base':
    case 'number.integer':
      return isMoney ? `Enter ${label} in rupees, numbers only.` : `${cap(label)} must be a whole number.`;
    case 'number.min':
      return isMoney ? `${cap(label)} must be at least ${rupees(limit)}.` : `${cap(label)} must be at least ${limit}.`;
    case 'number.max':
      return isMoney ? `${cap(label)} can be at most ${rupees(limit)}.` : `${cap(label)} can be at most ${limit}.`;
    case 'any.only':
      return `Choose a valid ${label}.`;
    case 'array.min':
      return `Add at least ${limit} ${label}.`;
    case 'array.max':
      return `You can add at most ${limit} ${label}.`;
    case 'date.base':
    case 'date.min':
    case 'date.max':
      return `Choose a valid ${label}.`;
    case 'object.missing':
    case 'object.xor':
    case 'object.and':
    case 'object.with':
    case 'object.without':
    case 'object.nand':
      return 'Some details are missing. Please check the form and try again.';
    case 'custom':
      return d.message;
    case 'any.custom':
    case 'any.invalid':
      // A custom rule that wrote its own sentence keeps it.
      return d.context?.message || (d.message && !/^"/.test(d.message) ? d.message : `${cap(label)} is not valid.`);
    default:
      return `${cap(label)} is not valid.`;
  }
}

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { value, error } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      errors: { wrap: { label: false } },
    });
    if (error) {
      const details = [...new Set(error.details.map(humanize))];
      return res.status(400).json({
        error: details[0] || 'Please check the form and try again.',
        code: 'VALIDATION_FAILED',
        details,
        fields: [...new Set(error.details.map((d) => d.path.join('.')))],
      });
    }
    req[source] = value;
    next();
  };
}

module.exports = { validate, humanize };
