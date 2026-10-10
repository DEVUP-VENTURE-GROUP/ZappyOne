/**
 * Work — everything a provider holds, and everything open near them that
 * they're verified to take, across every kind of job (the websites'
 * WorkBoardPage). What pays and how far is on the card before they commit;
 * money a helper would have to front is called out separately.
 */
import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, ShieldCheck, Briefcase } from 'lucide-react-native';
import { useGetWorkerMeQuery } from '@zappy/core/api';
import { useProviderJobs } from '@zappy/core/shared/useProviderJobs';
import { useAppSelector } from '@zappy/core/store/hooks';
import { ScreenHeader, SkeletonList, Text } from '../../components';
import { toast } from '../../components/Toast';
import { HotZonesCard } from '../../components/worker/HotZonesCard';
import { MineRow, type MineJob } from '../../components/worker/MineRow';
import { OpenJobCard, type OpenJob } from '../../components/worker/OpenJobCard';
import { colors, ink } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { DuesCard } from '../DuesCard';

type Row = { type: 'head'; key: string; title: string } | { type: 'mine'; key: string; job: MineJob }
  | { type: 'open'; key: string; job: OpenJob } | { type: 'note'; key: string; text: string } | { type: 'verify'; key: string; kinds: string[] };

export function WorkBoardPage({ kinds }: { kinds: string[] }) {
  const router = useRouter();
  const { mine, open, notApproved, isLoading, taking, take, refetch } = useProviderJobs({ kinds });
  // A worker's own position for the surge card; a shop owner has none.
  const isWorker = useAppSelector((s) => s.auth.role) === 'worker';
  const { data: me } = useGetWorkerMeQuery(undefined, { skip: !isWorker });
  const [refreshing, setRefreshing] = useState(false);

  async function onTake(job: OpenJob) {
    try {
      const to = await take(job);
      toast.success('It’s yours');
      router.push(to as never);
    } catch (err) {
      const e = err as { data?: { code?: string; error?: string } };
      if (e?.data?.code === 'ALREADY_CLAIMED') { toast.error('Someone else took it first'); refetch(); }
      else if (e?.data?.code === 'NOT_APPROVED_FOR_SERVICE') toast.error('Get verified for this service first');
      else toast.error(e?.data?.error || 'Could not take this job');
    }
  }

  const rows: Row[] = [
    { type: 'head', key: 'h-mine', title: `Your jobs${mine.length ? ` · ${mine.length}` : ''}` },
    ...(mine.length ? mine.map((j: MineJob) => ({ type: 'mine' as const, key: `m-${j.kind}-${j.id}`, job: j })) : [{ type: 'note' as const, key: 'n-mine', text: 'Nothing in hand right now.' }]),
    { type: 'head', key: 'h-open', title: `Open near you${open.length ? ` · ${open.length}` : ''}` },
    ...open.map((j: OpenJob) => ({ type: 'open' as const, key: `o-${j.kind}-${j.id}`, job: j })),
    ...(!open.length && !notApproved.length ? [{ type: 'note' as const, key: 'n-open', text: 'No open jobs near you. New ones appear here, and you’ll get an alert.' }] : []),
    ...(notApproved.length ? [{ type: 'verify' as const, key: 'v', kinds: notApproved }] : []),
  ];

  return (
    <View style={styles.page}>
      <ScreenHeader title="Work" safeArea />
      {isLoading ? (
        <View style={styles.pad}><SkeletonList count={4} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
          ListHeaderComponent={
            <View style={styles.headerCards}>
              <DuesCard compact />
              {isWorker ? <HotZonesCard coords={me?.worker?.currentLocation?.coordinates} /> : null}
            </View>
          }
          renderItem={({ item }) => {
            switch (item.type) {
              case 'head': return <Text variant="bodySmall" weight="semibold" color={ink[700]} style={styles.head}>{item.title}</Text>;
              case 'mine': return <MineRow job={item.job} onPress={() => router.push(item.job.to as never)} />;
              case 'open': return <OpenJobCard job={item.job} busy={taking} onTake={() => onTake(item.job)} />;
              case 'note': return (
                <View style={styles.note}><Briefcase size={16} color={ink[400]} /><Text variant="bodySmall" color={colors.textSecondary} style={styles.flex}>{item.text}</Text></View>
              );
              case 'verify': return (
                <Pressable onPress={() => router.push('/provider/onboarding' as never)} accessibilityRole="button" style={styles.note}>
                  <ShieldCheck size={18} color={colors.primary} />
                  <Text variant="bodySmall" color={ink[700]} style={styles.flex}>
                    Get verified for {item.kinds.map((k) => (k === 'pet' ? 'pet care' : 'helping')).join(' and ')} to see open jobs there.
                  </Text>
                  <ChevronRight size={16} color={ink[400]} />
                </Pressable>
              );
              default: return null;
            }
          }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  pad: { padding: spacing.base },
  list: { padding: spacing.base, paddingBottom: spacing.xxxl },
  headerCards: { gap: spacing.base, marginBottom: spacing.base },
  head: { marginTop: spacing.md },
  sep: { height: spacing.sm },
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.base },
});
