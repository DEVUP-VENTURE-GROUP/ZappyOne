const mongoose = require('mongoose');

/**
 * VerticalConfig — per-vertical pricing and rules, admin-controlled.
 *
 * One active document per vertical (mobile | construction | vehicle).
 * Versioned so every change is auditable.
 *
 * Mobile:       inspection fee, spare part costs, urgent surcharge, warranty days
 * Construction: visit fee, hourly rate, material markup, urgent surcharge %
 * Vehicle:      base visit fee, per-km fee, emergency flat, night flat surcharge
 */

const sparePartSchema = new mongoose.Schema(
  {
    brand:      { type: String, required: true },
    service:    { type: String, required: true }, // screen_replacement | battery_replacement | …
    model:      { type: String, default: 'all' }, // 'all' = applies to any model of that brand
    costPaise:  { type: Number, required: true, min: 0 },
    isActive:   { type: Boolean, default: true },
  },
  { timestamps: true }
);

const mobileSchema = new mongoose.Schema(
  {
    inspectionFeePaise:   { type: Number, default: 15000 }, // ₹150
    urgentSurchargePaise: { type: Number, default: 10000 }, // ₹100 flat for same-day urgent
    warrantyDays:         { type: Number, default: 30 },
    spareParts:           { type: [sparePartSchema], default: [] },
  },
  { _id: false }
);

const constructionSchema = new mongoose.Schema(
  {
    visitFeePaise:         { type: Number, default: 10000 }, // ₹100 site visit
    perHourFeePaise:       { type: Number, default: 40000 }, // ₹400/hr
    materialMarkupPct:     { type: Number, default: 15, min: 0, max: 100 }, // 15% markup on materials
    urgentSurchargePct:    { type: Number, default: 20, min: 0, max: 100 }, // 20% for urgent bookings
  },
  { _id: false }
);

const vehicleSchema = new mongoose.Schema(
  {
    baseVisitFeePaise:       { type: Number, default: 5000 },  // ₹50
    perKmFeePaise:           { type: Number, default: 1500 },  // ₹15/km
    emergencySurchargePaise: { type: Number, default: 10000 }, // ₹100 flat emergency
    nightSurchargePaise:     { type: Number, default: 8000 },  // ₹80 flat night
    nightStartHour:          { type: Number, default: 22, min: 0, max: 23 }, // 10pm
    nightEndHour:            { type: Number, default: 6,  min: 0, max: 23 }, // 6am
  },
  { _id: false }
);

// New vertical schemas

const laptopSchema = new mongoose.Schema({
  visitFeePaise:       { type: Number, default: 15000 },  // ₹150
  diagnosticFeePaise:  { type: Number, default: 10000 },  // ₹100
  urgentSurchargePct:  { type: Number, default: 20 },
  warrantyDays:        { type: Number, default: 30 },
}, { _id: false });

const smartDeviceSchema = new mongoose.Schema({
  visitFeePaise:      { type: Number, default: 20000 },   // ₹200
  urgentSurchargePct: { type: Number, default: 25 },
}, { _id: false });

const familyAssistSchema = new mongoose.Schema({
  baseFeePaise:       { type: Number, default: 10000 },   // ₹100 base visit
  emergencyFeePaise:  { type: Number, default: 20000 },   // ₹200 emergency flat
  companionHourPaise: { type: Number, default: 50000 },   // ₹500/hr companion
}, { _id: false });

const eventCrewSchema = new mongoose.Schema({
  perHourFeePaise:    { type: Number, default: 50000 },   // ₹500/hr per crew
  urgentSurchargePct: { type: Number, default: 30 },
  minHours:           { type: Number, default: 2 },
}, { _id: false });

const petSchema = new mongoose.Schema({
  visitFeePaise:      { type: Number, default: 5000 },    // ₹50
  emergencyFeePaise:  { type: Number, default: 15000 },   // ₹150 emergency
}, { _id: false });

const VERTICALS = [
  'mobile', 'laptop', 'smart_device',
  'vehicle',
  'family_assist', 'event_crew', 'pet',
  'construction', // kept — disabled at service level, re-enable anytime
];

const verticalConfigSchema = new mongoose.Schema(
  {
    vertical:   { type: String, enum: VERTICALS, required: true, index: true },
    isActive:   { type: Boolean, default: false, index: true },
    version:    { type: Number, required: true },
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    notes:      String,

    // Existing verticals
    mobile:       { type: mobileSchema },
    construction: { type: constructionSchema },
    vehicle:      { type: vehicleSchema },

    // New verticals
    laptop:       { type: laptopSchema },
    smart_device: { type: smartDeviceSchema },
    family_assist:{ type: familyAssistSchema },
    event_crew:   { type: eventCrewSchema },
    pet:          { type: petSchema },
  },
  { timestamps: true }
);

// Only one active config per vertical
verticalConfigSchema.index(
  { vertical: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

module.exports = mongoose.model('VerticalConfig', verticalConfigSchema);
