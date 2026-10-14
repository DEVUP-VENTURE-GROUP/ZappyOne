/**
 * Auto-accept: jobs nearby become the provider's with no tap (the websites'
 * AutoAcceptCard; server jobs/fast-assign). `who` is 'workers' or 'shops'.
 * Hidden when the platform has it off or the worker is a shop's technician.
 */
import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Zap } from 'lucide-react-native';
import { useAutoAcceptQuery, useSaveAutoAcceptMutation } from '@zappy/core/api';
import { autoAcceptStatus, autoAcceptRule, AUTO_ACCEPT_KM } from '@zappy/core/shared/autoAccept';
import { Text } from '..';
import { toast } from '../Toast';
import { errText } from '../../lib/feedback';
import { accent, colors, ink, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export function AutoAcceptCard({ who = 'workers' }: { who?: 'workers' | 'shops' }) {
  const { data } = useAutoAcceptQuery(who);
  const [save, { isLoading }] = useSaveAutoAcceptMutation();
  if (!data?.available) return null;
  const a = data.autoAccept;

  async function change(body: { enabled?: boolean; maxKm?: number | null }) {
    try { await save({ who, ...body }).unwrap(); } catch (err) { toast.error(errText(err, 'Could not save. Try again.')); }
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}><Zap size={17} color={accent[600]} /></View>
        <View style={styles.flex}>
          <Text variant="bodySmall" weight="bold">Auto-accept jobs</Text>
          <Text variant="caption" color={ink[500]}>{autoAcceptStatus(data)}</Text>
        </View>
        <Switch value={!!a.enabled} disabled={isLoading || !!a.pausedUntil} onValueChange={(enabled) => change({ enabled })} accessibilityLabel="Auto-accept jobs" />
      </View>
      {a.enabled && !a.pausedUntil ? (
        <View style={styles.chips}>
          <Text variant="caption" weight="semibold" color={ink[500]}>Only within</Text>
          {AUTO_ACCEPT_KM.filter((km) => km == null || km < data.radiusKm).map((km) => {
            const on = (a.maxKm ?? null) === km;
            return (
              <Pressable key={String(km)} disabled={isLoading} onPress={() => change({ maxKm: km })} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
                <Text variant="caption" weight="semibold" color={on ? '#fff' : ink[700]}>{km == null ? `${data.radiusKm} km` : `${km} km`}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <Text variant="caption" color={ink[400]}>{autoAcceptRule(data)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  icon: { width: 36, height: 36, borderRadius: radius.medium, backgroundColor: accent[50], alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: slate[100] },
  chipOn: { backgroundColor: ink[900] },
});
