import { useLazyGetServiceabilityQuery } from '@shared/services/api';

/**
 * Can someone verified come to this address for this service? Asked at the
 * booking step of flows that have no provider-picking step of their own
 * (helping), so a customer who reaches "Book" where nobody covers yet sees the
 * GrowingHere card instead of a booking nobody can fulfil.
 *
 * Errs open: if the check itself fails, the booking proceeds and the server's
 * own rules decide.
 */
export function useCoverageCheck() {
  const [fetchServiceability] = useLazyGetServiceabilityQuery();
  return async function covered(lineCode, { lat, lng }) {
    if (lat == null || lng == null) return true;
    try {
      const svc = await fetchServiceability({ lat, lng }).unwrap();
      return (svc.lines || []).some((l) => l.code === lineCode);
    } catch {
      return true;
    }
  };
}
