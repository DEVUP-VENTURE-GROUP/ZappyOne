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

  /** Idempotent — safe to call from multiple screens mounting concurrently. */
  async connect(): Promise<void> {
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
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ['websocket'],
    }) as AppSocket;

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
  destroy(): void {
    this.disconnect();
    this.unsubscribeTokenListener?.();
    this.unsubscribeTokenListener = null;
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

  on<E extends keyof ServerToClientEvents>(event: E, handler: ServerToClientEvents[E]): void {
    this.socket?.on(event, handler as never);
  }

  off<E extends keyof ServerToClientEvents>(event: E, handler?: ServerToClientEvents[E]): void {
    if (handler) this.socket?.off(event, handler as never);
    else this.socket?.off(event);
  }

  get isConnected(): boolean {
    return !!this.socket?.connected;
  }
}

export const socketClient = new SocketClient();
