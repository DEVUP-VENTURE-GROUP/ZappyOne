/**
 * Daily and weekly earning targets with progress, and the zone benchmark
 * (the websites' WorkerGoalsPage).
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { ChevronRight, Pencil, Target, TrendingUp, Trophy, Zap } from 'lucide-react-native';
import { useGetWorkerGoalsQuery, useSetWorkerGoalMutation, useGetZoneBenchmarkQuery } from '@zappy/core/api';
import { Button, LoadingState, ScreenHeader, Text } from '../../components';
import { toast } from '../../components/Toast';
import { FieldLabel } from '../../components/common/FormField';
import { FullScreenSheet } from '../../components/common/FullScreenSheet';
import { errText } from '../../lib/feedback';
import { colors, zappy, ink, slate, success, accent } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

const rs = (paise: number) => `₹${(paise / 100).toFixed(0)}`;

function ProgressRing({ pct, color, size = 84, stroke = 7 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={slate[100]} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${(Math.min(pct, 100) / 100) * circ} ${circ}`} />
      </Svg>
      <Text variant="bodySmall" weight="black">{pct}%</Text>
    </View>
  );
}

type Goal = { period: 'daily' | 'weekly'; earnedPaise?: number; targetPaise?: number };

function GoalCard({ goal, onEdit }: { goal: Goal; onEdit: () => void }) {
  const earned = goal.earnedPaise ?? 0;
  const target = goal.targetPaise ?? 0;
  const pct = target > 0 ? Math.round((earned / target) * 100) : 0;
  const color = pct >= 100 ? success[500] : pct >= 60 ? zappy[500] : accent[500];
  return (
    <View style={[styles.card, pct >= 100 && { borderColor: success[100] }]}>
      <View style={styles.row}>
        <ProgressRing pct={pct} color={color} />
        <View style={styles.flex}>
          <View style={styles.between}>
            <View style={styles.row}>
              <Text variant="body" weight="black">{goal.period === 'daily' ? 'Daily goal' : 'Weekly goal'}</Text>
              {pct >= 100 ? <View style={[styles.tag, { backgroundColor: success[50] }]}><Trophy size={10} color={success[700]} /><Text variant="caption" weight="black" color={success[700]}>Achieved</Text></View> : null}
            </View>
            <Pressable onPress={onEdit} hitSlop={8} accessibilityLabel={`Change ${goal.period} goal`} style={styles.iconBtn}><Pencil size={13} color={ink[500]} /></Pressable>
          </View>
          <View style={[styles.row, { alignItems: 'flex-end', gap: 4 }]}>
            <Text variant="heading2" weight="black">{rs(earned)}</Text>
            <Text variant="caption" weight="bold" color={ink[400]}>/ {rs(target)}</Text>
          </View>
          <Text variant="caption" weight="bold" color={earned > target ? success[700] : ink[500]}>
            {earned > target ? `+${rs(earned - target)} over target` : `${rs(Math.max(0, target - earned))} more to go`}
          </Text>
        </View>
      </View>
      <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} /></View>
    </View>
  );
}

function SetGoalSheet({ period, currentTarget, onClose }: { period: 'daily' | 'weekly'; currentTarget?: number; onClose: () => void }) {
  const [val, setVal] = useState(currentTarget ? String(currentTarget / 100) : '');
  const [setGoal, { isLoading }] = useSetWorkerGoalMutation();
  const presets = period === 'daily' ? [500, 1000, 1500, 2000] : [5000, 10000, 20000, 30000];
  async function submit() {
    const amtPaise = Math.round(parseFloat(val) * 100);
    if (!amtPaise || amtPaise < 100) { toast.error('Set at least ₹1 as goal'); return; }
    try { await setGoal({ period, targetPaise: amtPaise }).unwrap(); toast.success(`${period === 'daily' ? 'Daily' : 'Weekly'} goal set`); onClose(); }
    catch (err) { toast.error(errText(err, 'Failed to set goal')); }
  }
  return (
    <FullScreenSheet title={`Set ${period} goal`} onClose={onClose}>
      <View style={[styles.amountBox]}>
        <Text variant="heading1" weight="black" color={val ? zappy[600] : ink[300]}>₹</Text>
        <TextInput value={val} onChangeText={(v) => setVal(v.replace(/[^\d]/g, ''))} keyboardType="number-pad" placeholder="0" placeholderTextColor={ink[300]}
          autoFocus style={styles.amountInput} accessibilityLabel="Goal amount in rupees" />
      </View>
      <FieldLabel>QUICK PRESETS</FieldLabel>
      <View style={styles.row}>
        {presets.map((p) => (
          <Pressable key={p} onPress={() => setVal(String(p))} style={[styles.preset, styles.flex]} android_ripple={{ color: 'rgba(16,24,40,0.08)' }}>
            <Text variant="bodySmall" weight="bold" color={ink[700]}>₹{p >= 1000 ? `${p / 1000}K` : p}</Text>
          </Pressable>
        ))}
      </View>
      <Button label="Save target" onPress={submit} loading={isLoading} fullWidth size="large" />
    </FullScreenSheet>
  );
}

export function WorkerGoalsPage() {
  const router = useRouter();
  const { data, isLoading } = useGetWorkerGoalsQuery();
  const { data: benchmark } = useGetZoneBenchmarkQuery();
  const [editPeriod, setEditPeriod] = useState<'daily' | 'weekly' | null>(null);
  const goals: Goal[] = data?.goals ?? [];
  const byPeriod = { daily: goals.find((g) => g.period === 'daily'), weekly: goals.find((g) => g.period === 'weekly') };

  return (
    <View style={styles.page}>
      <ScreenHeader title="Earnings goals" safeArea />
      <ScrollView contentContainerStyle={styles.body}>
        {benchmark ? (
          <View style={[styles.card, { backgroundColor: zappy[600], borderColor: zappy[600] }]}>
            <View style={styles.row}><TrendingUp size={14} color="#fff" /><Text variant="caption" weight="black" color={zappy[100]}>ZONE BENCHMARK</Text></View>
            <View style={[styles.row, { alignItems: 'flex-end' }]}>
              <Text variant="heading1" weight="black" color="#fff">Top {Math.round(100 - benchmark.percentile)}%</Text>
              <Text variant="caption" weight="bold" color={zappy[100]}>in your zone</Text>
            </View>
            <Text variant="caption" color={zappy[100]}>Avg earning: {rs(benchmark.zoneAvgPaise)} / week</Text>
            <View style={[styles.bar, { backgroundColor: zappy[800] }]}><View style={[styles.barFill, { width: `${benchmark.percentile}%`, backgroundColor: '#5EEAD4' }]} /></View>
          </View>
        ) : null}
        {isLoading ? <LoadingState /> : (['daily', 'weekly'] as const).map((p) => (
          <View key={p} style={styles.gap}>
            <FieldLabel>{p === 'daily' ? 'DAILY GOAL' : 'WEEKLY GOAL'}</FieldLabel>
            {byPeriod[p] ? <GoalCard goal={byPeriod[p]!} onEdit={() => setEditPeriod(p)} /> : (
              <Pressable onPress={() => setEditPeriod(p)} style={styles.dashed} accessibilityRole="button" android_ripple={{ color: 'rgba(16,24,40,0.06)' }}>
                <Target size={24} color={ink[300]} />
                <Text variant="body" weight="bold" color={ink[700]}>{p === 'daily' ? 'Set daily target' : 'Set weekly target'}</Text>
                <Text variant="caption" color={ink[500]}>{p === 'daily' ? 'Boost your daily motivation' : 'Plan your weekly income'}</Text>
              </Pressable>
            )}
          </View>
        ))}
        <Pressable onPress={() => router.push('/worker/earnings' as never)} style={[styles.card, styles.row, { backgroundColor: accent[50], borderColor: accent[100] }]}>
          <Zap size={18} color={accent[600]} />
          <View style={styles.flex}><Text variant="bodySmall" weight="bold" color={accent[700]}>Track your hustle</Text><Text variant="caption" color={accent[700]}>View detailed job-by-job breakdown</Text></View>
          <ChevronRight size={18} color={accent[500]} />
        </Pressable>
      </ScrollView>
      {editPeriod ? <SetGoalSheet period={editPeriod} currentTarget={byPeriod[editPeriod]?.targetPaise} onClose={() => setEditPeriod(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  gap: { gap: spacing.sm },
  body: { padding: spacing.base, gap: spacing.md, paddingBottom: 140 },
  card: { backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.sm },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: slate[100], borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  iconBtn: { width: 32, height: 32, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  bar: { height: 8, borderRadius: radius.pill, backgroundColor: slate[100], overflow: 'hidden' },
  barFill: { height: 8, borderRadius: radius.pill },
  dashed: { borderWidth: 2, borderStyle: 'dashed', borderColor: slate[200], borderRadius: radius.large, padding: spacing.xl, alignItems: 'center', gap: 4, backgroundColor: colors.surface },
  amountBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 2, borderColor: slate[100], borderRadius: radius.large, paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  amountInput: { flex: 1, fontSize: 34, fontFamily: 'Figtree-Black', color: ink[900], paddingVertical: 4 },
  preset: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, backgroundColor: slate[50] },
});
