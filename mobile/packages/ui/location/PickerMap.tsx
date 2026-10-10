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

import React, { memo, useCallback, useEffect, useRef } from 'react';
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
const ZOOM_DELTA = 0.006;

function PickerMapBase({ lat, lng, hasPin = true, onMove, onRecenter, busy }: PickerMapProps) {
  const mapRef = useRef<MapView>(null);

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
