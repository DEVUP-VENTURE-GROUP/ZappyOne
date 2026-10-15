/**
 * Still finding someone after a minute (the website's JobBoostCard): the
 * customer may add a little for a faster match, paid with the booking. A
 * partner pro who takes the job gets all of it; with ZappyOne's own salaried
 * staff it is ZappyOne's. Amounts come from Admin → Economics.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Zap } from 'lucide-react-native';
import { useBoostJobMutation } from '@zappy/core/api';
import { Button, Chip, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { accent, colors, ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const AFTER_SEC = 60;
const rupees = (p: number) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;

export interface BoostOptions { available?: boolean; currentPaise?: number; options: number[] }

export function JobBoostCard({ jobId, boost, since, noun, onBoosted }: { jobId: string; boost?: BoostOptions; since?: string; noun: string; onBoosted: () => void }) {
  const [boostJob, { isLoading }] = useBoostJobMutation();
  const [picked, setPicked] = useState<number | null>(null);
  const opensAt = (since ? new Date(since).getTime() : 0) + AFTER_SEC * 1000;
  const [open, setOpen] = useState(() => Date.now() >= opensAt);

  useEffect(() => {
    if (open) return undefined;
    const t = setTimeout(() => setOpen(true), Math.max(1000, opensAt - Date.now()));
    return () => clearTimeout(t);
  }, [open, opensAt]);

  if (!boost?.available || (!boost.currentPaise && !open)) return null;

  async function confirm() {
    try { const r = await boostJob({ id: jobId, amountPaise: (picked || 0) * 100 }).unwrap(); toast.success(r.message); setPicked(null); onBoosted(); }
    catch (err) { toast.error(errText(err, 'Could not add that. Try again.')); }
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}><Zap size={18} color={accent[600]} /></View>
        <View style={styles.flex}>
          <Text variant="bodySmall" weight="semibold">{boost.currentPaise ? `You added ${rupees(boost.currentPaise)}` : `Taking a little longer to find a ${noun}`}</Text>
          <Text variant="caption" color={ink[500]}>Add a little extra and we will tell everyone nearby again. It helps us find someone faster, and you pay it with the booking.</Text>
        </View>
      </View>
      {boost.options.length ? <View style={styles.chips}>{boost.options.map((r) => <Chip key={r} label={`+₹${r}`} selected={picked === r} onPress={() => setPicked(r)} />)}</View> : null}
      {picked ? (
        <View style={styles.confirm}>
          <Text variant="caption" color={ink[700]} style={styles.flex}>Add ₹{picked} to this booking?</Text>
          <Button label="No" size="small" variant="ghost" onPress={() => setPicked(null)} />
          <Button label="Add it" size="small" loading={isLoading} onPress={confirm} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: { width: 36, height: 36, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: accent[50] },
  flex: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  confirm: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.medium, backgroundColor: slate[50] },
});
