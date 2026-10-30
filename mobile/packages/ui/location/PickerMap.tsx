/**
 * Picker map — NATIVE.
 * ----------------------------------------------------------------------------
 * Wraps `react-native-maps` (not replaced, per the brief) for the one job the
 * location picker needs: show where the pin is and let the customer move it.
 *
 * Three ways to move the pin, because people reach for different ones:
 *   · drag the marker
 *   · tap anywhere on the map
 *   · the recentre button, which jumps back to the GPS fix
 *
 * The parent owns the coordinate. This component reports changes up and follows
 * the prop back down, so the pin, the reverse-geocoded address and the confirm
 * button can never disagree about where the booking is going.
 *
 * ⚠️ ANDROID NEEDS A REAL MAPS KEY. `app.json` still carries the placeholders
 * `YOUR_GOOGLE_MAPS_ANDROID_KEY` / `YOUR_GOOGLE_MAPS_IOS_KEY`. iOS falls back to
 * Apple Maps and renders fine, but Android's Google provider will show a blank
 * grey tile surface until a valid key is set. That is a project configuration
 * task, not something this component can work around.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import Svg, { Ellipse, Path, Rect } from 'react-native-svg';
import { useLazyGetNearbyWorkersQuery } from '@zappy/core/api';
import { useAppSelector } from '@zappy/core/store/hooks';
import { SCOOTER, SCOOTER_BOX, bearingOf } from '@zappy/core/shared/mapArt';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, type MapPressEvent, type MarkerDragStartEndEvent } from 'react-native-maps';
import { LocateFixed, MapPin } from 'lucide-react-native';
import { IconButton, Text } from '../components';
import { mapsAvailable } from '../lib/maps';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';
import { shadows } from '../theme/shadows';
import { spacing } from '../theme/spacing';

export interface PickerMapProps {
  lat: number;
  lng: number;
  /**
   * False while the coordinate is only a default the user never chose. The
   * marker still renders so it can be dragged into place — that is how you
   * place one — but it is drawn muted so it doesn't read as a confirmed pin.
   */
  hasPin?: boolean;
  onMove: (lat: number, lng: number) => void;
  /** Shown only when a GPS fix exists to return to. */
  onRecenter?: () => void;
  /** Dims interaction while the parent resolves an address. */
  busy?: boolean;
}

/** Roughly a neighbourhood — close enough to place a door, wide enough to orient. */
const ZOOM_DELTA = 0.0032;


// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Part = any;
type Pro = { key: string; lat: number; lng: number; heading: number };

function Scooter() {
  return (
    <Svg width={SCOOTER_BOX} height={SCOOTER_BOX} viewBox={`0 0 ${SCOOTER_BOX} ${SCOOTER_BOX}`}>
      {SCOOTER.map((p: Part, i: number) => (p.t === 'rect'
        ? <Rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.r} fill={p.fill} />
        : p.t === 'ellipse'
          ? <Ellipse key={i} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill={p.fill} />
          : <Path key={i} d={p.d} fill={p.fill} stroke={p.stroke} strokeWidth={p.sw} />))}
    </Svg>
  );
}

// Pros near the pin (blurred, anonymous; worker/nearby), refreshed every 8 s and turned toward where they moved (the website's picker).
function useNearbyPros(lat: number, lng: number) {
  const [fetchNearby] = useLazyGetNearbyWorkersQuery();
  const [pros, setPros] = useState<Pro[]>([]);
  const at = useRef({ lat, lng });
  at.current = { lat, lng };
  // Customers and guests only; a shop placing its own address has no use for them.
  const role = useAppSelector((st: { auth: { role?: string | null } }) => st.auth.role);
  const customer = !role || role === 'user';
  useEffect(() => {
    if (!customer) return undefined;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetchNearby({ lat: at.current.lat, lng: at.current.lng }).unwrap();
        if (!alive) return;
        setPros((prev) => (res?.workers || []).map((w: { key: string; lat: number; lng: number }, i: number) => {
          const was = prev.find((p) => p.key === w.key);
          const moved = was && (was.lat !== w.lat || was.lng !== w.lng);
          return { key: w.key || `i${i}`, lat: w.lat, lng: w.lng, heading: moved ? bearingOf(was, w) : was?.heading ?? (i * 67) % 360 };
        }));
      } catch { /* the map works without them */ }
    };
    load();
    const id = setInterval(load, 8000);
    return () => { alive = false; clearInterval(id); };
  }, [fetchNearby, lat, lng, customer]);
  return customer ? pros : [];
}

function PickerMapBase({ lat, lng, hasPin = true, onMove, onRecenter, busy }: PickerMapProps) {
  const mapRef = useRef<MapView>(null);
  const pros = useNearbyPros(lat, lng);

  // Follow the coordinate when it changes from outside (search result, saved
  // address, recentre). Dragging the marker already moved the camera, so
  // animating again would fight the gesture — but the delta is small enough
  // that animateCamera is a no-op in that case.
  useEffect(() => {
    mapRef.current?.animateCamera({ center: { latitude: lat, longitude: lng } }, { duration: 320 });
  }, [lat, lng]);

  const handleDragEnd = useCallback(
    (event: MarkerDragStartEndEvent) => {
      const { latitude, longitude } = event.nativeEvent.coordinate;
      onMove(latitude, longitude);
    },
    [onMove],
  );

  const handlePress = useCallback(
    (event: MapPressEvent) => {
      const { latitude, longitude } = event.nativeEvent.coordinate;
      onMove(latitude, longitude);
    },
    [onMove],
  );

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: lat,
          longitude: lng,
          latitudeDelta: ZOOM_DELTA,
          longitudeDelta: ZOOM_DELTA,
        }}
        onPress={handlePress}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {pros.map((p) => (
          <Marker key={p.key} coordinate={{ latitude: p.lat, longitude: p.lng }} anchor={{ x: 0.5, y: 0.5 }} flat rotation={p.heading} tracksViewChanges={false}>
            <Scooter />
          </Marker>
        ))}
        <Marker
          coordinate={{ latitude: lat, longitude: lng }}
          draggable
          onDragEnd={handleDragEnd}
          pinColor={hasPin ? colors.primary : colors.textMuted}
          title={hasPin ? 'Service location' : 'Drag to set your location'}
          description="Drag to adjust, or tap the map"
        />
      </MapView>

      {onRecenter ? (
        <View style={styles.recenter}>
          <IconButton
            icon={<LocateFixed size={20} color={colors.primary} />}
            onPress={onRecenter}
            variant="surface"
            disabled={busy}
            accessibilityLabel="Recentre on my current location"
            style={styles.recenterButton}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Without a map in this build (Android needs the Maps key), the pin is set by
 * search, a saved address or the current location; this panel holds its place.
 */
function PickerMapFallback(_: PickerMapProps) {
  return (
    <View style={[styles.root, styles.fallback]} accessibilityLabel="Map">
      <MapPin size={36} color={colors.primary} />
      <Text variant="caption" color={colors.textSecondary} align="center">Search above or use your current location to set where we come.</Text>
    </View>
  );
}

export const PickerMap = memo(mapsAvailable ? PickerMapBase : PickerMapFallback);

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, backgroundColor: colors.surfaceSecondary },
  root: { flex: 1, overflow: 'hidden', backgroundColor: colors.surfaceTertiary },
  recenter: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },
  recenterButton: {
    backgroundColor: colors.surface,
    borderRadius: radius.medium,
    ...shadows.soft,
  },
});
