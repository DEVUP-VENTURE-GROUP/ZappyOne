/**
 * The shop's open work, every kind it takes, and who is doing each job (the
 * website's ShopJobs). A job nobody is on yet is flagged: it cannot set off
 * until someone is named.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Banknote, ChevronRight, Clock, PawPrint, UserX, Wrench } from 'lucide-react-native';
import { useProviderJobs } from '@zappy/core/shared/useProviderJobs';
import { formatPaise } from '@zappy/core/shared/money';
import { LoadingState, Text } from '@zappy/ui/components';
import { StagePill } from '@zappy/ui/components/worker/DashboardUI';
import { AssignTechnician } from '@zappy/ui/provider/components/AssignTechnician';
import { providerPath } from '@zappy/ui/provider/paths';
import { colors, accent, danger, ink, slate, success } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const KIND_ICON: Record<string, typeof Wrench> = { repair: Wrench, pet: PawPrint };

interface Job { kind: string; id: string; to: string; title: string; status: string; attention?: boolean; valuePaise?: number; cashDue?: boolean; late?: boolean; workerId?: string | null }

export function ShopJobs({ kinds = ['repair', 'pet'] }: { kinds?: string[] }) {
  const router = useRouter();
  const { mine, isLoading, refetch } = useProviderJobs({ kinds });
  const jobs = mine as Job[];

  if (isLoading) return <LoadingState />;
  if (!jobs.length) {
    return (
      <View style={styles.empty}>
        <Wrench size={20} color={slate[300]} />
        <Text variant="bodySmall" weight="bold" color={ink[700]}>No open jobs</Text>
        <Text variant="caption" color={ink[500]} style={styles.center}>Jobs appear here, and ring, the moment a customer books your shop.</Text>
      </View>
    );
  }

  // How many open jobs each technician already holds, so work goes to whoever is free.
  const busy: Record<string, number> = {};
  for (const j of jobs) if (j.workerId) busy[j.workerId] = (busy[j.workerId] || 0) + 1;

  return (
    <View style={styles.list}>
      {jobs.map((j) => {
        const Icon = KIND_ICON[j.kind] || Wrench;
        return (
          <View key={`${j.kind}:${j.id}`} style={styles.card}>
            <Pressable onPress={() => router.push(providerPath(j.to) as never)} accessibilityRole="button" style={styles.head}>
              <Icon size={16} color={ink[400]} />
              <View style={styles.flex}>
                <View style={styles.row}>
                  <Text variant="bodySmall" weight="bold" numberOfLines={1} style={styles.title}>{j.title}</Text>
                  <StagePill label={j.status} attention={j.attention} />
                </View>
                <View style={styles.meta}>
                  {j.valuePaise ? <Text variant="caption" weight="semibold">{formatPaise(j.valuePaise)}</Text> : null}
                  {j.cashDue ? <View style={styles.tag}><Banknote size={10} color={success[700]} /><Text variant="caption" weight="semibold" color={success[700]}>collect cash</Text></View> : null}
                  {j.late ? <View style={styles.tag}><Clock size={10} color={danger[600]} /><Text variant="caption" weight="semibold" color={danger[600]}>running late</Text></View> : null}
                  {!j.workerId ? <View style={styles.tag}><UserX size={10} color={accent[700]} /><Text variant="caption" weight="semibold" color={accent[700]}>nobody on it</Text></View> : null}
                </View>
              </View>
              <ChevronRight size={16} color={slate[300]} />
            </Pressable>
            <AssignTechnician jobId={j.id} workerId={j.workerId} busy={busy} onDone={refetch} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: slate[200], backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1, minWidth: 0, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flexShrink: 1, textTransform: 'capitalize' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  empty: { alignItems: 'center', gap: 4, padding: spacing.lg, borderRadius: radius.large, borderWidth: 1, borderStyle: 'dashed', borderColor: slate[200] },
  center: { textAlign: 'center' },
});
