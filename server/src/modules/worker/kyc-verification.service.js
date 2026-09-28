const config = require('../../config');
const logger = require('../../core/logger');

/**
 * 3rd-party KYC verification (Surepass-style REST provider).
 *
 * Activates only when KYC_PROVIDER + KYC_API_URL + KYC_API_KEY are configured;
 * otherwise every check returns { verified: null, skipped: true } so the flow
 * cleanly falls back to manual admin review. Endpoint paths and the response
 * mapping follow Surepass conventions and are the only provider-specific bits —
 * adjust here if you use a different provider.
 */
function isConfigured() {
  return !!(config.kyc.provider && config.kyc.apiUrl && config.kyc.apiKey);
}

async function call(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.kyc.timeoutMs);
  try {
    const res = await fetch(`${config.kyc.apiUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.kyc.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: data?.message || `Provider error ${res.status}`, raw: data };
    }
    return { ok: true, raw: data };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'Verification timed out' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

function nameMatch(a, b) {
  if (!a || !b) return null;
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  const A = norm(a), B = norm(b);
  if (!A || !B) return null;
  if (A === B) return 1;
  const at = new Set(A.split(' ')), bt = new Set(B.split(' '));
  const inter = [...at].filter((t) => bt.has(t)).length;
  return Math.round((inter / Math.max(at.size, bt.size)) * 100) / 100; // 0..1 token overlap
}

/** Bank account penny-drop / validation. */
async function verifyBankAccount({ accountNumber, ifsc, name }) {
  if (!isConfigured()) return { check: 'bank', verified: null, skipped: true };
  if (!accountNumber || !ifsc) return { check: 'bank', verified: false, error: 'Missing account number or IFSC' };

  const r = await call('/bank-verification/', { id_number: accountNumber, ifsc });
  if (!r.ok) return { check: 'bank', verified: false, error: r.error, checkedAt: new Date() };
  const d = r.raw?.data || r.raw || {};
  const holder = d.full_name || d.account_holder_name || d.name_at_bank || null;
  const exists = d.account_exists ?? d.status === 'success' ?? true;
  return {
    check: 'bank',
    verified: !!exists,
    accountHolderName: holder,
    nameMatchScore: nameMatch(name, holder),
    checkedAt: new Date(),
  };
}

/** PAN validation (number → registered name + status). */
async function verifyPan({ pan, name }) {
  if (!isConfigured()) return { check: 'pan', verified: null, skipped: true };
  if (!pan) return { check: 'pan', verified: false, error: 'Missing PAN number' };

  const r = await call('/pan/', { id_number: String(pan).toUpperCase() });
  if (!r.ok) return { check: 'pan', verified: false, error: r.error, checkedAt: new Date() };
  const d = r.raw?.data || r.raw || {};
  const registered = d.full_name || d.registered_name || d.name || null;
  const valid = d.pan_status ? d.pan_status === 'VALID' || d.pan_status === 'ACTIVE' : !!registered;
  return {
    check: 'pan',
    verified: !!valid,
    registeredName: registered,
    nameMatchScore: nameMatch(name, registered),
    checkedAt: new Date(),
  };
}

module.exports = { isConfigured, verifyBankAccount, verifyPan, nameMatch };
