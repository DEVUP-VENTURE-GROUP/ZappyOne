/**
 * The building blocks of the provider dashboard (the websites' DashboardUI):
 * panels, stat tiles, stage pills and notice rows.
 */
import React, { memo } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Text } from '..';
import { RIPPLE } from '../../lib/feedback';
import { colors, zappy, ink, slate, success, accent, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

/** "₹1,299" from whole rupees. */
export const inr = (rupees: number) => `₹${Math.round(Number(rupees) || 0).toLocaleString('en-IN')}`;

/* A card with a title and an optional action on the right. */
export function Panel({ title, action, children, style }: {
  title?: string; action?: React.ReactNode; children: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.panel, style]}>
      {(title || action) ? (
        <View style={styles.panelHead}>
          {title ? <Text variant="sectionHeading">{title}</Text> : <View />}
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/* A text button for a panel's corner ("All work"). */
export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="link">
      <Text variant="bodySmall" weight="semibold" color={colors.primary}>{label}</Text>
    </Pressable>
  );
}

const TONE = {
  blue: { bg: zappy[50], fg: zappy[600] },
  green: { bg: success[50], fg: success[600] },
  amber: { bg: accent[50], fg: accent[600] },
  slate: { bg: slate[100], fg: ink[700] },
} as const;

type Tone = keyof typeof TONE;

/* One number on the home grid. */
export const StatTile = memo(function StatTile({ Icon, tone = 'blue', label, value, sub, onPress }: {
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  tone?: Tone; label: string; value: string | number; sub?: string; onPress?: () => void;
}) {
  const t = TONE[tone];
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}`} android_ripple={RIPPLE} style={[styles.stat]}>
      <View style={[styles.statIcon, { backgroundColor: t.bg }]}><Icon size={18} color={t.fg} strokeWidth={2.3} /></View>
      <Text variant="caption" color={colors.textSecondary} style={styles.mtSm}>{label}</Text>
      <Text variant="heading2" weight="black" numberOfLines={1}>{value}</Text>
      {sub ? (
        <View style={styles.row}>
          <Text variant="caption" weight="bold" color={colors.primary}>{sub}</Text>
          {onPress ? <ChevronRight size={12} color={colors.primary} strokeWidth={3} /> : null}
        </View>
      ) : null}
    </Pressable>
  );
});

/** A job's stage, amber when it needs them now. */
export function StagePill({ label, attention }: { label: string; attention?: boolean }) {
  return (
    <View style={[styles.pill, { backgroundColor: attention ? accent[100] : slate[100] }]}>
      <Text variant="caption" weight="semibold" color={attention ? accent[700] : ink[700]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/* A soft notice row with an icon (verification, setup). */
export function NoticeRow({ tone = 'amber', icon, title, body, onPress }: {
  tone?: 'amber' | 'red' | 'blue'; icon: React.ReactNode; title: string; body?: string; onPress?: () => void;
}) {
  const bg = tone === 'red' ? danger[50] : tone === 'blue' ? zappy[50] : accent[50];
  const border = tone === 'red' ? danger[100] : tone === 'blue' ? zappy[100] : accent[100];
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      android_ripple={RIPPLE} style={[styles.notice, { backgroundColor: bg, borderColor: border }]}>
      {icon}
      <View style={styles.flex}>
        <Text variant="bodySmall" weight="semibold">{title}</Text>
        {body ? <Text variant="caption" color={colors.textSecondary}>{body}</Text> : null}
      </View>
      {onPress ? <ChevronRight size={18} color={ink[400]} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: spacing.xs },
  mtSm: { marginTop: spacing.sm },
  panel: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.base },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  stat: { flex: 1, minWidth: '45%', backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  statIcon: { width: 36, height: 36, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, maxWidth: 150 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.medium, borderWidth: 1, padding: spacing.md },
});
