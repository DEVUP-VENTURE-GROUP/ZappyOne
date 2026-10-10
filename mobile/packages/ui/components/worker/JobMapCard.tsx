/**
 * The job's place on a map with the distance and directions (the websites' JobMapCard).
 * Without a Maps key in the build, a plain card shows instead of the map.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Constants from 'expo-constants';
import { MapPin, Navigation } from 'lucide-react-native';
import { useMyPosition } from '@zappy/core/hooks/useJobTrip';
import { Text } from '..';
import { directions } from '../../lib/directions';
import { RIPPLE } from '../../lib/feedback';
import { colors, zappy, ink } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

const hasMapsKey = !!(Constants.expoConfig?.android?.config?.googleMaps?.apiKey);

const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

/* Where to go: the customer's pin and their own position, and one tap into navigation. */
export function JobMapCard({ to, label = 'Customer location', live = true }: { to: { lat: number; lng: number; address?: string } | null; label?: string; live?: boolean }) {
  const me = useMyPosition(live && !!to);
  if (!to) return null;
  const distance = me ? kmBetween(me, to) : null;
  return (
    <View style={styles.mapCard}>
      {/* A Google map needs the build's Maps key; without it Android cannot draw one, so the card stays useful without. */}
      {hasMapsKey ? (
        <MapView provider={PROVIDER_GOOGLE} style={styles.map} initialRegion={{ latitude: to.lat, longitude: to.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
          showsUserLocation={live} toolbarEnabled={false} accessibilityLabel={`Map: ${label}`}>
          <Marker coordinate={{ latitude: to.lat, longitude: to.lng }} title={label} pinColor={zappy[600]} />
        </MapView>
      ) : null}
      <View style={styles.row}>
        <MapPin size={18} color={zappy[600]} />
        <View style={styles.flex}>
          <Text variant="caption" weight="bold" color={ink[400]}>
            {label.toUpperCase()}{distance != null ? ` · ${distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`} away` : ''}
          </Text>
          <Text variant="bodySmall" weight="semibold" numberOfLines={2}>{to.address || `${to.lat.toFixed(5)}, ${to.lng.toFixed(5)}`}</Text>
        </View>
        <Pressable onPress={() => directions(to.lat, to.lng)} android_ripple={RIPPLE} accessibilityRole="link" style={styles.navBtn}>
          <Navigation size={14} color="#fff" /><Text variant="bodySmall" weight="bold" color="#fff">Navigate</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mapCard: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', paddingBottom: spacing.md, gap: spacing.md },
  map: { height: 220 },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.button, paddingHorizontal: spacing.md, minHeight: 40, marginRight: spacing.md },
});
