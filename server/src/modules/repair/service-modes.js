/**
 * How a job physically happens — one list, imported everywhere.
 *
 * This array was copy-pasted into ten places: four schema enums and six Joi
 * route schemas. Joi's `stripUnknown` DELETES a value a schema does not list
 * rather than rejecting it, so a mode added to the models but missed in one
 * route would not error — the field would silently vanish and the booking
 * would be written as `doorstep`. That is the same failure that filed laptop
 * prices under mobile. One list removes the possibility.
 *
 * No dependencies on purpose: every model and route can import this without
 * any risk of a circular require.
 */

const SERVICE_MODES = [
  /** Technician travels to the customer's address, at an agreed time. */
  'doorstep',
  /** Customer brings the item to the provider's premises. */
  'workshop',
  /** Platform collects, the provider repairs, the platform returns. */
  'pickup_repair',
  /** Inspection only — a complete job that ends with a report. */
  'diagnosis_only',
  /** Nothing physical changes hands; resolved over a call or a session. */
  'remote_support',
  /**
   * Technician travels to wherever the customer is STRANDED, now.
   *
   * Not a synonym for doorstep. Doorstep is scheduled at a known address with
   * the item sitting safely indoors; roadside is unplanned, at a live GPS
   * position that may be a highway shoulder, and the customer cannot leave.
   * It therefore carries its own urgency, its own arrival clock and its own
   * fee — conflating the two would promise a stranded rider a slot next
   * Tuesday. Introduced for two-wheelers, where most emergency demand lives.
   */
  'roadside',
];

/** Modes where the customer is waiting at a live location, not an address. */
const ON_LOCATION_MODES = ['doorstep', 'roadside'];

module.exports = { SERVICE_MODES, ON_LOCATION_MODES };
