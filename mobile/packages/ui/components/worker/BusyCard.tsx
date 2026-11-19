// "Busy for 1 h / 2 h / until": stay online with your jobs, but no new offers until then (the websites' BusyCard; server jobs/busy).
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Coffee } from 'lucide-react-native';
import { useMyBusyQuery, useSetBusyMutation } from '@zappy/core/api';
import { BUSY_MINUTES, busyUntilChoices, busyClock } from '@zappy/core/shared/busyTimes';
import { Button, Text } from '..';
import { toast } from '../Toast';
import { errText } from '../../lib/feedback';
import { accent, colors, ink, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export function BusyCard() {
  const { data, isLoading } = useMyBusyQuery(undefined);
  const [setBusy, { isLoading: saving }] = useSetBusyMutation();
  const [picking, setPicking] = useState(false);
  const until = data?.busyUntil ? new Date(data.busyUntil) : null;
  const busy = !!until && until.getTime() > Date.now();

  async function choose(body: { minutes?: number; until?: string; off?: boolean }) {
    try {
      const res = await setBusy(body).unwrap();
      setPicking(false);
      toast.success(res.message);
    } catch (err) { toast.error(errText(err, 'That did not go through. Try again.')); }
  }

  if (isLoading) return null;
  const Chip = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <Pressable onPress={onPress} disabled={saving} accessibilityRole="button" style={[styles.chip, saving ? styles.dim : null]}>
      <Text variant="bodySmall" weight="semibold" color={ink[700]}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={[styles.card, busy ? styles.cardBusy : null]}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: busy ? accent[100] : slate[100] }]}><Coffee size={17} color={busy ? accent[700] : ink[500]} /></View>
        <View style={styles.flex}>
          <Text variant="body" weight="bold">{busy ? `Busy until ${busyClock(until)}` : 'Need a break?'}</Text>
          <Text variant="caption" color={ink[500]}>{busy ? 'No new jobs ring in. Your current jobs stay with you.' : 'Stay online, keep your jobs, and pause new ones for a while.'}</Text>
        </View>
        {saving ? <ActivityIndicator size="small" color={slate[400]} /> : null}
      </View>
      {busy ? (
        <Button label="Take new jobs again" onPress={() => choose({ off: true })} disabled={saving} />
      ) : (
        <View style={styles.chips}>
          {BUSY_MINUTES.map((m: number) => <Chip key={m} label={`${m / 60} hour${m > 60 ? 's' : ''}`} onPress={() => choose({ minutes: m })} />)}
          <Chip label="Until…" onPress={() => setPicking((p) => !p)} />
        </View>
      )}
      {picking && !busy ? (
        <View style={styles.chips} accessibilityLabel="Busy until">
          {busyUntilChoices().map((t: Date) => <Chip key={t.getTime()} label={busyClock(t)} onPress={() => choose({ until: t.toISOString() })} />)}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.base, gap: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: slate[200], backgroundColor: colors.surface },
  cardBusy: { borderColor: accent[100], backgroundColor: accent[50] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: { width: 36, height: 36, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, borderWidth: 1, borderColor: slate[200], backgroundColor: colors.surface },
  dim: { opacity: 0.5 },
});
