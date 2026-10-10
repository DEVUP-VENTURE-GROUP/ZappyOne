/**
 * Shown while the provider's trip is shared live with the customer
 * (the websites' TripSharingBanner).
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Navigation } from 'lucide-react-native';
import type { SharingState } from '@zappy/core/hooks/useJobTrip';
import { Text } from '..';
import { directions } from '../../lib/directions';
import { RIPPLE } from '../../lib/feedback';
import { zappy, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

/* While on a trip leg: is the customer seeing them? */
export function TripSharingBanner({ sharing, to, toCustomer = true }: { sharing: SharingState; to?: { lat: number; lng: number } | null; toCustomer?: boolean }) {
  const live = sharing === 'sharing';
  return (
    <View style={styles.trip}>
      <View style={[styles.dot, { backgroundColor: live ? zappy[600] : slate[300] }]} />
      <View style={styles.flex}>
        <Text variant="bodySmall" weight="bold" color={zappy[800]}>
          {live ? 'Customer can see you on the map' : sharing === 'denied' ? 'Location access is blocked' : 'Getting your location…'}
        </Text>
        <Text variant="caption" color={zappy[700]}>
          {live ? (toCustomer ? 'It stops by itself the moment you mark yourself arrived.' : 'It stops by itself when this leg of the trip ends.')
            : sharing === 'denied' ? 'Allow location for ZappyOne in Settings so the customer can follow your trip.'
              : 'Waiting for the first GPS fix. This can take a few seconds.'}
        </Text>
      </View>
      {to ? (
        <Pressable onPress={() => directions(to.lat, to.lng)} android_ripple={RIPPLE} accessibilityRole="link" style={styles.dirBtn}>
          <Navigation size={12} color="#fff" /><Text variant="caption" weight="bold" color="#fff">Directions</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  trip: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, backgroundColor: zappy[50], borderRadius: radius.medium, borderWidth: 1, borderColor: zappy[100], padding: spacing.md },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  dirBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: zappy[600], borderRadius: radius.button, paddingHorizontal: spacing.sm, minHeight: 32 },
});
