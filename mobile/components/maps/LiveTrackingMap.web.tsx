/**
 * LiveTrackingMap — WEB variant.
 * ----------------------------------------------------------------------------
 * `react-native-maps` has no web build. Its `src/specs/NativeComponent*.ts`
 * call `codegenNativeComponent`, which `react-native-web` does not export, so
 * merely IMPORTING the package crashes the web bundle with:
 *
 *   (0, _reactNativeWebDistIndex.codegenNativeComponent) is not a function
 *
 * Metro resolves `.web.tsx` ahead of `.tsx` automatically, so this replaces the
 * native map on web with NO metro.config.js alias and no build-config change.
 *
 * Web is not a shipping target (Android and iOS are), but `expo start --web` is
 * the fastest visual-QA surface, and one unbuildable route blocks the whole
 * route tree from rendering.
 *
 * Behaviour is preserved where it matters: this still joins the order room and
 * subscribes to `worker.location`, so the live position is shown as text. Only
 * the raster map is absent; status, ETA, worker card and chat all still work.
 * ----------------------------------------------------------------------------
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { MapPin, Navigation } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { useSocket } from '../../hooks/useSocket';
import { colors, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import type { WorkerLocationEvent } from '../../services/socket/events';

interface LiveTrackingMapProps {
  orderId: string;
  pickupLat: number;
  pickupLng: number;
  initialWorkerLocation?: { lat: number; lng: number } | null;
}

export const LiveTrackingMap: React.FC<LiveTrackingMapProps> = ({
  orderId,
  pickupLat,
  pickupLng,
  initialWorkerLocation = null,
}) => {
  const socketClient = useSocket(orderId);
  const [workerLocation, setWorkerLocation] = useState(initialWorkerLocation);

  useEffect(() => {
    const handler = (payload: WorkerLocationEvent) => {
      if (typeof payload?.lat === 'number' && typeof payload?.lng === 'number') {
        setWorkerLocation({ lat: payload.lat, lng: payload.lng });
      }
    };
    socketClient.on('worker.location', handler);
    return () => socketClient.off('worker.location', handler);
  }, [socketClient]);

  return (
    <View style={styles.container} accessibilityLabel="Live tracking summary">
      <View style={styles.row}>
        <View style={styles.pin}>
          <MapPin size={18} color={colors.pinCustomer} />
        </View>
        <View style={styles.body}>
          <Text variant="label">Your location</Text>
          <Text variant="bodySmall" color={colors.textPrimary}>
            {pickupLat.toFixed(5)}, {pickupLng.toFixed(5)}
          </Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={[styles.pin, styles.pinWorker]}>
          <Navigation size={18} color={colors.pinWorker} />
        </View>
        <View style={styles.body}>
          <Text variant="label">Your professional</Text>
          <Text variant="bodySmall" color={colors.textPrimary}>
            {workerLocation
              ? `${workerLocation.lat.toFixed(5)}, ${workerLocation.lng.toFixed(5)}`
              : 'Waiting for their location…'}
          </Text>
        </View>
      </View>

      <Text variant="caption" align="center">
        The live map is available in the Zappy mobile app.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 300,
    borderRadius: radius.large,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pin: {
    width: 40,
    height: 40,
    borderRadius: radius.medium,
    backgroundColor: zappy[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinWorker: { backgroundColor: colors.accentTint },
  body: { flex: 1 },
});
