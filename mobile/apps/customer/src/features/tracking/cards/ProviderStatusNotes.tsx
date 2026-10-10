/**
 * What the server says about the pro right now (the website's inline notes on
 * the tracking page): the arrival promise and whether it slipped, a pro who
 * could not make it, and "is your pro not coming?".
 */
import { StyleSheet, View } from 'react-native';
import { Clock } from 'lucide-react-native';
import { useReportProviderAbsentMutation } from '@zappy/core/api';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { accent, colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface JobOptions {
  arrival?: { arrivedAt?: string; late?: boolean; dueBy?: string; scheduled?: boolean };
  providerChangedAt?: string; providerAbsent?: { open?: boolean };
}

export function ProviderStatusNotes({ jobId, noun, options, hasProvider, live, onChanged }: { jobId: string; noun: string; options?: JobOptions; hasProvider: boolean; live: boolean; onChanged: () => void }) {
  const [reportAbsent, { isLoading }] = useReportProviderAbsentMutation();
  const arrival = options?.arrival;
  const due = arrival?.dueBy ? new Date(arrival.dueBy).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '';

  async function absent() {
    try { const r = await reportAbsent(jobId).unwrap(); toast.success(r.message); onChanged(); }
    catch (err) { toast.error(errText(err, 'Could not report that. Try again.')); }
  }

  return (
    <>
      {arrival && !arrival.arrivedAt && hasProvider && live ? (
        <View style={[styles.note, styles.row, arrival.late && styles.late]}>
          <Clock size={18} color={arrival.late ? accent[600] : zappy[600]} />
          <Text variant="caption" color={ink[700]} style={styles.flex}>
            {arrival.late ? `Running late. We have told your ${noun}; follow them live, or call them.` : `Your ${noun} is due by ${due}${arrival.scheduled ? ' (your booked time)' : ''}.`}
          </Text>
        </View>
      ) : null}
      {options?.providerChangedAt && !hasProvider ? (
        <View style={[styles.note, styles.late]}>
          <Text variant="caption" weight="semibold" color={accent[700]}>Your {noun} could not make it</Text>
          <Text variant="caption" color={accent[700]}>We are finding the next one now. If you would rather not wait, you can cancel free.</Text>
        </View>
      ) : null}
      {options?.providerAbsent?.open && hasProvider ? (
        <View style={styles.note}>
          <Text variant="caption" weight="semibold">Is your {noun} not coming?</Text>
          <Text variant="caption" color={ink[500]}>Try calling them first. If they still are not on their way, we will find someone else.</Text>
          <Button label="Find me someone else" variant="outline" size="small" loading={isLoading} onPress={absent} fullWidth />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  note: { gap: 4, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  late: { borderColor: accent[100], backgroundColor: accent[50] },
  flex: { flex: 1 },
});
