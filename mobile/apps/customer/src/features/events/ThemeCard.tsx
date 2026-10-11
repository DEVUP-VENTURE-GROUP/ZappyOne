/** A décor theme (the website's ThemeCard): cover, saved heart, trending or video badge, occasion and decorator, starting price, rating. */
import { memo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Heart, Play, Star } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { webAsset } from '@zappy/ui/lib/media';
import { accent, colors, danger, ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface Theme {
  _id: string; title: string; coverImage?: string; videoUrl?: string; isSaved?: boolean; isTrending?: boolean; status?: string;
  categoryId?: { name?: string }; partnerId?: { businessName?: string }; startingPricePaise?: number; rating?: number; reviewCount?: number; bookingCount?: number;
}

export const rupees = (paise?: number) => `₹${Math.round((paise || 0) / 100).toLocaleString('en-IN')}`;

export const ThemeCard = memo(function ThemeCard({ theme, onSave }: { theme: Theme; onSave: (id: string) => void }) {
  const router = useRouter();
  const cover = webAsset(theme.coverImage);
  return (
    <Pressable onPress={() => router.push(`/events/themes/${theme._id}` as never)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.card}>
      <View style={styles.coverWrap}>
        {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} /> : null}
        {theme.videoUrl ? <View style={styles.play}><Play size={14} color="#fff" /></View> : null}
        {theme.isTrending ? <View style={styles.badge}><Text variant="caption" weight="black" color="#fff">TRENDING</Text></View> : null}
        <Pressable onPress={() => onSave(theme._id)} accessibilityRole="button" accessibilityLabel={theme.isSaved ? 'Remove from saved' : 'Save'} hitSlop={6}
          style={[styles.heart, theme.isSaved && styles.saved]}>
          <Heart size={16} color="#fff" fill={theme.isSaved ? '#fff' : 'transparent'} />
        </Pressable>
      </View>
      <View style={styles.body}>
        <Text variant="bodySmall" weight="black" numberOfLines={1}>{theme.title}</Text>
        <Text variant="caption" weight="semibold" color={ink[400]} numberOfLines={1}>{[theme.categoryId?.name, theme.partnerId?.businessName].filter(Boolean).join(' · ')}</Text>
        <View style={styles.foot}>
          <Text variant="body" weight="black" color={danger[600]}>{rupees(theme.startingPricePaise)}</Text>
          <View style={styles.rating}><Star size={12} color={accent[500]} fill={accent[500]} /><Text variant="caption" weight="bold" color={ink[700]}>{theme.rating ? theme.rating.toFixed(1) : '–'}</Text><Text variant="caption" color={ink[400]}>({theme.reviewCount || 0})</Text></View>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  coverWrap: { height: 190, backgroundColor: slate[100] },
  play: { position: 'absolute', right: spacing.md, bottom: spacing.md, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  badge: { position: 'absolute', left: spacing.md, top: spacing.md, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: accent[600] },
  heart: { position: 'absolute', right: spacing.md, top: spacing.md, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  saved: { backgroundColor: danger[500] },
  body: { gap: 2, padding: spacing.base },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.small, backgroundColor: slate[50] },
});
