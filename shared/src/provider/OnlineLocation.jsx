import { useSelector } from 'react-redux';
import { selectAuth } from '../modules/auth/authSlice';
import { useGetWorkerMeQuery } from '../services/api';
import { useLocationBroadcast } from './useLocationBroadcast';

/**
 * While a worker is online, their location is shared on every page of the
 * app, not only the dashboard: nearby jobs reach them and customers and admin
 * see where they are, on the work board and inside a job too. Mounted once at
 * the app root (Rakshak and ServicePro); renders nothing.
 */
export default function OnlineLocation() {
  const { accessToken, role } = useSelector(selectAuth);
  const isWorker = !!accessToken && role === 'worker';
  const { data } = useGetWorkerMeQuery(undefined, { skip: !isWorker, pollingInterval: 60000 });
  const me = data?.worker;
  useLocationBroadcast({ isOnline: isWorker && !!me?.isOnline, token: accessToken, currentOrderId: me?.currentOrderId });
  return null;
}
