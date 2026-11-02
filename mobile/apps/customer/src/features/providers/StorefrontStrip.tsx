/** Inside a booking flow (the website's StorefrontStrip): the verified providers near you for this service, a tap away; hidden when none or one is already chosen. */
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, Store } from 'lucide-react-native';
import { useStorefrontsQuery } from '@zappy/core/api';
import { loadGeoLocation, type CachedLocation } from '@zappy/core/lib/geoCache';
import { Appear, Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { Storefront } from './StorefrontsPage';

export function StorefrontStrip({ vertical }: { vertical: string }) {
  const router = useRouter();
  const { provider } = useLocalSearchParams<{ provider?: string }>();
  const [loc, setLoc] = useState<CachedLocation | null>(null);
  useEffect(() => { loadGeoLocation().then((l) => setLoc(l || null)); }, []);
  const { data } = useStorefrontsQuery({ vertical, lat: loc?.lat, lng: loc?.lng }, { skip: !loc || !!provider });
  const top: Storefront[] = (data?.items || []).slice(0, 3);
  if (!top.length) return null;
  return (
    <Appear>
      <Pressable onPress={() => router.push(`/providers/${vertical.replace(/_/g, '-')}` as never)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.card}>
        <View style={styles.faces}>
          {top.map((s, i) => (
            <View key={`${s.kind}:${s.id}`} style={[styles.face, i > 0 && styles.overlap]}>
              {s.imageUrl ? <Image source={{ uri: s.imageUrl }} style={StyleSheet.absoluteFill} /> : <Store size={14} color={zappy[500]} />}
            </View>
          ))}
        </View>
        <View style={styles.flex}>
          <Text variant="bodySmall" weight="bold">Choose who comes</Text>
          <Text variant="caption" color={ink[500]} numberOfLines={1}>{data.total} verified near you{top[0].rating != null ? ` · top rated ${top[0].rating.toFixed(1)}` : ''}</Text>
        </View>
        <ChevronRight size={18} color={slate[400]} />
      </Pressable>
    </Appear>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  faces: { flexDirection: 'row' },
  face: { width: 34, height: 34, borderRadius: 17, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50], borderWidth: 2, borderColor: colors.surface },
  overlap: { marginLeft: -10 },
  flex: { flex: 1, minWidth: 0 },
});
