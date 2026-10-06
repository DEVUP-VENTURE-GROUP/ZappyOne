import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { selectAuth } from '../modules/auth/authSlice';
import { useGetWorkerMeQuery } from '../services/api';
import { getSocket } from '../services/socket';
import { API_BASE } from '../services/apiBase';
import { useLocationBroadcast } from './useLocationBroadcast';

/** How often the app says "still here" while on duty (the server's window is a few minutes). */
const HEARTBEAT_MS = 60 * 1000;

/**
 * While a worker is online, their location is shared on every page of the
 * app, not only the dashboard: nearby jobs reach them and customers and admin
 * see where they are, on the work board and inside a job too. Mounted once at
 * the app root (Rakshak and ServicePro); renders nothing.
 *
 * It also keeps them really online (server worker/presence): a heartbeat every
 * minute whether or not the phone moves (a phone lying still sends no GPS),
 * and again the moment the app comes back to the screen. If the server has set
 * them offline (no signal for too long), the app says so at once instead of
 * showing a stale Online.
 */
export default function OnlineLocation() {
  const { accessToken, role } = useSelector(selectAuth);
  const isWorker = !!accessToken && role === 'worker';
  const { data, refetch } = useGetWorkerMeQuery(undefined, { skip: !isWorker, pollingInterval: 60000 });
  const me = data?.worker;
  const online = isWorker && !!me?.isOnline;
  const lastPos = useRef(null);

  useLocationBroadcast({
    isOnline: online, token: accessToken, currentOrderId: me?.currentOrderId,
    onPosition: (pos) => { lastPos.current = { lat: pos.lat, lng: pos.lng }; },
  });

  useEffect(() => {
    if (!online) return undefined;
    let told = false;
    const beat = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/workers/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(lastPos.current || {}),
        });
        const body = res.ok ? await res.json() : null;
        if (body && body.isOnline === false && !told) {
          told = true;
          toast('You are offline now. Go online to get jobs again.', { id: 'presence-offline' });
          refetch();
        }
      } catch { /* no network: the next beat tries again */ }
    };
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') { beat(); refetch(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [online, accessToken, refetch]);

  // The server set them offline while the app was open: show it straight away.
  useEffect(() => {
    if (!isWorker) return undefined;
    const socket = getSocket(accessToken);
    const onPresence = (p) => {
      if (p?.online === false) {
        toast('We lost contact with your phone, so you were set offline. Go online to get jobs again.', { id: 'presence-offline' });
        refetch();
      }
    };
    socket.on('worker.presence', onPresence);
    return () => socket.off('worker.presence', onPresence);
  }, [isWorker, accessToken, refetch]);

  return null;
}
