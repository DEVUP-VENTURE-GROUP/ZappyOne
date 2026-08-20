/**
 * Home hero — the banner and the trust bar that overlaps it.
 * ----------------------------------------------------------------------------
 * The banner is a single baked image, exactly as on the web. Its headline
 * ("Your needs. Our experts. On demand."), the photographed pro, the avatar
 * cluster and "48+ Happy Customers" are all part of the artwork — nothing there
 * is live text. Rebuilding it as layered views would mean re-typesetting a
 * composition that was designed as one piece, and it would drift from the site
 * the first time either side was touched.
 *
 * The trust bar underneath IS live: four tokens, four labels, pulled up over
 * the banner's bottom edge the same way the web card is.
 *
 * The source asset is `client/public/banner1_hero.webp`, re-encoded as JPEG
 * for this app: React Native decodes WebP on Android but not on iOS without an
 * extra native dependency. JPEG rather than PNG because the artwork is a photo
 * composite with no transparency — PNG came out at 424KB, JPEG at 119KB for
 * the same image.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Clock, ShieldCheck, Tag, ThumbsUp } from 'lucide-react-native';
import { Text } from '../ui';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';

/** Same four, same order, same wording as the web `TRUST_BADGES`. */
const TRUST = [
  { Icon: ShieldCheck, label: 'Verified\nProfessionals' },
  { Icon: Tag, label: 'Upfront\nPricing' },
  { Icon: Clock, label: 'On-time\nService' },
  { Icon: ThumbsUp, label: 'Satisfaction\nGuaranteed' },
];

/** The artwork is 1200 × 498. */
const BANNER_RATIO = 1200 / 498;

function HomeHeroBase() {
  return (
    <View>
      <View style={styles.bannerFrame}>
        <Image
          source={require('../../assets/images/hero-banner.jpg')}
          style={styles.banner}
          resizeMode="cover"
          // Decorative in the strict sense — but the headline lives inside the
          // artwork, so a screen reader would otherwise miss the whole message.
          accessible
          accessibilityRole="image"
          accessibilityLabel="Your needs. Our experts. On demand. Trusted professionals at your doorstep in minutes."
        />
      </View>

      {/* Pulled up over the banner's bottom edge, as on the web. */}
      <View style={styles.trustWrap}>
        <View style={styles.trustCard}>
          {TRUST.map(({ Icon, label }, index) => (
            <View
              key={label}
              style={[styles.trustCell, index > 0 ? styles.trustDivider : null]}
            >
              <Icon size={15} strokeWidth={2} color={colors.primary} />
              <Text variant="caption" weight="semibold" style={styles.trustLabel}>
                {label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export const HomeHero = memo(HomeHeroBase);

const styles = StyleSheet.create({
  // The ratio belongs on the FRAME, not the Image. An Image with only
  // `aspectRatio` set is still free to take its intrinsic height first and the
  // 1200px-wide source then renders enormous; constraining the container and
  // letting the image fill it is what actually bounds the height.
  bannerFrame: {
    width: '100%',
    aspectRatio: BANNER_RATIO,
    borderRadius: radius.large,
    overflow: 'hidden',
    backgroundColor: colors.textHeading,
  },
  banner: { width: '100%', height: '100%' },

  // Negative margin lifts the card so it straddles the banner edge.
  trustWrap: { marginTop: -spacing.md, paddingHorizontal: spacing.md },
  trustCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.divider,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    ...shadows.softLarge,
  },
  trustCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: 2,
  },
  trustDivider: { borderLeftWidth: 1, borderLeftColor: colors.divider },
  trustLabel: { fontSize: 9, lineHeight: 12, flexShrink: 1 },
});
