const mongoose = require('mongoose');

/**
 * DiagnosticFlow & DiagnosticQuestion Schema — Database-driven questionnaire trees.
 * Admins can configure questions, branching logic (`showIf`), tools required, and resolved service.
 */
const diagnosticOptionSchema = new mongoose.Schema(
  {
    id:                    { type: String, required: true }, // e.g. 'screen_cracked'
    label:                 { type: String, required: true },
    description:           { type: String, default: '' },
    urgency:               { type: String, enum: ['normal', 'high', 'urgent'], default: 'normal' },
    recommendedServiceCode:{ type: String, default: '' }, // resolves to a ServiceCatalog code
    recommendedPartQuality:{ type: String, default: '' }, // e.g. 'OEM' or 'Compatible'
    tools:                 [String],
    priceHint:             { type: String, default: '' },
  },
  { _id: false }
);

const diagnosticQuestionSchema = new mongoose.Schema(
  {
    id:          { type: String, required: true }, // e.g. 'q1'
    text:        { type: String, required: true },
    subtitle:    { type: String, default: '' },
    type:        { type: String, enum: ['single', 'multi', 'text'], default: 'single' },
    showIf:      { type: mongoose.Schema.Types.Mixed, default: null }, // e.g. { q1: ['leak'] }
    options:     [diagnosticOptionSchema],
  },
  { _id: false }
);

const diagnosticFlowSchema = new mongoose.Schema(
  {
    code:        { type: String, required: true, unique: true, lowercase: true }, // e.g. 'mobile_screen' or 'ac_repair'
    category:    { type: String, required: true, index: true }, // e.g. 'mobile'
    title:       { type: String, required: true },
    description: { type: String, default: '' },
    questions:   [diagnosticQuestionSchema],
    isActive:    { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DiagnosticFlow', diagnosticFlowSchema);
