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

const ZAPPY_SVG = `<svg width="44" height="44" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="zg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2563EB"/>
      <stop offset="100%" stop-color="#1E3A8A"/>
    </linearGradient>
  </defs>
  <path d="M2 22 L14 22" stroke="#2563EB" stroke-width="3" stroke-linecap="round"/>
  <path d="M4 30 L18 30" stroke="#2563EB" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
  <path d="M6 38 L12 38" stroke="#2563EB" stroke-width="3" stroke-linecap="round" opacity="0.4"/>
  <path d="M20 16 L52 16 L52 24 L32 38 L52 38 L52 46 L20 46" fill="url(#zg)"/>
  <g fill="#fff">
    <circle cx="42" cy="20" r="3"/>
    <path d="M38 28 L45 24 L48 30 L44 36 L48 42 L44 46 L40 40 L36 36 L32 34 L36 30 Z" opacity="0.95"/>
  </g>
  <g transform="translate(50,44)">
    <path d="M0 -6 C-5 -6 -8 -2 -8 1 C-8 5 0 12 0 12 C0 12 8 5 8 1 C8 -2 5 -6 0 -6 Z" fill="#F59E0B"/>
    <circle cx="0" cy="0" r="2.5" fill="#fff"/>
  </g>
</svg>`;

function showZappySheet(amountPaise, purpose) {
  return new Promise((resolve, reject) => {
    const rupees = Math.round(amountPaise / 100).toLocaleString('en-IN');

    // Remove any existing overlay just in case
    document.getElementById('__zappy_pay_sheet__')?.remove();

    const overlay = document.createElement('div');
    overlay.id = '__zappy_pay_sheet__';
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:999999',
      'display:flex;align-items:flex-end;justify-content:center',
      'background:rgba(2,6,23,0.7);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)',
      'opacity:0;transition:opacity 300ms ease',
    ].join(';');

    // Animation styles injected globally for sheen and pulse
    const style = document.createElement('style');
    style.id = '__zappy_pay_styles__';
    style.innerHTML = `
      @keyframes zappy-sheen {
        0% { transform: translateX(-100%) skewX(-15deg); }
        100% { transform: translateX(200%) skewX(-15deg); }
      }
      @keyframes zappy-pulse {
        0% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.4); }
        70% { box-shadow: 0 0 0 15px rgba(139, 92, 246, 0); }
        100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
      }
      #__zappy_pay__:hover { transform: scale(0.98); }
      #__zappy_cancel__:hover { background: rgba(255,255,255,0.05); color:#fff; }
      #__zappy_close__:hover { background: rgba(255,255,255,0.15); transform: rotate(90deg); }
    `;
    if (!document.getElementById('__zappy_pay_styles__')) {
      document.head.appendChild(style);
    }

    overlay.innerHTML = `
      <div id="__zappy_card__" style="
        width:100%;max-width:420px;background:linear-gradient(180deg, #0f172a 0%, #020617 100%);
        border-radius:32px 32px 0 0;
        box-shadow:0 -20px 60px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.1);
        transform:translateY(100%);opacity:0;
        transition:transform 400ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 400ms ease;
        overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        border: 1px solid rgba(255,255,255,0.08);
        border-bottom: none;
      ">
        <!-- Floating neon blur behind the card -->
        <div style="position:absolute;top:-50px;left:-50px;width:150px;height:150px;background:#8b5cf6;filter:blur(80px);opacity:0.3;pointer-events:none;border-radius:50%"></div>
        <div style="position:absolute;bottom:-50px;right:-50px;width:150px;height:150px;background:#ec4899;filter:blur(80px);opacity:0.2;pointer-events:none;border-radius:50%"></div>

        <!-- Drag handle -->
        <div style="display:flex;justify-content:center;padding:12px 0 0">
          <div style="width:40px;height:4px;border-radius:4px;background:rgba(255,255,255,0.2)"></div>
        </div>

        <!-- Header -->
        <div style="padding:24px 24px 0; position:relative; z-index:10;">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:12px">
              <div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg, #3b82f6, #8b5cf6);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(139,92,246,0.3)">
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              </div>
              <div>
                <div style="color:#fff;font-weight:800;font-size:16px;letter-spacing:-0.5px">ZAPPY PAYMENT</div>
                <div style="color:rgba(255,255,255,0.5);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-top:2px">Secure Checkout</div>
              </div>
            </div>
            <button id="__zappy_close__" style="
              background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);cursor:pointer;
              width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;
              color:#fff;font-size:18px;line-height:1;padding:0;transition:all 200ms;
            ">×</button>
          </div>
          
          <div style="margin-top:32px;text-align:center">
            <div style="color:rgba(255,255,255,0.6);font-size:13px;font-weight:500;margin-bottom:8px">${purpose || 'Payment Amount'}</div>
            <div style="color:#fff;font-weight:900;font-size:48px;letter-spacing:-2px;line-height:1;text-shadow:0 4px 20px rgba(255,255,255,0.2)">
              <span style="color:rgba(255,255,255,0.4);font-size:32px;margin-right:2px;font-weight:600;">₹</span>${rupees}
            </div>
          </div>
        </div>

        <!-- Body -->
        <div style="padding:32px 24px 24px; position:relative; z-index:10;">
          
          <!-- Payment methods pills -->
          <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-bottom:28px">
            ${['UPI', 'Credit Card', 'Net Banking', 'Wallets'].map(m =>
              `<div style="padding:6px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:999px;font-size:11px;font-weight:600;color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:6px;box-shadow:inset 0 1px 1px rgba(255,255,255,0.05)">
                 <div style="width:6px;height:6px;border-radius:50%;background:#8b5cf6;box-shadow:0 0 6px #8b5cf6"></div>${m}
               </div>`
            ).join('')}
          </div>

          <!-- Main CTA -->
          <button id="__zappy_pay__" style="
            position:relative;width:100%;padding:18px;border:none;border-radius:20px;cursor:pointer;
            background:linear-gradient(135deg, #8b5cf6, #3b82f6);color:#fff;
            font-size:16px;font-weight:800;letter-spacing:-0.2px;
            display:flex;align-items:center;justify-content:center;gap:10px;
            box-shadow:0 8px 25px rgba(59,130,246,0.4);
            transition:all 150ms ease;overflow:hidden;
            animation: zappy-pulse 2s infinite;
          ">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            Pay Securely
            <div style="position:absolute;top:0;left:0;width:50%;height:100%;background:linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0) 100%);animation:zappy-sheen 2.5s infinite;pointer-events:none;"></div>
          </button>

          <!-- Cancel -->
          <button id="__zappy_cancel__" style="
            width:100%;padding:14px;border:none;border-radius:16px;
            background:transparent;color:rgba(255,255,255,0.4);font-size:14px;font-weight:600;
            cursor:pointer;margin-top:8px;transition:all 200ms;
          ">Cancel Payment</button>

          <!-- Footer Trust Badge -->
          <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:16px;color:rgba(255,255,255,0.3);font-size:11px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            256-bit AES Encryption · Secured by <span style="font-weight:700;color:rgba(255,255,255,0.5)">Cashfree</span>
          </div>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    // Trigger animations
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      const card = overlay.querySelector('#__zappy_card__');
      card.style.transform = 'translateY(0)';
      card.style.opacity = '1';
    });

    function cleanup() {
      const card = overlay.querySelector('#__zappy_card__');
      overlay.style.opacity = '0';
      card.style.transform = 'translateY(100%)';
      card.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        document.getElementById('__zappy_pay_styles__')?.remove();
      }, 400);
    }

    overlay.querySelector('#__zappy_pay__').addEventListener('click', () => {
      cleanup();
      resolve();
    });

    const onClose = () => { cleanup(); reject(new Error('Payment cancelled')); };
    overlay.querySelector('#__zappy_close__').addEventListener('click', onClose);
    overlay.querySelector('#__zappy_cancel__').addEventListener('click', onClose);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) onClose(); });
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
