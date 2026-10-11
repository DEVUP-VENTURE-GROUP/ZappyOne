/**
 * Choosing a place on the shared map picker (/location/picker).
 *
 *   usePickLocation(onPicked)  opens the picker seeded where the customer
 *                              stands; its result arrives through the
 *                              locationDraft hand-off and is applied exactly once
 *   useBookingLocation()       where a booking happens (the websites' booking
 *                              `location` state): starts from `initial` (a
 *                              resumed draft) or the last place the phone was,
 *                              and remembers a fresh pin for the next screen
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { loadGeoLocation, saveGeoLocation } from '@zappy/core/lib/geoCache';
import { useAppDispatch, useAppSelector } from '@zappy/core/store/hooks';
import { locationDraftCleared, locationSeeded } from '@zappy/core/store/locationDraftSlice';

export interface BookingLocation { lat: number; lng: number; address: string; notes?: string }

export function usePickLocation(onPicked: (loc: BookingLocation) => void) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const draft = useAppSelector((s) => s.locationDraft);
  /** The draft requestId when this screen opened the picker; null = not waiting. */
  const waitingFrom = useRef<number | null>(null);
  const handler = useRef(onPicked);
  handler.current = onPicked;

  useEffect(() => {
    if (waitingFrom.current == null || draft.requestId <= waitingFrom.current || !draft.picked) return;
    waitingFrom.current = null;
    const p = draft.picked;
    const notes = [p.flatNumber, p.landmark].filter(Boolean).join(', ') || undefined;
    handler.current({ lat: p.lat, lng: p.lng, address: p.address, notes });
    saveGeoLocation({ lat: p.lat, lng: p.lng, address: p.address });
    dispatch(locationDraftCleared());
  }, [draft.requestId, draft.picked, dispatch]);

  return useCallback((seed?: BookingLocation | null) => {
    waitingFrom.current = draft.requestId;
    dispatch(locationSeeded(seed ? { lat: seed.lat, lng: seed.lng, address: seed.address, source: 'map' } : null));
    router.push('/location/picker' as never);
  }, [draft.requestId, dispatch, router]);
}

export function useBookingLocation(initial?: BookingLocation | null) {
  const [location, setLocation] = useState<BookingLocation | null>(initial || null);
  const [ready, setReady] = useState(!!initial);

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

  const open = usePickLocation(setLocation);
  const pick = useCallback(() => open(location), [open, location]);
  return { location, setLocation, ready, pick };
}
