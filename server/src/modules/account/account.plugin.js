/**
 * Sign-in and email fields every ZappyOne account carries: customers,
 * independent workers, shops and event partners. One plugin so the four
 * account models cannot drift apart.
 *
 * Secrets (password hash, token hashes) are never selected by default. Tokens
 * are stored only as SHA-256 hashes, so a database read cannot be used to log
 * in or verify someone else's email.
 */
function accountPlugin(schema) {
  const add = (path, def) => { if (!schema.path(path)) schema.add({ [path]: def }); };

  add('passwordHash', { type: String, select: false });
  schema.add({
    passwordSetAt: { type: Date, default: null },
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: null },
    /** A change of email waits here until its link is opened. */
    emailVerification: {
      type: new (require('mongoose').Schema)({
        email: { type: String, lowercase: true, trim: true },
        tokenHash: String,
        expiresAt: Date,
        sentAt: Date,
      }, { _id: false }),
      select: false,
      default: undefined,
    },
    passwordReset: {
      type: new (require('mongoose').Schema)({ tokenHash: String, expiresAt: Date }, { _id: false }),
      select: false,
      default: undefined,
    },
    /** Set once the account finished first-time setup (name, password, email where required). */
    profileCompletedAt: { type: Date, default: null },
    /** When we last asked for a profile photo; asked once, skipping is fine. */
    photoPromptSeenAt: { type: Date, default: null },
    /** The last "What's new" this account has seen, so each update is shown once. */
    lastSeenRelease: { type: String, default: null },
  });
  schema.index({ 'emailVerification.tokenHash': 1 }, { sparse: true });
  schema.index({ 'passwordReset.tokenHash': 1 }, { sparse: true });
}

module.exports = accountPlugin;
