// The app's version of the websites' useCheckInThen: an accept that the server refuses for "not checked in" checks the technician in where they stand and tries once more.
import { useCallback } from 'react';
import { useGoOnlineMutation } from '@zappy/core/api';
import { getBestPosition } from '@zappy/core/hooks/useBestPosition';
import { toast } from '../components/Toast';

export function useCheckInThen() {
  const [goOnline] = useGoOnlineMutation();
  return useCallback(async <T,>(run: () => Promise<T>): Promise<T> => {
    try { return await run(); } catch (err) {
      if ((err as { data?: { code?: string } })?.data?.code !== 'NOT_CHECKED_IN') throw err;
      const pos = await getBestPosition();
      await goOnline({ lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy ?? null }).unwrap();
      toast.success('Checked in for your shift');
      return run();
    }
  }, [goOnline]);
}
