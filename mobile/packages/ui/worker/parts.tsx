/**
 * Building blocks for the provider apps (Rakshak, ServicePro technicians):
 * the same pieces as the websites' DashboardUI and Work page, laid out for a
 * phone. Pure views: data and actions come from the screen.
 */
import React, { memo, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { ChevronRight, MapPin, Banknote, Sparkles, Radio } from 'lucide-react-native';
import { formatPaise } from '@zappy/core/shared/money';
import { Text } from '../components';
import { describeCoordinates } from '../location/geocode';
import { colors, zappy, ink, slate, success, accent, danger } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

/** Native touch feedback. NativeWind ignores Pressable's style-as-function, so pressed styles can't be used. */
const RIPPLE = { color: 'rgba(16,24,40,0.08)' };

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

/* The master switch: the pill shows the state and flips it. */
export function OnlineSwitch({ isOnline, busy, onToggle }: { isOnline: boolean; busy?: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={busy}
      accessibilityRole="switch"
      accessibilityState={{ checked: isOnline, busy: !!busy }}
      accessibilityLabel={isOnline ? 'Online. Tap to go offline' : 'Offline. Tap to go online'}
      style={[styles.switch, isOnline ? styles.switchOn : styles.switchOff]}
    >
      {busy ? <ActivityIndicator size="small" color={isOnline ? success[600] : ink[500]} />
        : <Radio size={16} strokeWidth={2.6} color={isOnline ? success[600] : ink[400]} />}
      <Text variant="bodySmall" weight="bold" color={isOnline ? success[700] : ink[700]}>{isOnline ? 'Online' : 'Go online'}</Text>
      <View style={[styles.track, { backgroundColor: isOnline ? success[500] : slate[300] }]}>
        <View style={[styles.knob, { left: isOnline ? 18 : 2 }]} />
      </View>
    </Pressable>
  );
}

/** Area names already looked up this session, so screens don't ask again. */
const named = new Map<string, string>();

/* Where the provider is, by area name (from [lng, lat]). */
export function AreaChip({ coordinates, label, live = false }: { coordinates?: number[] | null; label?: string | null; live?: boolean }) {
  const [lng, lat] = coordinates?.length === 2 ? coordinates : [];
  const has = typeof lat === 'number' && typeof lng === 'number' && (lat || lng);
  const key = has ? `${(lat as number).toFixed(3)},${(lng as number).toFixed(3)}` : null;
  const [area, setArea] = useState<string | null>(key ? named.get(key) ?? null : null);
  useEffect(() => {
    if (label || !key) return undefined;
    if (named.has(key)) { setArea(named.get(key) as string); return undefined; }
    let gone = false;
    describeCoordinates(lat as number, lng as number).then((r) => {
      if (!r) return;
      const name = r.subtitle ? `${r.title}, ${r.subtitle.split(',')[0]}` : r.title;
      named.set(key, name);
      if (!gone) setArea(name);
    });
    return () => { gone = true; };
  }, [key, label]); // eslint-disable-line react-hooks/exhaustive-deps
  const text = label || area;
  if (!text) return null;
  return (
    <View style={[styles.chip, live ? styles.chipLive : null]}>
      <MapPin size={12} color={live ? success[600] : ink[400]} />
      <Text variant="caption" weight="semibold" color={live ? success[700] : ink[700]} numberOfLines={1} style={styles.shrink}>{text}</Text>
    </View>
  );
}

/* A job's stage, amber when it needs them now. */
export function StagePill({ label, attention }: { label: string; attention?: boolean }) {
  return (
    <View style={[styles.pill, { backgroundColor: attention ? accent[100] : slate[100] }]}>
      <Text variant="caption" weight="semibold" color={attention ? accent[700] : ink[700]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export interface MineJob { kind: string; id: string; to: string; title: string; subtitle?: string; status: string; attention?: boolean }

/* A job in hand: what, where, which stage. */
export function MineRow({ job, onPress, compact = false }: { job: MineJob; onPress: () => void; compact?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${job.title}, ${job.status}`}
      android_ripple={RIPPLE} style={[styles.mine, compact ? styles.mineCompact : styles.mineCard]}>
      <View style={styles.flex}>
        <Text variant="body" weight="semibold" numberOfLines={1} style={styles.capitalize}>{job.title}</Text>
        {job.subtitle ? <Text variant="bodySmall" color={colors.textSecondary} numberOfLines={1} style={styles.capitalize}>{job.subtitle}</Text> : null}
      </View>
      <StagePill label={job.status} attention={job.attention} />
      <ChevronRight size={16} color={ink[400]} />
    </Pressable>
  );
}

export interface OpenJob {
  kind: string; id: string; service: string; title: string; where?: string; to?: string;
  km?: number | null; earningPaise: number; boostPaise?: number; frontPaise?: number; at?: string | null;
}

const when = (at?: string | null) => (at ? new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null);

/* Open work: what it pays and how far, before they commit. */
export function OpenJobCard({ job, busy, onTake }: { job: OpenJob; busy?: boolean; onTake: () => void }) {
  const boost = (job.boostPaise ?? 0) > 0;
  return (
    <View style={[styles.open, boost ? styles.openBoost : null]}>
      {boost ? (
        <View style={styles.boostBar}>
          <Sparkles size={13} color={accent[700]} />
          <Text variant="caption" weight="extrabold" color={accent[700]}>Customer raised the offer by {formatPaise(job.boostPaise)} · all yours</Text>
        </View>
      ) : null}
      <View style={styles.openHead}>
        <View style={styles.flex}>
          <Text variant="caption" weight="semibold" color={colors.primary} style={styles.capitalize}>{job.service}</Text>
          <Text variant="body" weight="semibold" numberOfLines={1} style={styles.capitalize}>{job.title}</Text>
        </View>
        <View style={styles.right}>
          <Text variant="heading3" weight="bold" color={success[700]}>{formatPaise(job.earningPaise)}</Text>
          <Text variant="caption" color={colors.textSecondary}>you earn</Text>
          {boost ? <Text variant="caption" weight="semibold" color={accent[700]}>incl. +{formatPaise(job.boostPaise)} extra</Text> : null}
        </View>
      </View>
      {job.where ? (
        <View style={styles.rowTop}>
          <MapPin size={14} color={ink[400]} style={styles.mt2} />
          <Text variant="bodySmall" color={ink[700]} style={styles.flex}>
            {job.where}{job.to ? <Text variant="bodySmall" color={ink[400]}> → {job.to}</Text> : null}
          </Text>
        </View>
      ) : null}
      {[job.km != null ? `${job.km} km away` : null, when(job.at)].filter(Boolean).length ? (
        <Text variant="bodySmall" color={colors.textSecondary}>{[job.km != null ? `${job.km} km away` : null, when(job.at)].filter(Boolean).join(' · ')}</Text>
      ) : null}
      {(job.frontPaise ?? 0) > 0 ? (
        <View style={styles.front}>
          <Banknote size={14} color={accent[700]} />
          <Text variant="caption" weight="medium" color={accent[700]} style={styles.flex}>You pay {formatPaise(job.frontPaise)} at the shop; the customer repays against the receipt</Text>
        </View>
      ) : null}
      <Pressable onPress={onTake} disabled={busy} accessibilityRole="button" accessibilityLabel={`Take this job, ${formatPaise(job.earningPaise)}`}
        android_ripple={RIPPLE} style={[styles.take, busy && styles.dim]}>
        <Text variant="button" color={colors.textInverse}>Take this job</Text>
      </Pressable>
    </View>
  );
}

/* The week's earnings as a small line chart (whole rupees). */
export function WeekChart({ points }: { points: { label: string; value: number }[] }) {
  const W = 320; const H = 120; const padL = 34; const padR = 8; const padT = 10; const padB = 22;
  const max = Math.max(1, ...points.map((p) => p.value));
  const niceMax = max <= 1 ? 1 : Math.ceil(max / 100) * 100;
  const innerW = W - padL - padR; const innerH = H - padT - padB;
  const x = (i: number) => padL + (innerW * i) / (points.length - 1 || 1);
  const y = (v: number) => padT + innerH - (innerH * v) / niceMax;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.value)}`).join(' ');
  const ticks = [0, niceMax / 2, niceMax];
  return (
    <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} accessibilityLabel="Earnings this week">
      {ticks.map((t) => (
        <React.Fragment key={t}>
          <Line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={slate[200]} strokeWidth={1} />
          <SvgText x={0} y={y(t) + 3} fontSize={9} fill={ink[400]} fontWeight="600">
            {t >= 1000 ? `₹${(t / 1000).toFixed(1)}k` : `₹${t % 1 === 0 ? t : t.toFixed(1)}`}
          </SvgText>
        </React.Fragment>
      ))}
      <Path d={line} fill="none" stroke={zappy[600]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <React.Fragment key={p.label + i}>
          <Circle cx={x(i)} cy={y(p.value)} r={3.5} fill="#fff" stroke={zappy[600]} strokeWidth={2} />
          <SvgText x={x(i)} y={H - 6} fontSize={9} fill={ink[400]} fontWeight="600" textAnchor="middle">{p.label}</SvgText>
        </React.Fragment>
      ))}
    </Svg>
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
  shrink: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: spacing.xs },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  right: { alignItems: 'flex-end' },
  mtSm: { marginTop: spacing.sm },
  mt2: { marginTop: 2 },
  capitalize: { textTransform: 'capitalize' },
  pressed: { opacity: 0.85 },
  dim: { opacity: 0.6 },
  panel: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.base },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  stat: { flex: 1, minWidth: '45%', backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  statIcon: { width: 36, height: 36, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  switch: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 44 },
  switchOn: { backgroundColor: success[50], borderColor: success[100] },
  switchOff: { backgroundColor: colors.surface, borderColor: colors.border },
  track: { width: 36, height: 20, borderRadius: radius.pill },
  knob: { position: 'absolute', top: 2, width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', maxWidth: '100%', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 4 },
  chipLive: { borderColor: success[100], backgroundColor: success[50] },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, maxWidth: 150 },
  mine: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mineCard: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.base, paddingVertical: spacing.md, minHeight: 60 },
  mineCompact: { backgroundColor: slate[50], borderRadius: radius.button, paddingHorizontal: spacing.md, paddingVertical: spacing.md, minHeight: 56 },
  open: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.md, overflow: 'hidden' },
  openBoost: { borderColor: accent[500], borderWidth: 2 },
  boostBar: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: accent[100], marginHorizontal: -spacing.base, marginTop: -spacing.base, paddingHorizontal: spacing.base, paddingVertical: 6 },
  openHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  front: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: accent[50], borderRadius: radius.button, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  take: { backgroundColor: colors.primary, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.medium, borderWidth: 1, padding: spacing.md },
});
