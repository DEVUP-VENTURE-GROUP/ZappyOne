/**
 * Picker map — WEB fallback.
 * ----------------------------------------------------------------------------
 * Same reason as `LiveTrackingMap.web.tsx`: `react-native-maps` has no web
 * build, and merely importing it crashes the web bundle in
 * `codegenNativeComponent`. Metro resolves `.web.tsx` ahead of `.tsx`, so this
 * substitutes without any metro.config or alias change.
 *
 * The brief requires the existing web fallback be kept, and this preserves the
 * part that matters: on web the picker is still fully usable — search, saved
 * addresses, recent locations, GPS and confirm all work. Only the raster tiles
 * and the drag gesture are missing, so this states the current pin plainly and
 * says where the map lives, instead of pretending to be one.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LocateFixed, MapPin } from 'lucide-react-native';
import { Button, Text } from '../ui';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export interface PickerMapProps {
  lat: number;
  lng: number;
  /** False while the coordinate is only a default the user never chose. */
  hasPin?: boolean;
  onMove: (lat: number, lng: number) => void;
  onRecenter?: () => void;
  busy?: boolean;
}

function PickerMapWebBase({ lat, lng, hasPin = true, onRecenter, busy }: PickerMapProps) {
  return (
    <View style={styles.root}>
      <View style={[styles.pinBadge, hasPin ? null : styles.pinBadgeEmpty]}>
        <MapPin size={26} color={hasPin ? colors.primary : colors.textMuted} />
      </View>

      {/* Never claim a pin exists when the coordinate is just the fallback —
          the panel below would be saying the opposite at the same moment. */}
      <Text variant="body" weight="semibold" align="center">
        {hasPin ? 'Pin placed' : 'No location chosen yet'}
      </Text>
      {hasPin ? (
        <Text variant="bodySmall" color={colors.textSecondary} align="center">
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </Text>
      ) : null}

      <Text variant="caption" color={colors.textMuted} align="center" style={styles.note}>
        The draggable map is available in the Zappy mobile app. Search, or pick a
        saved address, to set the pin here.
      </Text>

      {onRecenter ? (
        <Button
          label="Use my current location"
          variant="secondary"
          size="small"
          icon={<LocateFixed size={15} color={colors.primary} />}
          onPress={onRecenter}
          disabled={busy}
        />
      ) : null}
    </View>
  );
}

export const PickerMap = memo(PickerMapWebBase);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
  },
  pinBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.medium,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  pinBadgeEmpty: { backgroundColor: colors.surfaceTertiary },
  note: { maxWidth: 300, marginTop: spacing.sm, marginBottom: spacing.base },
});
