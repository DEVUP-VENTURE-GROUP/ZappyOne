/**
 * The sticky dark header on the tracking screen.
 * ----------------------------------------------------------------------------
 * Ported from `client/src/components/tracking/redesign/TrackingHeader.jsx`:
 *
 *   back · service icon · service name · order id
 *   support action
 *   status pill · ETA pill · distance pill
 *
 * Its own note — "Pricing is intentionally omitted here — it lives in
 * BookingSummary" — holds on mobile too: the price stays in the booking card
 * below rather than competing with the live status.
 *
 * ── WHAT IS NOT PORTED ─────────────────────────────────────────────────────
 * The website's share and SOS buttons. Share needs a trip-sharing link the
 * mobile app has no route for, and SOS posts to the worker SOS flow, which is
 * a worker-side capability. Rendering dead buttons to match a screenshot would
 * be worse than leaving them out; support is wired and kept.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowLeft, Clock, Headphones, Zap } from 'lucide-react-native';
import { IconButton, Text } from '../ui';
import { LiveDot } from './LiveDot';
import { shortId, statusPill } from './trackingMeta';
import { colors, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { screenPadding, spacing } from '../../theme/spacing';
import { fontFamily } from '../../theme/typography';

export interface TrackingHeaderProps {
  service: string;
  orderId: string;
  status?: string | null;
  /** Minutes, from the server's ETA event. Null renders no ETA pill. */
  eta?: number | null;
  distanceKm?: number | null;
  deviceLabel?: string | null;
  terminal?: boolean;
  onBack: () => void;
  onSupport: () => void;
}

/** `#09142C → #0B1834` — the website's header gradient, flattened. */
const HEADER_BG = '#0A1830';

function TrackingHeaderBase({
  service,
  orderId,
  status,
  eta,
  distanceKm,
  deviceLabel,
  terminal,
  onBack,
  onSupport,
}: TrackingHeaderProps) {
  const pill = statusPill(status);
  const enRoute = status === 'assigned' || status === 'on_the_way';

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <IconButton
          icon={<ArrowLeft size={19} strokeWidth={2.5} color={colors.textInverse} />}
          onPress={onBack}
          variant="plain"
          accessibilityLabel="Go back"
          style={styles.iconBtn}
        />

        <View style={styles.flex}>
          <Text variant="eyebrow" color="rgba(255,255,255,0.5)">
            Order tracking
          </Text>
          <View style={styles.titleRow}>
            <View style={styles.serviceChip}>
              <Zap size={14} color={colors.textInverse} fill={colors.textInverse} />
            </View>
            <Text style={styles.title} numberOfLines={1}>
              {service.replace(/_/g, ' ')}
            </Text>
          </View>
          <Text style={styles.orderId} numberOfLines={1}>
            Order #{shortId(orderId)}
            {deviceLabel ? ` · ${deviceLabel}` : ''}
          </Text>
        </View>

        <IconButton
          icon={<Headphones size={16} color="rgba(255,255,255,0.85)" />}
          onPress={onSupport}
          variant="plain"
          accessibilityLabel="Get help with this order"
          style={styles.iconBtn}
        />
      </View>

      {/* Status pills. Each renders only when its value genuinely exists. */}
      <View style={styles.pills}>
        <View style={[styles.pill, pill.live ? styles.pillLive : styles.pillMuted]}>
          {pill.live ? <LiveDot /> : null}
          <Text
            variant="chip"
            weight="bold"
            color={pill.live ? '#5AE39A' : 'rgba(255,255,255,0.7)'}
          >
            {pill.label}
          </Text>
        </View>

        {!terminal && eta != null && enRoute ? (
          <View style={[styles.pill, styles.pillEta]}>
            <Clock size={12} strokeWidth={2.5} color="#9FC0FF" />
            <Text variant="chip" weight="bold" color="#9FC0FF">
              ~{eta} min
            </Text>
          </View>
        ) : null}

        {enRoute && distanceKm != null ? (
          <View style={[styles.pill, styles.pillMuted]}>
            <Text variant="chip" weight="bold" color="rgba(255,255,255,0.86)">
              {Number(distanceKm).toFixed(1)} km away
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export const TrackingHeader = memo(TrackingHeaderBase);

const styles = StyleSheet.create({
  root: {
    backgroundColor: HEADER_BG,
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.md,
  },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },

  // `w-10 h-10 rounded-[14px] bg-white/10`
  iconBtn: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: radius.button },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxs,
  },
  // `w-[26px] h-[26px] rounded-[9px]` on the blue gradient.
  serviceChip: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: zappy[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  // `text-[17px] font-extrabold tracking-[-.02em]`, capitalised.
  title: {
    flex: 1,
    fontFamily: fontFamily.extrabold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.34,
    color: colors.textInverse,
    textTransform: 'capitalize',
  },
  orderId: {
    marginTop: 3,
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.45)',
  },

  // `h-[29px] px-2.5 rounded-[11px]`
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2, marginTop: spacing.md },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    height: 29,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: 11,
  },
  pillLive: { backgroundColor: 'rgba(18,161,80,0.16)' },
  pillMuted: { backgroundColor: 'rgba(255,255,255,0.09)' },
  pillEta: { backgroundColor: 'rgba(37,99,235,0.20)' },
});
