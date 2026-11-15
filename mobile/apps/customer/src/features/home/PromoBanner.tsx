// One admin-managed home_banner ad (the website's PromoBanner): solid brand panel, photo on the right, no gradients.
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface HomeAd {
  _id: string;
  fullImage?: boolean;
  type?: string;
  content?: { headline?: string; body?: string; badgeText?: string; imageUrl?: string; ctaText?: string; ctaLink?: string; backgroundColor?: string; textColor?: string };
}
export type BannerVariant = 'hero' | 'campaign' | 'offer';

const HEIGHT: Record<BannerVariant, number> = { hero: 188, campaign: 164, offer: 132 };
const IMAGE_SHARE: Record<BannerVariant, string> = { hero: '46%', campaign: '44%', offer: '40%' };
const TITLE_VARIANT: Record<BannerVariant, 'heading2' | 'heading3' | 'bodyLarge'> = { hero: 'heading2', campaign: 'heading3', offer: 'bodyLarge' };
const hex = (v: string | undefined, fallback: string) => (/^#[0-9a-f]{6}$/i.test(v || '') ? (v as string) : fallback);

function Cta({ text, variant, fg }: { text: string; variant: BannerVariant; fg: string }) {
  if (variant === 'offer') {
    return <View style={styles.offerCta}><Text variant="caption" weight="bold" color={fg}>{text}</Text><ArrowRight size={13} color={fg} /></View>;
  }
  return <View style={styles.cta}><Text variant="caption" weight="semibold" color={ink[900]}>{text}</Text><ArrowRight size={15} color={ink[900]} /></View>;
}

export function PromoBanner({ ad, variant = 'hero', width, onOpen, onImageError }: {
  ad: HomeAd; variant?: BannerVariant; width?: number; onOpen?: (ad: HomeAd) => void; onImageError?: () => void;
}) {
  const c = ad.content || {};
  const [broken, setBroken] = useState(false);
  const bg = hex(c.backgroundColor, '#1F4FD8');
  const fg = hex(c.textColor, '#FFFFFF');
  const photo = c.imageUrl && !broken ? c.imageUrl : null;
  const tappable = Boolean(onOpen && c.ctaLink);
  if (ad.fullImage && c.imageUrl) {
    // Finished artwork (the bundled banners) carries its own words: the image fills the banner.
    const art = <Image source={{ uri: webAsset(c.imageUrl) || undefined }} resizeMode="cover" accessibilityLabel={c.headline}
      style={[{ height: HEIGHT[variant], borderRadius: variant === 'hero' ? 0 : radius.extraLarge, backgroundColor: '#E8EEFB' }, width ? { width } : null]} />;
    return onOpen && c.ctaLink ? <Pressable onPress={() => onOpen(ad)} accessibilityRole="button" accessibilityLabel={c.headline}>{art}</Pressable> : art;
  }
  const body = (
    <View style={[styles.box, { height: HEIGHT[variant], backgroundColor: bg, borderRadius: variant === 'hero' ? 0 : radius.extraLarge }, width ? { width } : null]}>
      {photo ? (
        <Image source={{ uri: photo }} resizeMode="cover" style={[styles.photo, { width: IMAGE_SHARE[variant] as `${number}%` }]}
          onError={() => { setBroken(true); onImageError?.(); }} />
      ) : null}
      <View style={[styles.copy, { maxWidth: photo ? '56%' : '82%' }]}>
        {c.badgeText ? <View style={[styles.badge, { backgroundColor: `${fg}26` }]}><Text variant="caption" weight="bold" color={fg}>{c.badgeText.toUpperCase()}</Text></View> : null}
        <Text variant={TITLE_VARIANT[variant]} weight="bold" color={fg} numberOfLines={2}>{c.headline}</Text>
        {c.body && variant !== 'offer' ? <Text variant="caption" color={fg} numberOfLines={1} style={styles.dim}>{c.body}</Text> : null}
        {c.ctaText && c.ctaLink ? <Cta text={c.ctaText} variant={variant} fg={fg} /> : null}
      </View>
    </View>
  );
  if (!tappable) return body;
  return (
    <Pressable onPress={() => onOpen?.(ad)} accessibilityRole="button" accessibilityLabel={[c.headline, c.ctaText].filter(Boolean).join('. ')}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', justifyContent: 'center', padding: spacing.base },
  photo: { position: 'absolute', top: 0, right: 0, bottom: 0, height: '100%' },
  copy: { gap: 4 },
  badge: { alignSelf: 'flex-start', borderRadius: radius.small, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 2 },
  dim: { opacity: 0.9 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 36, marginTop: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: '#fff' },
  offerCta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
});
