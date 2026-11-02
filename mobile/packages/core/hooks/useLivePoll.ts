import { useEffect, useState } from 'react';
import { socketClient } from '../socket/socketClient';

// While the socket is live it pushes every change, so a poll only needs to be a slow safety net; offline it keeps its pace (web: shared useSocket useLivePoll).
const LIVE_SAFETY_POLL_MS = 120000;
export function useLivePoll(ms: number) {
  const [live, setLive] = useState(socketClient.isConnected);
  useEffect(() => {
    const t = setInterval(() => setLive(socketClient.isConnected), 5000);
    return () => clearInterval(t);
  }, []);
  return live ? Math.max(ms, LIVE_SAFETY_POLL_MS) : ms;
}
