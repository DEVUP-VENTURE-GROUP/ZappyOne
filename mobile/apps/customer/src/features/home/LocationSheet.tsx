/**
 * Set the service location (the website's LocationSheet): current GPS, or
 * search an area, street or landmark. A bottom sheet.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { LocateFixed, MapPin, Search } from 'lucide-react-native';
import { BottomSheet, Text } from '@zappy/ui/components';
import { searchAddress, type GeoResult } from '@zappy/ui/location/geocode';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface PickedArea { lat: number; lng: number; primary: string; secondary: string | null }

export function LocationSheet({ open, onClose, onUseCurrent, detecting, onPick }: {
  open: boolean; onClose: () => void; onUseCurrent: () => void; detecting: boolean; onPick: (p: PickedArea) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => { if (!open) { setQuery(''); setResults([]); setNote(''); } }, [open]);
  // Wait for a pause in typing, not every keystroke.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setResults([]); setNote(''); return undefined; }
    let live = true;
    const t = setTimeout(async () => {
      setSearching(true);
      const out = await searchAddress(q);
      if (!live) return;
      setSearching(false);
      if (out.kind === 'results') { setResults(out.results); setNote(''); }
      else { setResults([]); setNote(out.kind === 'error' ? out.message : 'No place matches that. Try a street or area name.'); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [query]);

  return (
    <BottomSheet visible={open} onClose={onClose} title="Where do you need the service?">
      <View style={styles.body}>
        <View style={styles.search}>
          <Search size={16} color={ink[400]} />
          <TextInput value={query} onChangeText={setQuery} autoFocus placeholder="Search area, street or landmark" placeholderTextColor={ink[400]} style={styles.input} returnKeyType="search" />
          {searching ? <ActivityIndicator size="small" color={zappy[500]} /> : null}
        </View>
        <Pressable onPress={onUseCurrent} disabled={detecting} android_ripple={RIPPLE} accessibilityRole="button" style={styles.current}>
          {detecting ? <ActivityIndicator size="small" color={zappy[600]} /> : <LocateFixed size={18} color={zappy[600]} />}
          <View style={styles.flex}>
            <Text variant="bodySmall" weight="semibold" color={zappy[700]}>Use my current location</Text>
            <Text variant="caption" color={ink[500]}>Most accurate for sending a pro to you</Text>
          </View>
        </Pressable>
        {results.map((r) => (
          <Pressable key={r.id} onPress={() => onPick({ lat: r.lat, lng: r.lng, primary: r.title, secondary: r.subtitle || null })} android_ripple={RIPPLE} style={styles.result}>
            <MapPin size={15} color={ink[400]} />
            <View style={styles.flex}>
              <Text variant="bodySmall" weight="medium" numberOfLines={1}>{r.title}</Text>
              {r.subtitle ? <Text variant="caption" color={ink[500]} numberOfLines={1}>{r.subtitle}</Text> : null}
            </View>
          </Pressable>
        ))}
        {note ? <Text variant="caption" color={ink[500]}>{note}</Text> : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  body: { paddingHorizontal: spacing.base, paddingBottom: spacing.xl, gap: spacing.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 48, paddingHorizontal: spacing.md, borderRadius: radius.medium, borderWidth: 1, borderColor: slate[200], backgroundColor: colors.surface },
  input: { flex: 1, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900] },
  current: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.medium },
  result: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderBottomColor: slate[100] },
});
