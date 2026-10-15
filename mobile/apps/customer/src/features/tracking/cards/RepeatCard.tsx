/**
 * "Need this again?" (the website's RepeatCard): the same booking every week,
 * 2 weeks, month or 3 months. Each repeat becomes a real booking a few days
 * ahead, with the same pro asked first.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Repeat2 } from 'lucide-react-native';
import { useMyRepeatsQuery, useRepeatJobMutation } from '@zappy/core/api';
import { Button, Chip, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const EVERY: [string, string][] = [['week', 'Every week'], ['2weeks', 'Every 2 weeks'], ['month', 'Every month'], ['3months', 'Every 3 months']];

export function RepeatCard({ jobId, noun }: { jobId: string; noun: string }) {
  const router = useRouter();
  const { data } = useMyRepeatsQuery(undefined);
  const [repeat, { isLoading }] = useRepeatJobMutation();
  const [every, setEvery] = useState<string | null>(null);
  const existing = (data?.plans || []).find((p: { sourceId: string }) => String(p.sourceId) === String(jobId));

  if (existing) {
    return (
      <Pressable onPress={() => router.push('/scheduled' as never)} accessibilityRole="button" style={[styles.card, styles.row]}>
        <Repeat2 size={18} color={zappy[600]} />
        <Text variant="caption" color={ink[700]} style={styles.flex}>Repeats {existing.everyLabel}{existing.nextLabel ? `, next ${existing.nextLabel}` : ', paused'}</Text>
        <ChevronRight size={16} color={slate[300]} />
      </Pressable>
    );
  }

  async function save() {
    try { const r = await repeat({ id: jobId, every }).unwrap(); toast.success(r.message, { duration: 6000 }); }
    catch (err) { toast.error(errText(err, 'Could not set the repeat. Try again.')); }
  }

  const label = EVERY.find(([k]) => k === every)?.[1].toLowerCase();
  return (
    <View style={styles.card}>
      <View style={styles.row}><Repeat2 size={16} color={zappy[600]} /><Text variant="bodySmall" weight="semibold">Need this again?</Text></View>
      <Text variant="caption" color={ink[500]}>Repeat this {noun} on a schedule. We book each one a few days ahead, with the same pro when they are free.</Text>
      <View style={styles.chips}>{EVERY.map(([k, l]) => <Chip key={k} label={l} selected={every === k} onPress={() => setEvery(k)} />)}</View>
      {every ? <Button label={`Repeat ${label}`} size="small" loading={isLoading} onPress={save} fullWidth /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
