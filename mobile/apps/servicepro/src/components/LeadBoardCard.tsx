/**
 * A partner's team lead (the website's LeadBoardCard): jobs nobody is on yet,
 * given to someone in the group in one tap, and who in the group is on what.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Crown } from 'lucide-react-native';
import { useAssignJobTechnicianMutation, useTeamBoardQuery } from '@zappy/core/api';
import { leadView } from '@zappy/core/shared/partnerBoard';
import { Chip, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { providerPath } from '@zappy/ui/provider/paths';
import { accent, colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function LeadBoardCard() {
  const router = useRouter();
  const { data } = useTeamBoardQuery(undefined, { pollingInterval: 30000 });
  const [assign, { isLoading }] = useAssignJobTechnicianMutation();
  if (!data) return null;
  const { waiting, people } = leadView(data);
  const give = (jobId: string, workerId: string) => assign({ id: jobId, workerId }).unwrap()
    .then((r: { workerName?: string }) => toast.success(`${r.workerName || 'They'} have the job`))
    .catch((e: unknown) => toast.error(errText(e, 'Could not give the job')));

  return (
    <View style={styles.card}>
      <View style={styles.title}><Crown size={14} color={accent[600]} /><Text variant="bodySmall" weight="black">Your group</Text></View>
      {waiting.length ? <Text variant="caption" weight="bold" color={ink[500]}>Waiting for someone ({waiting.length})</Text> : null}
      {waiting.map((j) => (
        <View key={j.id} style={styles.waiting}>
          <Text variant="bodySmall" weight="semibold" numberOfLines={1}>{j.title}</Text>
          {j.where ? <Text variant="caption" color={ink[500]} numberOfLines={1}>{j.where}</Text> : null}
          <View style={styles.chips}>
            {people.map((p) => <Chip key={p.id} label={`${p.lead ? 'Me' : p.name}${p.isOnline ? '' : ' (off)'}`} onPress={() => !isLoading && give(j.id, p.id)} />)}
          </View>
        </View>
      ))}
      {people.map((p) => (
        <View key={p.id} style={styles.person}>
          <View style={[styles.dot, { backgroundColor: p.isOnline ? success[500] : slate[300] }]} />
          <Text variant="bodySmall" weight="semibold" numberOfLines={1} style={styles.flex}>{p.lead ? `${p.name} (you)` : p.name}</Text>
          {p.jobs.length ? p.jobs.map((j) => (
            <Pressable key={j.id} onPress={() => router.push(providerPath(`/worker/${j.kind}/${j.id}`) as never)} accessibilityRole="link">
              <Text variant="caption" weight="bold" color={zappy[700]} numberOfLines={1}>{j.title}</Text>
            </Pressable>
          )) : <Text variant="caption" color={ink[500]}>Free</Text>}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: accent[100], backgroundColor: colors.surface },
  title: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  waiting: { gap: 4, padding: spacing.md, borderRadius: radius.medium, backgroundColor: accent[50] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 4 },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  flex: { flex: 1, minWidth: 0 },
});
