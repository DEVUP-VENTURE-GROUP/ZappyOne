/**
 * Tell ZappyOne about an emergency on any job (the website's useJobSOS,
 * server POST /jobs/:id/sos). The page dials 112 first; this is the second
 * call, sent with the phone's position when it can be had in a few seconds,
 * and it throws when ZappyOne could not be reached.
 */
import { useCallback } from 'react';
import * as Location from 'expo-location';
import { axiosClient } from '@zappy/core/api/axiosClient';

async function quickPosition(): Promise<{ lat?: number; lng?: number }> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return {};
    const last = await Location.getLastKnownPositionAsync({ maxAge: 60000 });
    const p = last || await Promise.race([Location.getCurrentPositionAsync({}), new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
    return p ? { lat: p.coords.latitude, lng: p.coords.longitude } : {};
  } catch { return {}; }
}

export function useJobSOS(jobId: string) {
  return useCallback(async () => { await axiosClient.post(`/jobs/${jobId}/sos`, await quickPosition()); }, [jobId]);
}
