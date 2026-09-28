const express = require('express');
const Joi = require('joi');
const ctrl = require('./upload.controller');
const { authenticate } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');

const router = express.Router();

// Content-type → allowed file extensions whitelist.
// An attacker can't presign a PHP shell as image/jpeg if the filename
// extension is also validated. Both must match.
const CONTENT_TYPE_EXTS = {
  'image/jpeg':       ['.jpg', '.jpeg'],
  'image/jpg':        ['.jpg', '.jpeg'],
  'image/png':        ['.png'],
  'image/webp':       ['.webp'],
  'image/heic':       ['.heic'],
  'application/pdf':  ['.pdf'],
  // Audio — voice tip notes recorded in-browser
  'audio/webm':       ['.webm'],
  'audio/mp4':        ['.mp4', '.m4a'],
  'audio/ogg':        ['.ogg', '.oga'],
  /**
   * Video — short catalog clips of a symptom.
   *
   * A flickering screen or a boot loop cannot be photographed usefully, so the
   * problem catalog accepts a clip. Same rule as everything else here: the
   * content type and the filename extension must agree, so a script cannot be
   * presigned by claiming to be a video.
   */
  'video/mp4':        ['.mp4', '.m4v'],
  'video/webm':       ['.webm'],
  'video/quicktime':  ['.mov'],
};

// Audio content types skip the extension check (browser blobs have no extension)
const AUDIO_TYPES = new Set(['audio/webm', 'audio/mp4', 'audio/ogg']);

router.post(
  '/presign',
  authenticate,
  validate(Joi.object({
    folder: Joi.string().valid(
      'kyc', 'kyc-docs', 'profile', 'order-proof', 'vehicle-health',
      'completion-photos', 'order-images', 'voice-tips', 'event-photos', 'shop',
      // Catalog artwork, uploaded by admin rather than pasted as a link.
      'catalog', 'brands', 'device-models', 'problems', 'problem-categories',
      'service-images',
    ).required(),
    contentType: Joi.string().valid(...Object.keys(CONTENT_TYPE_EXTS)).required(),
    // Optional original filename — used for extension validation only; never stored.
    filename: Joi.string().max(260).optional().allow('', null),
  })),
  (req, res, next) => {
    const { filename, contentType } = req.body;
    // Audio blobs recorded in-browser have no filename — skip extension check.
    if (filename && !AUDIO_TYPES.has(contentType)) {
      const ext = ('.' + filename.split('.').pop()).toLowerCase();
      const allowed = CONTENT_TYPE_EXTS[contentType] || [];
      if (!allowed.includes(ext)) {
        return res.status(400).json({
          error: `File extension "${ext}" does not match content type "${contentType}"`,
          code: 'EXTENSION_MISMATCH',
        });
      }
    }
    next();
  },
  ctrl.presign
);

router.get('/download/:key(*)', authenticate, ctrl.download);

module.exports = router;
