/**
 * Can someone verified come to this address for this service? (the website's
 * useCoverageCheck). Asked at the booking step of flows with no provider step
 * of their own. Errs open: if the check itself fails, the booking proceeds and
 * the server's rules decide.
 */
import { useCallback } from 'react';
import { useLazyGetServiceabilityQuery } from '@zappy/core/api';

export function useCoverageCheck() {
  const [fetchServiceability] = useLazyGetServiceabilityQuery();
  return useCallback(async (lineCode: string, at: { lat?: number; lng?: number } | null) => {
    if (at?.lat == null || at?.lng == null) return true;
    try {
      const svc = await fetchServiceability({ lat: at.lat, lng: at.lng }).unwrap();
      return (svc.lines || []).some((l: { code: string }) => l.code === lineCode);
    } catch { return true; }
  }, [fetchServiceability]);
}
