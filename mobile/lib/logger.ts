/**
 * Controlled logging utility (S3).
 * ----------------------------------------------------------------------------
 * Replaces bare `console.log` calls that shipped to production builds.
 *
 * Rules:
 *   - `debug`/`info` are stripped in production builds (`__DEV__ === false`).
 *   - `warn`/`error` always emit — they are what crash reporters hook into.
 *   - Every payload passes through `redact()` so a token, OTP, or payment
 *     secret can never reach the console, even if a caller passes a raw
 *     server response. The server's SECURITY.md forbids logging these.
 * ----------------------------------------------------------------------------
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

/** Keys whose values must never appear in a log line, matched case-insensitively. */
const SENSITIVE_KEYS = [
  'accesstoken',
  'refreshtoken',
  'token',
  'otp',
  'serviceStartOtp'.toLowerCase(),
  'password',
  'authorization',
  'secret',
  'apikey',
  'signature',
  'cfpaymentid',
  'paymentsessionid',
];

const REDACTED = '[redacted]';

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEYS.some((s) => k.includes(s));
}

/**
 * Deep-clone a value with sensitive fields replaced. Depth-capped so a cyclic
 * or huge object (a full order document) can't lock up the JS thread.
 */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth-limit]';
  if (value == null) return value;

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => redact(v, depth + 1));
  }

  if (typeof value === 'object') {
    // Errors don't enumerate their own message/stack — pull them out explicitly.
    if (value instanceof Error) {
      return { name: value.name, message: value.message };
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }

  return value;
}

/** True when verbose levels should reach the console. */
const verbose = __DEV__;

function emit(level: Level, scope: string, message: string, meta?: unknown) {
  if ((level === 'debug' || level === 'info') && !verbose) return;

  const prefix = `[${scope}]`;
  const args: unknown[] = [prefix, message];
  if (meta !== undefined) args.push(redact(meta));

  switch (level) {
    case 'warn':
      console.warn(...args);
      break;
    case 'error':
      console.error(...args);
      break;
    default:
      console.log(...args);
  }
}

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

/**
 * Create a scoped logger, e.g. `createLogger('socket')` →  "[socket] connected".
 * Scoping keeps Metro's console readable when several subsystems log at once.
 */
export function createLogger(scope: string): Logger {
  return {
    debug: (message, meta) => emit('debug', scope, message, meta),
    info: (message, meta) => emit('info', scope, message, meta),
    warn: (message, meta) => emit('warn', scope, message, meta),
    error: (message, meta) => emit('error', scope, message, meta),
  };
}

export { redact };
