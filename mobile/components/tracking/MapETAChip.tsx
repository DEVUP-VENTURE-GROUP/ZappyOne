/**
 * The floating ETA chip over the map.
 * ----------------------------------------------------------------------------
 * Ported from `client/src/components/tracking/redesign/MapETAChip.jsx`, which
 * states its own gate: "Renders only when there's a meaningful ETA to show."
 * That gate is the important part and is preserved exactly — `eta` must be a
 * real number from the server's `order.eta` event, and the status must be one
 * where a worker is actually travelling. There is no fallback copy, because a
 * chip that says "calculating…" forever is worse than no chip.
 *
 * Measured from that file:
 *   position  absolute, 12px from the map's top-left
 *   surface   rgba(255,255,255,.92), 1px rgba(255,255,255,.7), rounded-2xl
 *   icon      36×36 rounded-xl, #EAF0FF on #2563FF
 *   value     17px extrabold #0B1220
 *   sub       10.5px semibold #647084
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Clock } from 'lucide-react-native';
import { Text } from '../ui';
import { colors, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { fontFamily } from '../../theme/typography';

export interface MapETAChipProps {
  /** Minutes, from `order.eta`. Null hides the chip. */
  eta?: number | null;
  distanceKm?: number | null;
  status?: string | null;
  /** Pushed down to clear the safe area and the floating back button. */
  topOffset?: number;
}

function MapETAChipBase({ eta, distanceKm, status, topOffset = 0 }: MapETAChipProps) {
  const show = eta != null && (status === 'assigned' || status === 'on_the_way');
  if (!show) return null;

  return (
    <View style={[styles.chip, { top: topOffset }]} pointerEvents="none">
      <View style={styles.icon}>
        <Clock size={18} strokeWidth={2.2} color={zappy[600]} />
      </View>
      <View>
        <Text style={styles.value}>{eta} min away</Text>
        <Text style={styles.sub}>
          Estimated arrival
          {distanceKm != null ? ` · ${Number(distanceKm).toFixed(1)} km` : ''}
        </Text>
      </View>
    </View>
  );
}

export const MapETAChip = memo(MapETAChipBase);

const styles = StyleSheet.create({
  chip: {
    position: 'absolute',
    left: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: radius.medium,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    ...shadows.softLarge,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.button,
    backgroundColor: zappy[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontFamily: fontFamily.extrabold,
    fontSize: 17,
    lineHeight: 20,
    letterSpacing: -0.34,
    color: colors.textHeading,
  },
  sub: {
    marginTop: 2,
    fontFamily: fontFamily.semibold,
    fontSize: 10.5,
    lineHeight: 14,
    color: colors.textSecondary,
  },
});
