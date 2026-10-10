/**
 * Listen to one live event while a component is mounted. The latest handler
 * is always called, so callers don't need to memoise it.
 */
import { useEffect, useRef } from 'react';
import { socketClient } from '../socket/socketClient';
import type { ServerToClientEvents } from '../socket/events';

export function useSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E],
  enabled = true,
): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return undefined;
    void socketClient.connect();
    const h = ((...args: unknown[]) => (ref.current as (...a: unknown[]) => void)(...args)) as ServerToClientEvents[E];
    socketClient.on(event, h);
    return () => socketClient.off(event, h);
  }, [event, enabled]);
}
