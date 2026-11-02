import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { useGoOnlineMutation } from '../services/api';
import { useGeolocation } from '../hooks/useGeolocation';

// Runs an accept; when the server says the technician has not checked in (jobs/assignment assertCheckedIn), checks them in where they stand and tries once more.
export function useCheckInThen() {
  const [goOnline] = useGoOnlineMutation();
  const { getCurrent } = useGeolocation();
  return useCallback(async (run) => {
    try { return await run(); } catch (err) {
      if (err?.data?.code !== 'NOT_CHECKED_IN') throw err;
      const pos = await getCurrent();
      await goOnline({ lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy ?? null }).unwrap();
      toast.success('Checked in for your shift');
      return run();
    }
  }, [goOnline, getCurrent]);
}
