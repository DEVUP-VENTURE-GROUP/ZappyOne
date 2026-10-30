/**
 * Where the provider is, by area name, from their live position
 * (the websites' MyAreaChip).
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { BottomSheet, Text } from '..';
import { SpotMap } from '../../maps/SpotMap';
import { mapsAvailable } from '../../lib/maps';
import { describeCoordinates } from '../../location/geocode';
import { colors, ink, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';

/** Area names already looked up this session, so screens don't ask again. */
const named = new Map<string, string>();

/* Where the provider is, by area name (from [lng, lat]). */
export function MyAreaChip({ coordinates, label, live = false }: { coordinates?: number[] | null; label?: string | null; live?: boolean }) {
  const [lng, lat] = coordinates?.length === 2 ? coordinates : [];
  const has = typeof lat === 'number' && typeof lng === 'number' && (lat || lng);
  const key = has ? `${(lat as number).toFixed(3)},${(lng as number).toFixed(3)}` : null;
  const [area, setArea] = useState<string | null>(key ? named.get(key) ?? null : null);
  const [open, setOpen] = useState(false);
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
  const chip = (
    <View style={[styles.chip, live ? styles.chipLive : null]}>
      <MapPin size={12} color={live ? zappy[600] : ink[400]} />
      <Text variant="caption" weight="semibold" color={live ? zappy[800] : ink[700]} numberOfLines={1} style={styles.shrink}>{text}</Text>
    </View>
  );
  if (!has || !mapsAvailable) return chip;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${text}, see on the map`} style={styles.press}>{chip}</Pressable>
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={text}>
        <View style={styles.sheet}>
          <Text variant="caption" color={ink[500]}>{live ? 'Live now. Jobs near here come to you first.' : 'Your pinned location'}</Text>
          <SpotMap lat={lat as number} lng={lng as number} />
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  shrink: { flexShrink: 1 },
  press: { alignSelf: 'flex-start', maxWidth: '100%' },
  sheet: { gap: 10, paddingHorizontal: 16, paddingBottom: 24 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', maxWidth: '100%', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 4 },
  chipLive: { borderColor: zappy[200], backgroundColor: zappy[50] },
});
