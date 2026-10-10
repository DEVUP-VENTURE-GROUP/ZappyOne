/**
 * Choose a place (the websites' LocationPicker): use where you are now, search
 * an address, or move the pin on the map when this build can draw one. The
 * address is read back from the pin, so what is confirmed always matches it.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LocateFixed, MapPin, Search, X } from 'lucide-react-native';
import { getBestPosition } from '@zappy/core/hooks/useBestPosition';
import { Button, Text } from '..';
import { PickerMap } from '../../location/PickerMap';
import { describeCoordinates, searchAddress, type GeoResult } from '../../location/geocode';
import { RIPPLE } from '../../lib/feedback';
import { mapsAvailable } from '../../lib/maps';
import { colors, ink, slate, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export interface PickedPlace { address: string; lat: number; lng: number }

export function LocationPicker({ title, initial, onCancel, onConfirm }: {
  title: string;
  /** Start from a known place, e.g. the shop already on file. */
  initial?: PickedPlace | null;
  onCancel: () => void;
  onConfirm: (place: PickedPlace) => void;
}) {
  const insets = useSafeAreaInsets();
  const [place, setPlace] = useState<PickedPlace | null>(initial || null);
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searchNote, setSearchNote] = useState('');
  const lookup = useRef(0);

  // Read the address back for wherever the pin lands; the latest move wins.
  async function moveTo(lat: number, lng: number, known?: string) {
    const ticket = ++lookup.current;
    setPlace({ lat, lng, address: known || `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
    if (known) return;
    const found = await describeCoordinates(lat, lng);
    if (found && ticket === lookup.current) setPlace({ lat, lng, address: found.full });
  }

  async function useHere() {
    setLocating(true);
    try { const p = await getBestPosition({ windowMs: 6000 }); await moveTo(p.lat, p.lng); }
    catch (err) { setSearchNote((err as Error).message || 'Could not get your location'); }
    finally { setLocating(false); }
  }

  // Search as they type, after a short pause.
  useEffect(() => {
    if (query.trim().length < 3) { setResults([]); setSearchNote(''); return undefined; }
    const t = setTimeout(async () => {
      const out = await searchAddress(query);
      if (out.kind === 'results') { setResults(out.results); setSearchNote(''); }
      else { setResults([]); setSearchNote(out.kind === 'error' ? out.message : 'No place matches that. Try a street or area name.'); }
    }, 450);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <View style={styles.head}>
          <Text variant="heading3" weight="black" style={styles.flex} numberOfLines={1}>{title}</Text>
          <Pressable onPress={onCancel} hitSlop={10} accessibilityLabel="Close"><X size={20} color={ink[700]} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Pressable onPress={useHere} disabled={locating} android_ripple={RIPPLE} accessibilityRole="button" style={styles.here}>
            {locating ? <ActivityIndicator color={zappy[600]} /> : <LocateFixed size={18} color={zappy[600]} />}
            <Text variant="bodySmall" weight="bold" color={zappy[700]}>Use where I am now</Text>
          </Pressable>

          <View style={styles.search}>
            <Search size={15} color={ink[400]} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Search a street, area or landmark" placeholderTextColor={ink[400]}
              style={styles.searchInput} accessibilityLabel="Search an address" returnKeyType="search" />
          </View>
          {results.map((r) => (
            <Pressable key={r.id} onPress={() => { setQuery(''); setResults([]); moveTo(r.lat, r.lng, r.full); }} android_ripple={RIPPLE} style={styles.result}>
              <MapPin size={16} color={ink[400]} />
              <View style={styles.flex}><Text variant="bodySmall" weight="semibold">{r.title}</Text>{r.subtitle ? <Text variant="caption" color={ink[500]}>{r.subtitle}</Text> : null}</View>
            </Pressable>
          ))}
          {searchNote ? <Text variant="caption" color={ink[500]}>{searchNote}</Text> : null}

          {mapsAvailable && place ? (
            <View style={styles.map}><PickerMap lat={place.lat} lng={place.lng} onMove={(lat, lng) => moveTo(lat, lng)} /></View>
          ) : null}

          {place ? (
            <View style={styles.chosen}>
              <MapPin size={18} color={zappy[600]} />
              <View style={styles.flex}>
                <Text variant="caption" weight="bold" color={ink[500]}>PIN</Text>
                <Text variant="bodySmall" weight="semibold">{place.address}</Text>
              </View>
            </View>
          ) : null}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button label="Confirm this place" onPress={() => place && onConfirm(place)} disabled={!place} fullWidth size="large" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  body: { padding: spacing.base, gap: spacing.md },
  here: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: zappy[100], backgroundColor: zappy[50] },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], paddingVertical: spacing.sm },
  result: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.medium, backgroundColor: colors.surface, borderWidth: 1, borderColor: slate[100] },
  map: { height: 260, borderRadius: radius.large, overflow: 'hidden' },
  chosen: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.base, paddingTop: spacing.md },
});
