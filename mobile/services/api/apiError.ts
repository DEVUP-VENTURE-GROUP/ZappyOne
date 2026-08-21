/**
 * The one shape every API failure is reduced to.
 * ----------------------------------------------------------------------------
 * A mobile-side normalisation layer. The backend is untouched: this only
 * classifies what it already returns.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * The base query previously handed screens `err.message` verbatim whenever the
 * request never reached the server, and `getApiErrorMessage` returned any
 * string `data` unchanged. So a dropped connection put the literal axios text
 * "Network Error" on the login screen, and a slow one produced "timeout of
 * 20000ms exceeded" — transport diagnostics shown as user-facing copy.
 *
 * Every failure now carries a `kind`, so a screen can branch on the category
 * instead of pattern-matching prose, and a `message` that is always safe to
 * render. The server's own `error` string is preferred whenever there is one —
 * it is written for users and is usually better than anything generic — and
 * its `code` is preserved so existing call sites that switch on
 * `KYC_COOLDOWN`, `PRICE_CHANGED`, `NO_WORKERS_IN_AREA` and the like keep
 * working unchanged.
 * ----------------------------------------------------------------------------
 */

import type { ApiError, ApiErrorBody } from '../../types/api';

export type ApiErrorKind =
  /** Never reached the server: offline, DNS, connection refused. */
  | 'NETWORK_ERROR'
  /** Reached it, but gave up waiting. */
  | 'TIMEOUT'
  /** The caller aborted it — unmount, or a superseded query. Not a failure. */
  | 'CANCELLED'
  /** 401 / 403 — the session is not (or no longer) allowed to do this. */
  | 'AUTH_ERROR'
  /** 400 / 422 — the request itself was wrong. */
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  /** 409 — the server's state moved on. */
  | 'CONFLICT'
  | 'RATE_LIMITED'
  /** 5xx. */
  | 'SERVER_ERROR'
  | 'UNKNOWN_ERROR';

export interface NormalizedApiError {
  kind: ApiErrorKind;
  /** HTTP status, absent when the request never got a response. */
  status?: number;
  /** The backend's own `code` (e.g. `KYC_COOLDOWN`), when it sent one. */
  code?: string;
  /** Always safe to show a user. Never a transport diagnostic. */
  message: string;
  /** Joi's per-field messages from `validate()`, when present. */
  details?: string[];
}

/** Copy for the cases where the server said nothing we can show. */
const FALLBACK: Record<ApiErrorKind, string> = {
  NETWORK_ERROR: "You appear to be offline. Check your connection and try again.",
  TIMEOUT: 'That took too long. Please try again.',
  CANCELLED: 'Request cancelled.',
  AUTH_ERROR: 'Please sign in again to continue.',
  VALIDATION_ERROR: 'Please check the details and try again.',
  NOT_FOUND: "We couldn't find that.",
  CONFLICT: 'That changed while you were working. Please try again.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  SERVER_ERROR: 'Something went wrong on our end. Please try again shortly.',
  UNKNOWN_ERROR: 'Something went wrong. Please try again.',
};

function kindForStatus(status: number): ApiErrorKind {
  if (status === 401 || status === 403) return 'AUTH_ERROR';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 400 || status === 422) return 'VALIDATION_ERROR';
  if (status >= 500) return 'SERVER_ERROR';
  return 'UNKNOWN_ERROR';
}

/**
 * Classify a transport failure — one with no HTTP response.
 *
 * Axios codes are checked before message text: `ERR_CANCELED`,
 * `ECONNABORTED` and `ERR_NETWORK` are stable, whereas the messages are
 * localised and have changed between axios versions.
 */
function kindForTransport(code?: string, name?: string): ApiErrorKind {
  if (code === 'ERR_CANCELED' || name === 'CanceledError' || name === 'AbortError') {
    return 'CANCELLED';
  }
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') return 'TIMEOUT';
  return 'NETWORK_ERROR';
}

/**
 * Build the `ApiError` an RTK Query `baseQuery` returns.
 *
 * `data` keeps the server's body untouched so `getApiErrorBody`/
 * `getApiErrorCode` behave exactly as before; the classification rides
 * alongside in `normalized`.
 */
export function toApiError(err: {
  response?: { status?: number; data?: ApiErrorBody };
  code?: string;
  name?: string;
  message?: string;
}): ApiError {
  const status = err.response?.status;
  const body = err.response?.data;

  const kind = typeof status === 'number'
    ? kindForStatus(status)
    : kindForTransport(err.code, err.name);

  // The server's message wins when it sent one — it is written for users.
  const message =
    (body && typeof body.error === 'string' && body.error) || FALLBACK[kind];

  return {
    status,
    // Unchanged contract: the raw body when there was one. Notably NOT
    // `err.message` any more — that is the transport text that used to leak.
    data: body,
    normalized: {
      kind,
      status,
      code: body?.code,
      message,
      details: body?.details,
    },
  };
}

/** The classification for any error RTK Query surfaced. */
export function normalizeError(error: unknown): NormalizedApiError {
  const normalized = (error as ApiError | undefined)?.normalized;
  if (normalized) return normalized;

  // Anything that did not come through the base query (a thrown Error in a
  // component, say) is unknown rather than pretended-about.
  return { kind: 'UNKNOWN_ERROR', message: FALLBACK.UNKNOWN_ERROR };
}

/** True for the abort that follows an unmount or a superseded query. */
export function isCancelled(error: unknown): boolean {
  return normalizeError(error).kind === 'CANCELLED';
}
