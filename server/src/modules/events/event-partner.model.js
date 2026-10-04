const mongoose = require('mongoose');

const eventPartnerSchema = new mongoose.Schema({
  businessName: { type: String, required: true, trim: true },
  ownerName:    { type: String, required: true },
  phone:        { type: String, sparse: true },  // required for OTP path; optional for Google auth
  email:        { type: String, sparse: true },
  googleId:     { type: String, sparse: true },  // set when partner signs in via Google

  // Service areas
  cities:          { type: [String], default: [] },
  serviceRadiusKm: { type: Number, default: 30 },

  // KYC
  kyc: {
    status:     { type: String, enum: ['not_submitted', 'pending', 'approved', 'rejected'], default: 'not_submitted' },
    // Structured document fields (S3 keys)
    aadharFront:          String, // mandatory
    aadharBack:           String, // mandatory
    panCard:              String, // mandatory
    liveSelfie:           String, // mandatory
    gstCertificate:       String, // optional
    businessRegistration: String, // optional
    // Legacy flat array kept for backward compat
    documents:  { type: [String], default: [] },
    // Review
    gstNumber:  String,
    panNumber:  String,
    reviewedAt: Date,
    reviewNote: String,
  },

  // Profile
  profilePhotoKey:   String, // S3 key for business profile photo
  bio:               String,
  portfolioImages:   { type: [String], default: [] },
  yearsExperience:   Number,
  completedEvents:   { type: Number, default: 0 },
  rating:            { type: Number, default: 0, min: 0, max: 5 },
  reviewCount:       { type: Number, default: 0 },

  // Financials
  totalEarningsPaise: { type: Number, default: 0 },

  isActive:  { type: Boolean, default: true },
  isBlocked: { type: Boolean, default: false },

  // Blocked date slots (partner marks unavailable dates)
  blockedDates: { type: [Date], default: [] },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
}, { timestamps: true });

// Password, verified email and first-time setup, shared by every account type.
eventPartnerSchema.plugin(require('../account/account.plugin'));

module.exports = mongoose.model('EventPartner', eventPartnerSchema);
