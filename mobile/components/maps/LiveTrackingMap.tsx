/**
 * Live tracking map — NATIVE.
 * ----------------------------------------------------------------------------
 * Same `react-native-maps` and the same socket contract as before. What changed
 * is presentation: branded markers instead of stock pins, a dashed route hint,
 * and a camera that keeps both points in frame.
 *
 * ── THE STRAIGHT LINE IS DELIBERATELY A HINT ───────────────────────────────
 * There is no routing API in this project, so the polyline between the pro and
 * the address is a straight geodesic, not a driving route. It is drawn dashed
 * and thin for exactly that reason — a solid route line would assert a path
 * along roads that nobody computed. The ETA shown elsewhere IS traffic-aware
 * (`eta.service.js` uses a distance matrix), but that number arrives over the
 * socket; it is not derived from this line.
 *
 * ── CAMERA ─────────────────────────────────────────────────────────────────
 * `fitToCoordinates` runs when the pair of points changes materially, not on
 * every tick: worker positions arrive up to once a second, and re-framing at
 * that rate makes the map unusable — the customer can never pan or zoom
 * without being yanked back. `followWorker` lets the parent hand control back
 * to the user, and the recentre control restores it.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import { Home, Navigation } from 'lucide-react-native';
import { useSocket } from '../../hooks/useSocket';
import { colors } from '../../theme/colors';
import { shadows } from '../../theme/shadows';
import type { WorkerLocationEvent } from '../../services/socket/events';

export interface LiveTrackingMapProps {
  orderId: string;
  pickupLat: number;
  pickupLng: number;
  /** Seeds the marker before the first socket tick — see Order.workerCurrentLocation. */
  initialWorkerLocation?: { lat: number; lng: number } | null;
  /** False once the customer has panned; the parent re-arms it on recentre. */
  followWorker?: boolean;
  /** Fired on first user gesture so the parent can show a recentre control. */
  onUserPan?: () => void;
  style?: object;
}

/** Padding around the fitted pair, in points. Leaves room for the bottom card. */
const FIT_EDGE = { top: 90, right: 70, bottom: 240, left: 70 };

/** Re-frame only when a point moves more than ~25m. */
const REFRAME_THRESHOLD_DEG = 0.00022;

function movedEnough(a: { lat: number; lng: number } | null, b: { lat: number; lng: number } | null) {
  if (!a || !b) return true;
  return (
    Math.abs(a.lat - b.lat) > REFRAME_THRESHOLD_DEG ||
    Math.abs(a.lng - b.lng) > REFRAME_THRESHOLD_DEG
  );
}

function LiveTrackingMapBase({
  orderId,
  pickupLat,
  pickupLng,
  initialWorkerLocation = null,
  followWorker = true,
  onUserPan,
  style,
}: LiveTrackingMapProps) {
  const mapRef = useRef<MapView>(null);
  const [workerLocation, setWorkerLocation] = useState(initialWorkerLocation);
  const lastFitted = useRef<{ lat: number; lng: number } | null>(null);
  const socketClient = useSocket(orderId);

  // Socket wiring is untouched: same event, same client, same room.
  useEffect(() => {
    const handler = (payload: WorkerLocationEvent) => {
      if (typeof payload?.lat === 'number' && typeof payload?.lng === 'number') {
        setWorkerLocation({ lat: payload.lat, lng: payload.lng });
      }
    };
    socketClient.on('worker.location', handler);
    return () => socketClient.off('worker.location', handler);
  }, [socketClient]);

  // A later prop (from a refetch) should still seed the marker if the socket
  // has been quiet — but must never overwrite a fresher socket position.
  useEffect(() => {
    if (initialWorkerLocation && !workerLocation) setWorkerLocation(initialWorkerLocation);
  }, [initialWorkerLocation, workerLocation]);

  const fitBoth = useCallback(() => {
    if (!workerLocation) return;
    mapRef.current?.fitToCoordinates(
      [
        { latitude: pickupLat, longitude: pickupLng },
        { latitude: workerLocation.lat, longitude: workerLocation.lng },
      ],
      { edgePadding: FIT_EDGE, animated: true },
    );
    lastFitted.current = workerLocation;
  }, [workerLocation, pickupLat, pickupLng]);

  useEffect(() => {
    if (!followWorker || !workerLocation) return;
    if (!movedEnough(lastFitted.current, workerLocation)) return;
    fitBoth();
  }, [followWorker, workerLocation, fitBoth]);

  // `isGesture` distinguishes a pan by the customer from our own animations.
  const handleRegionChange = useCallback(
    (_region: Region, details?: { isGesture?: boolean }) => {
      if (details?.isGesture) onUserPan?.();
    },
    [onUserPan],
  );

  return (
    <View style={[styles.root, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: workerLocation?.lat ?? pickupLat,
          longitude: workerLocation?.lng ?? pickupLng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        onRegionChangeComplete={handleRegionChange}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        // The bottom card covers the lower third; keep Google's logo above it.
        mapPadding={{ top: 0, right: 0, bottom: 160, left: 0 }}
      >
        {/* Destination — where the customer is. */}
        <Marker
          coordinate={{ latitude: pickupLat, longitude: pickupLng }}
          title="Your location"
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
        >
          <View style={[styles.pin, styles.pinCustomer]}>
            <Home size={15} color={colors.textInverse} />
          </View>
        </Marker>

        {workerLocation ? (
          <>
            <Marker
              coordinate={{ latitude: workerLocation.lat, longitude: workerLocation.lng }}
              title="Your professional"
              anchor={{ x: 0.5, y: 0.5 }}
              // Re-rendering a custom marker view on every tick is the single
              // biggest cause of jank on Android maps.
              tracksViewChanges={false}
            >
              <View style={[styles.pin, styles.pinWorker]}>
                <Navigation size={15} color={colors.textInverse} />
              </View>
            </Marker>

            <Polyline
              coordinates={[
                { latitude: workerLocation.lat, longitude: workerLocation.lng },
                { latitude: pickupLat, longitude: pickupLng },
              ]}
              strokeColor={colors.primary}
              strokeWidth={3}
              // Straight-line hint, not a driving route — see the header.
              lineDashPattern={Platform.OS === 'ios' ? [6, 6] : [12, 8]}
              geodesic
            />
          </>
        ) : null}
      </MapView>
    </View>
  );
}

export const LiveTrackingMap = memo(LiveTrackingMapBase);

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: colors.surfaceTertiary },
  pin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.surface,
    ...shadows.soft,
  },
  pinCustomer: { backgroundColor: colors.pinCustomer },
  pinWorker: { backgroundColor: colors.pinWorker },
});
