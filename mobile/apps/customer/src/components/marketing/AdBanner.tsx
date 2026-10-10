/**
 * The home ad strip (the website's AdBanner): banners, offer cards, home cards
 * and sponsored services from admin. Counts a view once per session per ad and
 * a tap each time; a tap opens its link in the app, or outside for a web link.
 */
import { useEffect } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGetActiveAdsQuery, useTrackAdClickMutation, useTrackAdImpressionMutation } from '@zappy/core/api';
import { Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { openLink } from '@zappy/ui/lib/openLink';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const DISPLAY_TYPES = new Set(['banner', 'offer_card', 'home_card', 'sponsored_service']);
const seen = new Set<string>();   // views counted this session

interface Ad { _id: string; type: string; content?: { backgroundColor?: string; textColor?: string; imageUrl?: string; badgeText?: string; headline?: string; body?: string; ctaLink?: string; ctaText?: string } }

export function AdBanner({ isAuthed }: { isAuthed: boolean }) {
  const router = useRouter();
  const { data } = useGetActiveAdsQuery(undefined, { skip: !isAuthed });
  const [trackImpression] = useTrackAdImpressionMutation();
  const [trackClick] = useTrackAdClickMutation();
  const ads: Ad[] = (data?.ads || []).filter((a: Ad) => DISPLAY_TYPES.has(a.type));

  useEffect(() => {
    for (const ad of ads) {
      const key = String(ad._id);
      if (!seen.has(key)) { seen.add(key); trackImpression(key); }
    }
  }, [ads.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ads.length) return null;
  function open(ad: Ad) {
    trackClick(String(ad._id));
    const link = ad.content?.ctaLink;
    if (!link) return;
    if (/^https?:/i.test(link)) openLink(link); else router.push(link as never);
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {ads.map((ad) => {
        const c = ad.content || {};
        const fg = c.textColor || '#fff';
        return (
          <Pressable key={ad._id} onPress={() => open(ad)} accessibilityRole="button" accessibilityLabel={c.headline} style={[styles.ad, { backgroundColor: c.backgroundColor || '#2563EB' }]}>
            {c.imageUrl ? <Image source={{ uri: webAsset(c.imageUrl) || undefined }} style={[StyleSheet.absoluteFill, styles.bg]} resizeMode="cover" /> : null}
            <View style={styles.body}>
              {c.badgeText ? <View style={styles.badge}><Text variant="caption" weight="black" color={fg}>{c.badgeText.toUpperCase()}</Text></View> : null}
              <Text variant="bodySmall" weight="bold" color={fg} numberOfLines={2}>{c.headline}</Text>
              {c.body ? <Text variant="caption" color={fg} numberOfLines={1} style={styles.dim}>{c.body}</Text> : null}
              {c.ctaText ? <Text variant="caption" weight="bold" color={fg} style={styles.cta}>{c.ctaText} →</Text> : null}
            </View>
            {/* Sponsored, said plainly. */}
            <Text variant="caption" weight="bold" color={fg} style={styles.adLabel}>AD</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingRight: spacing.base },
  ad: { width: 256, height: 112, overflow: 'hidden', borderRadius: radius.large },
  bg: { opacity: 0.2 },
  body: { flex: 1, justifyContent: 'space-between', padding: spacing.base },
  badge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 4, backgroundColor: 'rgba(255,255,255,0.25)' },
  dim: { opacity: 0.75 },
  cta: { marginTop: 'auto' },
  adLabel: { position: 'absolute', top: 8, right: 8, fontSize: 9, letterSpacing: 1.5, opacity: 0.5 },
});
