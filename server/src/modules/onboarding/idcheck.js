/**
 * Instant ID check for providers (workers and shop owners) — with the manual
 * review as the backup it always was.
 *
 *   always    the Aadhaar number must pass its checksum (Verhoeff) and a PAN
 *             its format — typos and made-up numbers stop here, no keys needed
 *   with keys (KYC_API_TOKEN, KYC_API_BASE — a KYC provider such as Surepass):
 *     aadhaar  a one-time code to the mobile linked to that Aadhaar; the
 *              provider types it; the name on Aadhaar comes back
 *     pan      the name registered to the PAN comes back
 *             each name is matched against the name on their ZappyOne account
 *   without   the instant check is not offered; identity is reviewed by hand in
 *   keys      Admin → Verification, exactly as before
 *
 *   result   an IdentityCheck row per attempt. Verified with a matching name →
 *            the reviewer sees "ID verified automatically" and approves in one
 *            tap; a name mismatch is shown to the reviewer, never auto-passed.
 *
 *   privacy  the full Aadhaar number is never stored — only its last 4 — and
 *            neither is the Aadhaar photo or address. PAN is kept as entered
 *            (it is already a form field).
 */
const https = require('https');
const mongoose = require('mongoose');
const logger = require('../../core/logger');

const BASE = () => (process.env.KYC_API_BASE || 'https://kyc-api.surepass.io/api/v1').replace(/\/$/, '');
const TOKEN = () => process.env.KYC_API_TOKEN || '';
const configured = () => !!TOKEN();
const NAME_MATCH = 0.6;

const schema = new mongoose.Schema({
  ownerKind: { type: String, enum: ['worker', 'shop'], required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  type: { type: String, enum: ['aadhaar_otp', 'pan'], required: true },
  status: { type: String, enum: ['otp_sent', 'verified', 'mismatch', 'failed'], required: true },
  last4: { type: String, default: '' },
  pan: { type: String, default: '' },
  nameOnId: { type: String, default: '' },
  nameOnAccount: { type: String, default: '' },
  nameScore: { type: Number, default: null },
  dob: { type: String, default: '' },
  gender: { type: String, default: '' },
  ref: { type: String, default: '', select: false }, // the provider's session id for the OTP
  error: { type: String, default: '' },
}, { timestamps: true });
schema.index({ ownerId: 1, type: 1, createdAt: -1 });
const IdentityCheck = mongoose.models.IdentityCheck || mongoose.model('IdentityCheck', schema);

const err = (status, code, message) => Object.assign(new Error(message), { status, code });

/* Local checks — no keys */

const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
/** Aadhaar's own checksum: a typo or an invented number fails here. */
function aadhaarValid(raw) {
  const n = String(raw || '').replace(/\s|-/g, '');
  if (!/^[2-9]\d{11}$/.test(n)) return false;
  let c = 0;
  n.split('').reverse().forEach((d, i) => { c = D[c][P[i % 8][Number(d)]]; });
  return c === 0;
}
const panValid = (pan) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(pan || '').toUpperCase());

/** How alike two names are, 0..1: words in common, initials counted, order ignored. */
function nameScore(a, b) {
  const words = (s) => String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  const x = words(a); const y = words(b);
  if (!x.length || !y.length) return 0;
  const used = new Set();
  let hit = 0;
  for (const w of x) {
    const j = y.findIndex((v, i) => !used.has(i) && (v === w || (w.length === 1 && v[0] === w) || (v.length === 1 && w[0] === v)));
    if (j >= 0) { used.add(j); hit += 1; }
  }
  return Math.round((hit / Math.max(x.length, y.length)) * 100) / 100;
}

/* The KYC provider */

function call(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE()}${path}`);
    const data = JSON.stringify(body);
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN()}`, 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch { /* not json */ }
        if (res.statusCode >= 200 && res.statusCode < 300 && json?.success !== false) return resolve(json?.data || json || {});
        reject(Object.assign(new Error(json?.message || `KYC provider HTTP ${res.statusCode}`), { upstream: res.statusCode }));
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('KYC provider timed out')));
    req.write(data);
    req.end();
  });
}

async function accountName({ kind, id }) {
  if (kind === 'shop') {
    const s = await require('../shop/shop.model').findById(id).select('ownerName businessName').lean();
    return s?.ownerName || '';
  }
  const w = await require('../worker/worker.model').findById(id).select('name').lean();
  return w?.name || '';
}

/* Aadhaar by OTP */

async function startAadhaar({ owner, aadhaar }) {
  const n = String(aadhaar || '').replace(/\s|-/g, '');
  if (!aadhaarValid(n)) throw err(400, 'AADHAAR_INVALID', 'That Aadhaar number is not valid. Check the 12 digits on your card.');
  if (!configured()) throw err(409, 'ID_CHECK_MANUAL', 'Instant check is not available right now. Upload your Aadhaar and our team will verify it.');
  try {
    const d = await call('/aadhaar-v2/generate-otp', { id_number: n });
    const ref = d.client_id || d.clientId;
    if (!ref) throw new Error('no client id');
    const row = await IdentityCheck.create({ ownerKind: owner.kind, ownerId: owner.id, type: 'aadhaar_otp', status: 'otp_sent', last4: n.slice(-4), ref });
    return { checkId: String(row._id), message: 'We sent a code to the mobile number linked to your Aadhaar.' };
  } catch (e) {
    logger.warn({ err: e.message, upstream: e.upstream }, '[idcheck] aadhaar otp not sent');
    await IdentityCheck.create({ ownerKind: owner.kind, ownerId: owner.id, type: 'aadhaar_otp', status: 'failed', last4: n.slice(-4), error: e.message.slice(0, 200) });
    throw err(502, 'ID_CHECK_UNAVAILABLE', 'We could not reach Aadhaar right now. Upload your Aadhaar instead and our team will verify it.');
  }
}

async function submitAadhaarOtp({ owner, checkId, otp }) {
  if (!/^\d{6}$/.test(String(otp || ''))) throw err(400, 'OTP_INVALID', 'Enter the 6-digit code.');
  const row = await IdentityCheck.findOne({ _id: checkId, ownerId: owner.id, type: 'aadhaar_otp', status: 'otp_sent' }).select('+ref');
  if (!row) throw err(404, 'NOT_FOUND', 'That code has expired. Start the check again.');
  try {
    const d = await call('/aadhaar-v2/submit-otp', { client_id: row.ref, otp: String(otp) });
    const onAccount = await accountName(owner);
    const score = nameScore(d.full_name, onAccount);
    row.set({
      status: score >= NAME_MATCH ? 'verified' : 'mismatch', nameOnId: d.full_name || '', nameOnAccount: onAccount, nameScore: score,
      dob: d.dob || '', gender: d.gender || '', ref: '',
    });
    await row.save();
    return {
      status: row.status,
      message: row.status === 'verified'
        ? 'Aadhaar verified. Our team will finish your approval quickly.'
        : `The name on Aadhaar (${d.full_name || 'unknown'}) does not match your account (${onAccount || 'no name'}). Our team will check it.`,
    };
  } catch (e) {
    if (e.status) throw e;
    logger.warn({ err: e.message, upstream: e.upstream }, '[idcheck] aadhaar otp not accepted');
    throw err(400, 'OTP_WRONG', 'That code did not work. Check it, or start again for a new one.');
  }
}

/* PAN */

async function verifyPan({ owner, pan }) {
  const p = String(pan || '').toUpperCase().trim();
  if (!panValid(p)) throw err(400, 'PAN_INVALID', 'That PAN is not valid. It is 5 letters, 4 digits, then 1 letter.');
  if (!configured()) return { status: 'manual', message: 'Saved. Our team will check it with your documents.' };
  try {
    const d = await call('/pan/pan', { id_number: p });
    const onAccount = await accountName(owner);
    const score = nameScore(d.full_name, onAccount);
    const row = await IdentityCheck.create({
      ownerKind: owner.kind, ownerId: owner.id, type: 'pan', status: score >= NAME_MATCH ? 'verified' : 'mismatch',
      pan: p, nameOnId: d.full_name || '', nameOnAccount: onAccount, nameScore: score,
    });
    return { status: row.status, message: row.status === 'verified' ? 'PAN verified.' : 'The name on this PAN does not match your account. Our team will check it.' };
  } catch (e) {
    logger.warn({ err: e.message, upstream: e.upstream }, '[idcheck] pan not verified');
    await IdentityCheck.create({ ownerKind: owner.kind, ownerId: owner.id, type: 'pan', status: 'failed', pan: p, error: e.message.slice(0, 200) });
    return { status: 'manual', message: 'We could not check it right now. Our team will verify it with your documents.' };
  }
}

/** The latest result of each check for one provider, and whether instant checks exist. */
async function statusFor(owner) {
  const rows = await IdentityCheck.find({ ownerId: owner.id }).sort({ createdAt: -1 }).limit(20).lean();
  const latest = (type) => rows.find((r) => r.type === type && r.status !== 'otp_sent') || null;
  const pick = (r) => (r ? { status: r.status, nameOnId: r.nameOnId, nameScore: r.nameScore, last4: r.last4, pan: r.pan ? `${r.pan.slice(0, 2)}•••••${r.pan.slice(-3)}` : '', at: r.updatedAt } : null);
  return { instant: configured(), aadhaar: pick(latest('aadhaar_otp')), pan: pick(latest('pan')) };
}

/** For reviewers: ID checks per provider id, verified first. Map(id → { aadhaar, pan }). */
async function forReview(ids) {
  if (!ids.length) return new Map();
  const rows = await IdentityCheck.find({ ownerId: { $in: ids }, status: { $in: ['verified', 'mismatch'] } }).sort({ createdAt: -1 }).lean();
  const out = new Map();
  for (const r of rows) {
    const k = String(r.ownerId);
    const v = out.get(k) || {};
    const key = r.type === 'pan' ? 'pan' : 'aadhaar';
    if (!v[key]) v[key] = { status: r.status, nameOnId: r.nameOnId, nameOnAccount: r.nameOnAccount, nameScore: r.nameScore, last4: r.last4, at: r.updatedAt };
    out.set(k, v);
  }
  return out;
}

module.exports = { aadhaarValid, panValid, nameScore, startAadhaar, submitAadhaarOtp, verifyPan, statusFor, forReview, configured, IdentityCheck };
