/**
 * Busy areas nearby with higher pay right now (the websites' HotZonesCard).
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Flame, Navigation, UserX } from 'lucide-react-native';
import { useWorkerHotZonesQuery } from '@zappy/core/api';
import { Text } from '..';
import { colors, ink, slate, accent } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { directions } from '../../lib/directions';

interface Zone { line: string; lat: number; lng: number; service: string; multiplier: number; nobody?: boolean; km?: number | null; demand?: number }

export function HotZonesCard({ coords }: { coords?: number[] | null }) {
  const [lng, lat] = coords?.length === 2 ? coords : [];
  const { data } = useWorkerHotZonesQuery({ lat, lng }, { pollingInterval: 60000 });
  const zones: Zone[] = data?.zones || [];
  if (!data?.on || !zones.length) return null;
  return (
    <View style={styles.hot}>
      <View style={styles.hotHead}>
        <View style={styles.inline}><Flame size={16} color={accent[600]} /><Text variant="body" weight="black" color={accent[700]}>Surge near you</Text></View>
        <View style={styles.hotBadge}><Text variant="caption" weight="bold" color={accent[700]}>You keep {data.sharePct}% of surge</Text></View>
      </View>
      {zones.map((z) => {
        const quiet = z.nobody && z.multiplier <= 1;
        return (
          <View key={`${z.line}-${z.lat}-${z.lng}`} style={styles.zone}>
            <View style={[styles.zoneIcon, { backgroundColor: quiet ? slate[100] : accent[500] }]}>
              {quiet ? <UserX size={16} color={ink[700]} /> : <Flame size={16} color="#fff" />}
            </View>
            <View style={styles.flex}>
              <Text variant="bodySmall" weight="semibold" numberOfLines={1}>{z.service}</Text>
              <Text variant="caption" color={colors.textSecondary}>
                {z.multiplier > 1 ? `Surge ${z.multiplier.toFixed(2)}×` : 'No pro nearby yet'}
                {z.km != null ? ` · ${z.km} km away` : ''}{z.demand ? ` · ${z.demand} looking` : ''}
              </Text>
            </View>
            <Pressable onPress={() => directions(z.lat, z.lng)}
              accessibilityRole="link" accessibilityLabel={`Directions to ${z.service} surge area`} style={styles.go}>
              <Navigation size={12} color="#fff" /><Text variant="caption" weight="semibold" color="#fff">Go</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hot: { borderRadius: radius.medium, borderWidth: 1, borderColor: accent[100], backgroundColor: accent[50], overflow: 'hidden' },
  hotHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.sm },
  hotBadge: { backgroundColor: accent[100], borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  zone: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: accent[100] },
  zoneIcon: { width: 36, height: 36, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  go: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: ink[900], borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, minHeight: 32 },
});
