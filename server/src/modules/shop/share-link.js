// A partner's own storefront link: the code in it is theirs alone, a booking that arrives with it and books them is their customer, and for their first months on ZappyOne it pays the own-link commission (Economics → Partner commission).
const crypto = require('crypto');
const Shop = require('./shop.model');
const Worker = require('../worker/worker.model');

const modelOf = (kind) => (kind === 'shop' ? Shop : Worker);
const newCode = () => crypto.randomBytes(9).toString('base64').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12).padEnd(12, '7');

async function linkFor({ kind, id }, { webBase = process.env.CLIENT_URL || 'https://zappyone.com', vertical = null } = {}) {
  const M = modelOf(kind);
  let doc = await M.findById(id).select('shareCode createdAt').lean();
  if (!doc) return null;
  for (let tries = 0; !doc.shareCode && tries < 3; tries += 1) {
    try { doc = await M.findOneAndUpdate({ _id: id, shareCode: { $exists: false } }, { $set: { shareCode: newCode() } }, { new: true }).select('shareCode createdAt').lean() || await M.findById(id).select('shareCode createdAt').lean(); } catch (e) { if (e.code !== 11000) throw e; }
  }
  const s = await require('../pricing/services/config.service').partnerCommissionSettings();
  const until = new Date(new Date(doc.createdAt).getTime() + (s.ownLinkMonths || 0) * 30 * 86400000);
  const params = new URLSearchParams({ via: doc.shareCode, ...(vertical && { service: vertical }) });
  return { code: doc.shareCode, url: `${webBase.replace(/\/$/, '')}/storefront/${kind}/${id}?${params}`, ownLinkPct: s.ownLinkPct, until, active: until > new Date() };
}

// True only when the code is the booked provider's own.
async function matches({ via, shopId, workerId }) {
  if (!via || (!shopId && !workerId)) return false;
  const doc = await modelOf(shopId ? 'shop' : 'worker').findById(shopId || workerId).select('shareCode').lean();
  return !!doc?.shareCode && doc.shareCode === String(via).toLowerCase();
}

// The own-link rate while the partner is inside their first months; after that, null (their normal rate applies).
async function ownLinkPct({ kind, id }) {
  const s = await require('../pricing/services/config.service').partnerCommissionSettings();
  const doc = await modelOf(kind).findById(id).select('createdAt').lean();
  if (!doc || !Number.isFinite(Number(s.ownLinkPct))) return null;
  return new Date(doc.createdAt).getTime() + (s.ownLinkMonths || 0) * 30 * 86400000 > Date.now() ? Number(s.ownLinkPct) : null;
}

module.exports = { linkFor, matches, ownLinkPct };
