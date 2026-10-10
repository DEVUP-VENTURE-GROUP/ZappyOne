/**
 * Where a booking happens (the websites' booking `location` state plus their
 * LocationPicker overlay). Every booking flow holds it the same way:
 *
 *   location   the pinned place, with the door details as `notes`, or null
 *   pick()     opens the shared picker at /location/picker, seeded where the
 *              customer already stands; its result arrives through the
 *              locationDraft hand-off and is applied exactly once
 *
 * Starts from `initial` (a resumed draft) or the last place the phone was,
 * and remembers a fresh pin for the next screen that asks.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { loadGeoLocation, saveGeoLocation } from '@zappy/core/lib/geoCache';
import { useAppDispatch, useAppSelector } from '@zappy/core/store/hooks';
import { locationDraftCleared, locationSeeded } from '@zappy/core/store/locationDraftSlice';

export interface BookingLocation { lat: number; lng: number; address: string; notes?: string }

export function useBookingLocation(initial?: BookingLocation | null) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [location, setLocation] = useState<BookingLocation | null>(initial || null);
  const [ready, setReady] = useState(!!initial);
  const draft = useAppSelector((s) => s.locationDraft);
  /** The draft requestId when this screen opened the picker; null = not waiting. */
  const waitingFrom = useRef<number | null>(null);

  useEffect(() => {
    if (initial) return;
    let live = true;
    loadGeoLocation().then((g) => {
      if (!live) return;
      if (g?.address) setLocation((cur) => cur || { lat: g.lat, lng: g.lng, address: g.address });
      setReady(true);
    });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (waitingFrom.current == null || draft.requestId <= waitingFrom.current || !draft.picked) return;
    waitingFrom.current = null;
    const p = draft.picked;
    const notes = [p.flatNumber, p.landmark].filter(Boolean).join(', ') || undefined;
    setLocation({ lat: p.lat, lng: p.lng, address: p.address, notes });
    saveGeoLocation({ lat: p.lat, lng: p.lng, address: p.address });
    dispatch(locationDraftCleared());
  }, [draft.requestId, draft.picked, dispatch]);

  const pick = useCallback(() => {
    waitingFrom.current = draft.requestId;
    dispatch(locationSeeded(location ? { lat: location.lat, lng: location.lng, address: location.address, source: 'map' } : null));
    router.push('/location/picker' as never);
  }, [draft.requestId, location, dispatch, router]);

  return { location, setLocation, ready, pick };
}
