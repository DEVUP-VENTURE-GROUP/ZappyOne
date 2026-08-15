/**
 * Cashfree checkout launcher (mobile).
 * ----------------------------------------------------------------------------
 * There is no native Cashfree PG SDK in this project (it needs a config
 * plugin + a native rebuild via EAS, which isn't wired up yet). Rather than
 * block the whole booking flow on that native dependency, this opens
 * Cashfree's HOSTED checkout page — the same payment_session_id the web
 * Drop.js checkout uses — inside an in-app browser tab via `expo-web-browser`
 * (SFSafariViewController on iOS, Custom Tabs on Android). No new native
 * module, no rebuild required.
 *
 * Flow:
 *   1. Server creates the Cashfree order or  and returns `paymentSessionId`.
 *   2. This opens `https://payments(-test).cashfree.com/order/#/{session}`,
 *      with `returnUrl` set to a deep link back into the app (see app.json's
 *      `scheme`). The server request that got `paymentSessionId` must ALSO
 *      have sent that same `returnUrl` — see paymentsApi + booking screens.
 *   3. On completion, Cashfree redirects to the deep link, closing the
 *      in-app browser. This function resolves with what the URL tells us.
 *   4. The webhook (`payment.service.js:handleWebhook`) is the real source of
 *      truth and applies the order-paid side effects server-side, so a
 *      dropped/ambiguous client redirect is never a silent data-loss risk —
 *      the caller just needs to re-poll `getOrder`/`getWallet` after this
 *      resolves, which every call site here already does.
 * ----------------------------------------------------------------------------
 */

import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { createLogger } from '../../lib/logger';

const log = createLogger('cashfree');

export type CheckoutOutcome =
  | { kind: 'returned'; url: string }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

function hostedCheckoutUrl(paymentSessionId: string, env: 'sandbox' | 'production'): string {
  const host = env === 'production' ? 'payments.cashfree.com' : 'payments-test.cashfree.com';
  return `https://${host}/order/#${paymentSessionId}`;
}

/** The deep link Cashfree redirects to when checkout finishes. */
export function paymentReturnUrl(): string {
  return Linking.createURL('payment/callback');
}

/**
 * Open the hosted checkout and wait for the user to finish (pay, cancel, or
 * back out). Resolves once the in-app browser closes — it does NOT by itself
 * confirm payment success; callers must re-check order/wallet state after.
 */
export async function openCashfreeCheckout(
  paymentSessionId: string,
  cashfreeEnv: 'sandbox' | 'production',
): Promise<CheckoutOutcome> {
  const url = hostedCheckoutUrl(paymentSessionId, cashfreeEnv);
  const returnUrl = paymentReturnUrl();

  try {
    const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
    if (result.type === 'success' && result.url) {
      log.debug('checkout returned', { hasUrl: true });
      return { kind: 'returned', url: result.url };
    }
    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { kind: 'cancelled' };
    }
    return { kind: 'error', message: `Unexpected browser result: ${result.type}` };
  } catch (err) {
    log.error('checkout session failed to open', err);
    return { kind: 'error', message: err instanceof Error ? err.message : 'Could not open checkout' };
  }
}

/**
 * Cashfree appends `cf_payment_id` / `order_id` (their own order id) as query
 * params on the return_url redirect. Extract them if present — used to fire
 * an immediate `/payments/verify` call for fast UX; the webhook still governs
 * the actual state.
 */
export function parseReturnUrl(url: string): { cfOrderId?: string; cfPaymentId?: string } {
  try {
    const parsed = Linking.parse(url);
    const params = parsed.queryParams ?? {};
    const cfOrderId = typeof params.order_id === 'string' ? params.order_id : undefined;
    const cfPaymentId = typeof params.cf_payment_id === 'string' ? params.cf_payment_id : undefined;
    return { cfOrderId, cfPaymentId };
  } catch {
    return {};
  }
}
