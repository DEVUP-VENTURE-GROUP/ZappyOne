/**
 * What runs around every screen of a provider app while signed in (the
 * websites' App shell for Rakshak / ServicePro):
 *   - the job-offer popup (OfferHost)
 *   - location and heartbeat while online (useOnlinePresence)
 *   - lists refresh on live job changes, a tip shows a toast (useJobRealtime)
 *   - a banner while the live connection is down
 */
import React from 'react';
import { useGetWorkerMeQuery, useShopMeQuery } from '@zappy/core/api';
import { useJobRealtime } from '@zappy/core/hooks/useJobRealtime';
import { useOnlinePresence } from '@zappy/core/hooks/useOnlinePresence';
import { useShopPresence } from '@zappy/core/hooks/useShopPresence';
import { useAppSelector } from '@zappy/core/store/hooks';
import { toast } from '../components/Toast';
import { ConnectionBanner } from '../components/common/ConnectionBanner';
import { JobOfferHost } from '../components/jobs/JobOfferHost';
import { useLivePoll } from '@zappy/core/hooks/useLivePoll';
import { useChatPopup } from '../app/useChatPopup';

const PRO_JOB: Record<string, string> = { repair: '/worker/repair/', pet: '/worker/pet/' };

export function WorkerFrame({ kinds }: { kinds: string[] }) {
  const signedIn = useAppSelector((s) => s.auth.isAuthenticated);
  const role = useAppSelector((s) => s.auth.role);
  const isWorker = signedIn && role === 'worker';
  const { data, refetch } = useGetWorkerMeQuery(undefined, { skip: !isWorker, pollingInterval: useLivePoll(60000) });
  const me = data?.worker;

  useOnlinePresence({
    online: isWorker && !!me?.isOnline,
    currentOrderId: me?.currentOrderId,
    onWentOffline: (why) => {
      toast(why === 'no_signal'
        ? 'We lost contact with your phone, so you were set offline. Go online to get jobs again.'
        : 'You are offline now. Go online to get jobs again.', { id: 'presence-offline' });
      refetch();
    },
  });
  const { data: shopMe } = useShopMeQuery(undefined, { skip: !(signedIn && role === 'shop') });
  // The owner's position is shared only while the shop's Live switch is ON.
  useShopPresence({ active: signedIn && role === 'shop' && (shopMe as { shop?: { takingOrders?: boolean } } | undefined)?.shop?.takingOrders !== false });
  useJobRealtime({
    enabled: signedIn,
    onTip: (tip) => toast.success(`₹${Math.round(tip / 100)} tip from your customer. It is all yours.`, { duration: 6000 }),
  });
  useChatPopup({ enabled: signedIn, linkFor: (kind, id) => (PRO_JOB[kind] ? PRO_JOB[kind] + id : null) });

  if (!signedIn) return null;
  return (
    <>
      <ConnectionBanner />
      <JobOfferHost kinds={kinds} />
    </>
  );
}
