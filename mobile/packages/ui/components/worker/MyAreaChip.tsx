/**
 * Where the provider is, by area name, from their live position
 * (the websites' MyAreaChip).
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { Text } from '..';
import { describeCoordinates } from '../../location/geocode';
import { colors, ink, success } from '../../theme/colors';
import { radius } from '../../theme/radius';

/** Area names already looked up this session, so screens don't ask again. */
const named = new Map<string, string>();

/* Where the provider is, by area name (from [lng, lat]). */
export function MyAreaChip({ coordinates, label, live = false }: { coordinates?: number[] | null; label?: string | null; live?: boolean }) {
  const [lng, lat] = coordinates?.length === 2 ? coordinates : [];
  const has = typeof lat === 'number' && typeof lng === 'number' && (lat || lng);
  const key = has ? `${(lat as number).toFixed(3)},${(lng as number).toFixed(3)}` : null;
  const [area, setArea] = useState<string | null>(key ? named.get(key) ?? null : null);
  useEffect(() => {
    if (label || !key) return undefined;
    if (named.has(key)) { setArea(named.get(key) as string); return undefined; }
    let gone = false;
    describeCoordinates(lat as number, lng as number).then((r) => {
      if (!r) return;
      const name = r.subtitle ? `${r.title}, ${r.subtitle.split(',')[0]}` : r.title;
      named.set(key, name);
      if (!gone) setArea(name);
    });
    return () => { gone = true; };
  }, [key, label]); // eslint-disable-line react-hooks/exhaustive-deps
  const text = label || area;
  if (!text) return null;
  return (
    <View style={[styles.chip, live ? styles.chipLive : null]}>
      <MapPin size={12} color={live ? success[600] : ink[400]} />
      <Text variant="caption" weight="semibold" color={live ? success[700] : ink[700]} numberOfLines={1} style={styles.shrink}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shrink: { flexShrink: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', maxWidth: '100%', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 4 },
  chipLive: { borderColor: success[100], backgroundColor: success[50] },
});
