/**
 * Session event bus.
 * ----------------------------------------------------------------------------
 * Decouples "the session died" from "navigate to login". The axios interceptor
 * and the socket client both detect invalid sessions, but neither should import
 * the Redux store or the router — that creates an import cycle (store → api →
 * store) and makes both untestable.
 *
 * The root layout is the single subscriber that performs the actual logout.
 *
 * Mirrors what the web client does with `window.dispatchEvent(new CustomEvent(
 * 'zappy:session-replaced'))` in `client/src/services/socket.js`.
 * ----------------------------------------------------------------------------
 */

export type SessionEndReason =
  /** Refresh failed — token expired, or reuse detection revoked the family. */
  | 'refresh_failed'
  /** Server evicted this socket because the account logged in on another device. */
  | 'session_replaced'
  /** User tapped log out. */
  | 'user_initiated';

type SessionEndListener = (reason: SessionEndReason) => void;

const listeners = new Set<SessionEndListener>();

/** Subscribe to session termination. Returns an unsubscribe function. */
export function onSessionEnd(listener: SessionEndListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Announce that the session is over. Idempotent from the caller's perspective —
 * subscribers are expected to no-op if they have already torn down.
 */
export function emitSessionEnd(reason: SessionEndReason): void {
  for (const listener of listeners) {
    try {
      listener(reason);
    } catch {
      // A failing subscriber must not prevent the others from logging out.
    }
  }
}
