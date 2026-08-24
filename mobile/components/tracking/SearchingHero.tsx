/**
 * The dark "we're looking" card that leads the searching state.
 * ----------------------------------------------------------------------------
 * Ported from `client/src/components/tracking/redesign/SearchingHero.jsx`,
 * whose own note describes the job precisely: "Sets expectations, shows we're
 * actively looking, and communicates the trust story so the pane never feels
 * empty."
 *
 * Measured from that file:
 *   card      rounded-[24px], p-[18px], linear-gradient(135deg,#0A1830,#12274C)
 *   icon      44×44 rounded-[14px], rgba(37,99,235,.22) on a blue-tinted border
 *   title     16px extrabold white, tracking -.02em
 *   live pill #5AE39A on rgba(18,161,80,.16) with a beating #34D27B dot
 *   sub       12.5px white/60
 *   scan bar  h-1.5 track rgba(255,255,255,.08), a sweeping blue third
 *   stats     three tiles, rgba(255,255,255,.06) on rgba(255,255,255,.08)
 *
 * ── STILL NOTHING INVENTED ─────────────────────────────────────────────────
 * The website's first stat reads `~{eta} min` only when an ETA exists and
 * falls back to "Nearby" otherwise. That honesty is preserved: with dispatch
 * paused there is no ETA, so it says "Nearby" rather than inventing a number.
 * The other two tiles state platform facts (workers are ID-verified, matching
 * is instant), not claims about this order.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { MapPin, ShieldCheck, Zap } from 'lucide-react-native';
import { Gradient, Text } from '../ui';
import { LiveDot } from './LiveDot';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { fontFamily } from '../../theme/typography';

export interface SearchingHeroProps {
  /** Minutes, when the server has actually sent one. */
  etaMinutes?: number | null;
}

const CARD_GRADIENT = ['#0A1830', '#12274C'] as const;

function SearchingHeroBase({ etaMinutes }: SearchingHeroProps) {
  // The sweeping bar — `zpt-scan 1.8s linear infinite` on the web.
  const sweep = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    sweep.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(sweep);
  }, [sweep, reduceMotion]);

  const sweepStyle = useAnimatedStyle(() => ({
    left: `${sweep.value * 130 - 33}%`,
  }));

  return (
    <Gradient colors={CARD_GRADIENT} borderRadius={radius.large} style={styles.card}>
      <View style={styles.body}>
        <View style={styles.head}>
          <View style={styles.iconBox}>
            <Zap size={20} color="#9FC0FF" fill="#9FC0FF" />
          </View>

          <View style={styles.flex}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Finding the best pro nearby</Text>
              <View style={styles.livePill}>
                <LiveDot size={6} />
                <Text variant="caption" weight="extrabold" color="#5AE39A">
                  Live
                </Text>
              </View>
            </View>
            <Text style={styles.subtitle}>
              Broadcasting your request to top-rated professionals in your area
            </Text>
          </View>
        </View>

        {/* Scanning bar */}
        <View style={styles.track}>
          {reduceMotion ? (
            <View style={[styles.sweep, styles.sweepStatic]} />
          ) : (
            <Animated.View style={[styles.sweep, sweepStyle]} />
          )}
        </View>

        <View style={styles.stats}>
          <MiniStat
            icon={<MapPin size={14} color="#9FC0FF" />}
            value={etaMinutes ? `~${etaMinutes} min` : 'Nearby'}
            label="Estimated match"
          />
          <MiniStat
            icon={<ShieldCheck size={14} color="#9FC0FF" />}
            value="Verified"
            label="ID + background"
          />
          <MiniStat
            icon={<Zap size={14} color="#9FC0FF" />}
            value="Instant"
            label="Sub-second match"
          />
        </View>
      </View>
    </Gradient>
  );
}

function MiniStat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.stat}>
      <View style={styles.statTop}>
        {icon}
        <Text style={styles.statValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

export const SearchingHero = memo(SearchingHeroBase);

const styles = StyleSheet.create({
  card: { borderRadius: radius.large, overflow: 'hidden' },
  body: { padding: 18 },
  flex: { flex: 1 },

  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.button,
    backgroundColor: 'rgba(37,99,235,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(159,192,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // `flex-wrap` on the web — at narrow widths the Live pill drops to its own
  // line rather than squeezing the title into an ellipsis.
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  title: {
    flexShrink: 1,
    fontFamily: fontFamily.extrabold,
    fontSize: 16,
    lineHeight: 21,
    letterSpacing: -0.32,
    color: colors.textInverse,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(18,161,80,0.16)',
    borderRadius: radius.small,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  subtitle: {
    marginTop: 2,
    fontFamily: fontFamily.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.6)',
  },

  // `h-1.5 rounded-full` track with a sweeping third.
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginTop: spacing.base,
  },
  sweep: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '33%',
    borderRadius: radius.pill,
    backgroundColor: '#2563FF',
  },
  sweepStatic: { left: '0%', width: '100%', opacity: 0.5 },

  stats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.base },
  stat: {
    flex: 1,
    borderRadius: radius.medium,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statValue: {
    fontFamily: fontFamily.extrabold,
    fontSize: 13,
    lineHeight: 17,
    color: colors.textInverse,
  },
  statLabel: {
    marginTop: spacing.xs,
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    lineHeight: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
});
