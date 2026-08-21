/**
 * Socket.io client — typed against the canonical event contract (events.ts).
 * ----------------------------------------------------------------------------
 * Fixes S1 from the Phase-4 audit: the previous client read the access token
 * once via a raw `SecureStore.getItemAsync('accessToken')` call and never
 * updated it, so after a token refresh the socket kept retrying with an
 * expired token and never recovered. This version:
 *   - reads the token through `tokenStorage` (the single owner) instead of a
 *     raw SecureStore key literal
 *   - subscribes to `onAccessTokenChange` so a refresh reconnects the socket
 *     with the new token
 *   - proactively calls `refreshAccessToken()` before connecting if the
 *     stored token is missing/stale, via the SAME refresh mutex axiosClient
 *     uses, so it can never race a concurrent HTTP refresh into reuse
 *     detection (ENTERPRISE-ADDITIONS.md §1)
 *   - re-subscribes every order room after `server:rooms_reset` (the Redis
 *     adapter loses membership on restart — the contract calls this out
 *     explicitly)
 *   - listens for `session:replaced` and forwards it through sessionBus so
 *     the app can force a logout on multi-device eviction
 * ----------------------------------------------------------------------------
 */

import { AppState, type AppStateStatus } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from '../../config/env';
import { createLogger } from '../../lib/logger';
import { emitSessionEnd } from '../../lib/sessionBus';
import { getAccessToken, onAccessTokenChange } from '../api/tokenStorage';
import { refreshAccessToken } from '../api/axiosClient';
import type { ServerToClientEvents, ClientToServerEvents } from './events';

const log = createLogger('socket');

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

class SocketClient {
  private socket: AppSocket | null = null;
  private connecting: Promise<void> | null = null;
  private subscribedOrderIds = new Set<string>();
  private unsubscribeTokenListener: (() => void) | null = null;
  private unsubscribeAppState: (() => void) | null = null;

  /**
   * App-level listeners, owned by THIS class rather than by the socket.
   *
   * They used to be registered straight onto `this.socket`, which had two
   * consequences. A handler added before `connect()` resolved hit a null
   * socket and vanished silently. And every reconnect ran `teardownSocket()`
   * → `removeAllListeners()` → a brand new `io()`, so after any network blip,
   * token refresh or server restart the screens kept their `off` cleanups but
   * received nothing — the tracking map, chat and worker offers all went
   * quiet until the component happened to remount.
   *
   * Holding them here makes registration independent of connection state:
   * `attachHandlers()` replays the whole registry onto each new socket.
   */
  private handlers = new Map<string, Set<(...args: unknown[]) => void>>();

  /** Set by `destroy()`. Blocks any later reconnect attempt after logout. */
  private stopped = false;

  /** Idempotent — safe to call from multiple screens mounting concurrently. */
  async connect(): Promise<void> {
    // A fresh connect after logout re-arms the client.
    this.stopped = false;
    if (this.socket?.connected) return;
    if (this.connecting) return this.connecting;

    this.connecting = this._connect();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async _connect(): Promise<void> {
    let token = await getAccessToken();
    if (!token) {
      // No cached token — try a refresh once before giving up. Covers cold
      // start right after the access token expired but before any HTTP call
      // has triggered axiosClient's own refresh.
      token = await refreshAccessToken();
    }
    if (!token) {
      log.warn('no access token available — socket not connected');
      return;
    }

    this.teardownSocket();

    this.socket = io(SOCKET_URL, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      // Exponential backoff with jitter: 1s doubling to a 10s ceiling, ±50%.
      // The randomisation is what stops a server restart from bringing every
      // client back in the same instant — without it the whole fleet retries
      // on identical boundaries and hammers the socket server as it comes up.
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
      timeout: 20000,
      transports: ['websocket'],
    }) as AppSocket;

    this.attachHandlers();
    this.watchAppState();

    this.socket.on('connect', () => {
      log.debug('connected', { id: this.socket?.id });
      // Re-join every order room the app cares about — a fresh connection
      // (including post-`server:rooms_reset`) starts with empty room state.
      for (const orderId of this.subscribedOrderIds) {
        this.socket?.emit('order:subscribe', { orderId });
      }
    });

    this.socket.on('disconnect', (reason) => {
      log.debug('disconnected', { reason });
    });

    this.socket.on('connect_error', (error) => {
      log.warn('connect_error', { message: error.message });
    });

    // The Redis adapter loses room membership on restart — re-subscribe.
    this.socket.on('server:rooms_reset', (payload) => {
      log.warn('server rooms reset — resubscribing', payload);
      for (const orderId of this.subscribedOrderIds) {
        this.socket?.emit('order:subscribe', { orderId });
      }
    });

    // Another device logged in and evicted this session.
    this.socket.on('session:replaced', (payload) => {
      log.warn('session replaced — ending local session', payload);
      emitSessionEnd('session_replaced');
    });

    // Reconnect with a fresh token the moment one is issued (login, rotation,
    // or an on-demand refresh triggered elsewhere) — never keep retrying
    // against a token the server will reject.
    if (!this.unsubscribeTokenListener) {
      this.unsubscribeTokenListener = onAccessTokenChange((next) => {
        if (!next) {
          this.disconnect();
          return;
        }
        if (this.socket && this.socket.auth && typeof this.socket.auth === 'object') {
          (this.socket.auth as { token?: string }).token = next;
        }
        if (this.socket && !this.socket.connected) {
          this.socket.connect();
        }
      });
    }
  }

  /** Replay every registered handler onto the current socket. */
  private attachHandlers() {
    if (!this.socket) return;
    for (const [event, set] of this.handlers) {
      for (const handler of set) {
        this.socket.on(event as keyof ServerToClientEvents, handler as never);
      }
    }
  }

  /**
   * Reconnect when the app comes back to the foreground.
   *
   * Socket.io's own reconnect loop is suspended while the OS has the process
   * frozen, and both platforms close idle sockets in the background — so a
   * resume routinely lands with `connected === false` and no retry pending.
   * `connect()` is idempotent and the `connect` handler re-joins every order
   * room, so this is the whole restore path.
   *
   * Nothing is torn down on the way OUT. A brief background (a notification
   * shade, a glance at another app) would otherwise drop a live tracking
   * session and pay a full reconnect on return.
   */
  private watchAppState() {
    if (this.unsubscribeAppState) return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return;
      if (this.stopped) return;
      if (this.socket?.connected) return;
      void this.connect();
    });
    this.unsubscribeAppState = () => sub.remove();
  }

  private teardownSocket() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  disconnect(): void {
    this.teardownSocket();
    this.subscribedOrderIds.clear();
  }

  /** Fully tear down — call on logout so no listener leaks across sessions. */
  /**
   * Full teardown for logout. `stopped` latches so a late AppState resume or a
   * token event cannot quietly bring the socket back on the previous session's
   * behalf; `connect()` clears it when a new session starts.
   */
  destroy(): void {
    this.stopped = true;
    this.disconnect();
    this.handlers.clear();
    this.unsubscribeTokenListener?.();
    this.unsubscribeTokenListener = null;
    this.unsubscribeAppState?.();
    this.unsubscribeAppState = null;
  }

  // ── Order room subscriptions ────────────────────────────────────────────

  subscribeOrder(orderId: string): void {
    this.subscribedOrderIds.add(orderId);
    if (this.socket?.connected) {
      this.socket.emit('order:subscribe', { orderId });
    }
  }

  unsubscribeOrder(orderId: string): void {
    this.subscribedOrderIds.delete(orderId);
    if (this.socket?.connected) {
      this.socket.emit('order:unsubscribe', { orderId });
    }
  }

  /** Typed emit for anything beyond the order-room sugar above (e.g. worker GPS pings). */
  emit<E extends keyof ClientToServerEvents>(event: E, payload: Parameters<ClientToServerEvents[E]>[0]): void {
    if (this.socket?.connected) {
      // socket.io-client's per-event overloads don't distribute over a generic
      // `E` cleanly; the public signature above is what keeps call sites typed.
      (this.socket.emit as (event: string, payload: unknown) => void)(event, payload);
    }
  }

  // ── Typed listener passthrough ──────────────────────────────────────────

  /**
   * Register a listener. Safe before the socket exists and safe across
   * reconnects — the registry is the source of truth, the live socket is just
   * where it is currently mirrored.
   */
  on<E extends keyof ServerToClientEvents>(event: E, handler: ServerToClientEvents[E]): void {
    const key = event as string;
    let set = this.handlers.get(key);
    if (!set) {
      set = new Set();
      this.handlers.set(key, set);
    }
    // A Set makes a double-subscribe idempotent, so a StrictMode double-effect
    // or a remount cannot deliver the same message twice.
    set.add(handler as (...args: unknown[]) => void);
    this.socket?.on(event, handler as never);
  }

  off<E extends keyof ServerToClientEvents>(event: E, handler?: ServerToClientEvents[E]): void {
    const key = event as string;
    if (handler) {
      this.handlers.get(key)?.delete(handler as (...args: unknown[]) => void);
      this.socket?.off(event, handler as never);
    } else {
      this.handlers.delete(key);
      this.socket?.off(event);
    }
  }

  get isConnected(): boolean {
    return !!this.socket?.connected;
  }
}

export const socketClient = new SocketClient();
