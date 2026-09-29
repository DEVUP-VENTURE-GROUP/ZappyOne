/**
 * Cashfree JS SDK wrapper.
 *
 * Flow:
 *   1. Backend creates Cashfree order → returns paymentSessionId + cfOrderId
 *   2. Frontend calls openCheckout({ paymentSessionId, cashfreeEnv, amountPaise, purpose })
 *   3. Zappy-branded pre-checkout sheet appears (if amountPaise provided)
 *   4. User confirms → Cashfree Drop opens (modal)
 *   5. On success: { cfOrderId, cfPaymentId } is returned
 *   6. Frontend POSTs /api/payments/verify for instant UI confirmation
 *   7. Cashfree webhook is the SOURCE OF TRUTH — verify is just for UX
 */

const SDK_URL = 'https://sdk.cashfree.com/js/v3/cashfree.js';
let sdkPromise = null;

function loadSdk() {
  if (window.Cashfree) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load Cashfree SDK'));
    document.body.appendChild(s);
  });
  return sdkPromise;
}

/** Escape text that goes into the sheet's HTML. */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Confirmation before the gateway opens: what you're paying for, how much,
 * and who processes it. Plain on purpose — this is the moment trust matters,
 * and effects read as a sales pitch. A bottom sheet on phones, a centred
 * card on larger screens. Resolves on "Pay", rejects on any way of closing.
 */
function showZappySheet(amountPaise, purpose) {
  return new Promise((resolve, reject) => {
    const rupees = (amountPaise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    document.getElementById('__zappy_pay_sheet__')?.remove();

    const wide = window.matchMedia('(min-width: 640px)').matches;
    const overlay = document.createElement('div');
    overlay.id = '__zappy_pay_sheet__';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Confirm payment');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:999999', 'display:flex', 'justify-content:center',
      `align-items:${wide ? 'center' : 'flex-end'}`, 'background:rgba(15,23,42,0.45)',
      'opacity:0', 'transition:opacity 180ms ease',
    ].join(';');

    overlay.innerHTML = `
      <div id="__zappy_card__" style="width:100%;max-width:420px;background:#fff;color:#0F172A;
        border-radius:${wide ? '20px' : '20px 20px 0 0'};padding:20px 20px ${wide ? '20px' : 'calc(20px + env(safe-area-inset-bottom))'};
        font-family:Poppins,system-ui,-apple-system,'Segoe UI',sans-serif;transform:translateY(16px);transition:transform 220ms ease">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:10px">
            <img src="/logo.png" alt="" width="32" height="32" style="width:32px;height:32px;object-fit:contain" />
            <span style="font-size:15px;font-weight:600">ZappyOne</span>
          </div>
          <button id="__zappy_close__" type="button" aria-label="Close" style="border:none;background:transparent;
            width:36px;height:36px;border-radius:10px;font-size:22px;line-height:1;color:#64748B;cursor:pointer">&times;</button>
        </div>
        <p style="margin:18px 0 0;font-size:13px;color:#64748B">${esc(purpose || 'Payment')}</p>
        <p style="margin:2px 0 0;font-size:32px;font-weight:700;letter-spacing:-0.5px">&#8377;${esc(rupees)}</p>
        <button id="__zappy_pay__" type="button" style="margin-top:20px;width:100%;height:50px;border:none;border-radius:12px;
          background:#2563EB;color:#fff;font:600 16px Poppins,system-ui,sans-serif;cursor:pointer">Pay &#8377;${esc(rupees)}</button>
        <button id="__zappy_cancel__" type="button" style="margin-top:6px;width:100%;height:44px;border:none;background:transparent;
          color:#475569;font:500 14px Poppins,system-ui,sans-serif;cursor:pointer">Not now</button>
        <p style="margin:8px 0 0;text-align:center;font-size:12px;color:#94A3B8">UPI, cards and net banking &middot; processed securely by Cashfree</p>
      </div>`;

    document.body.appendChild(overlay);
    const card = overlay.querySelector('#__zappy_card__');
    const payBtn = overlay.querySelector('#__zappy_pay__');
    requestAnimationFrame(() => { overlay.style.opacity = '1'; card.style.transform = 'translateY(0)'; });
    payBtn.focus();

    let done = false;
    function close(then) {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      overlay.style.opacity = '0';
      card.style.transform = 'translateY(16px)';
      setTimeout(() => overlay.remove(), 200);
      then();
    }
    const cancel = () => close(() => reject(new Error('Payment cancelled')));
    function onKey(e) { if (e.key === 'Escape') cancel(); }

    payBtn.addEventListener('click', () => close(resolve));
    overlay.querySelector('#__zappy_close__').addEventListener('click', cancel);
    overlay.querySelector('#__zappy_cancel__').addEventListener('click', cancel);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cancel(); });
    document.addEventListener('keydown', onKey);
  });
}

/**
 * Open the Cashfree checkout modal, optionally preceded by a Zappy-branded
 * confirmation sheet when amountPaise + purpose are supplied.
 *
 * @param {object} p
 * @param {string} p.paymentSessionId   Session ID from backend /create-order
 * @param {string} p.cfOrderId          Our order ID (needed for /verify call)
 * @param {'sandbox'|'production'} [p.cashfreeEnv='sandbox']
 * @param {number} [p.amountPaise]      If provided, shows Zappy pre-checkout sheet
 * @param {string} [p.purpose]          Label shown in the sheet (e.g. "Wallet Top-up")
 * @returns {Promise<{ cfOrderId, cfPaymentId }>}
 */
export async function openCheckout({ paymentSessionId, cfOrderId, cashfreeEnv = 'sandbox', amountPaise, purpose }) {
  if (amountPaise) {
    await showZappySheet(amountPaise, purpose);
  }

  await loadSdk();

  return new Promise((resolve, reject) => {
    const cashfree = window.Cashfree({ mode: cashfreeEnv });

    cashfree
      .checkout({
        paymentSessionId,
        redirectTarget: '_modal',
      })
      .then((result) => {
        if (result?.error) {
          reject(new Error(result.error.message || 'Payment failed'));
          return;
        }
        if (result?.paymentDetails) {
          resolve({
            cfOrderId,
            cfPaymentId: String(result.paymentDetails.paymentMessage?.cf_payment_id || ''),
          });
        } else {
          reject(new Error('Payment cancelled'));
        }
      })
      .catch((err) => reject(new Error(err?.message || 'Payment error')));
  });
}
