// The website's ShopOrdersPage, one column at a time on a phone.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useShopWorkersQuery } from '@zappy/core/api';
import { BOARD_COLUMNS, bucketOf } from '@zappy/core/shared/partnerBoard';
import { formatPaise } from '@zappy/core/shared/money';
import { useProviderJobs } from '@zappy/core/shared/useProviderJobs';
import { Chip, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { StagePill } from '@zappy/ui/components/worker/DashboardUI';
import { AssignTechnician } from '@zappy/ui/provider/components/AssignTechnician';
import { providerPath } from '@zappy/ui/provider/paths';
import { colors, danger, ink, accent } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

interface Job { kind: string; id: string; to: string; title: string; subtitle?: string; status: string; attention?: boolean; late?: boolean; workerId?: string | null; rawStatus?: string; valuePaise?: number }
interface Member { _id: string; name?: string; phone?: string; team?: { role?: string; leadId?: string | null } }

export function ShopOrdersPage() {
  const router = useRouter();
  const { mine, isLoading } = useProviderJobs({ kinds: ['repair', 'pet'] });
  const { data } = useShopWorkersQuery(undefined);
  const [column, setColumn] = useState('new');
  const [who, setWho] = useState('');
  const workers: Member[] = data?.workers || [];
  const jobs = mine as Job[];
  const leads = workers.filter((w) => w.team?.role === 'lead');
  const nameOf = (id?: string | null) => workers.find((w) => String(w._id) === String(id))?.name;

  const shown = useMemo(() => {
    if (!who) return jobs;
    if (who.startsWith('group:')) {
      const lead = who.slice(6);
      const group = new Set([lead, ...workers.filter((w) => String(w.team?.leadId) === lead).map((w) => String(w._id))]);
      return jobs.filter((j) => group.has(String(j.workerId)));
    }
    return jobs.filter((j) => String(j.workerId) === who);
  }, [jobs, who, workers]);
  const inColumn = (key: string) => shown.filter((j) => bucketOf(j.rawStatus, j.workerId) === key);
  const busy = jobs.reduce<Record<string, number>>((m, j) => (j.workerId && bucketOf(j.rawStatus, j.workerId) !== 'done' ? { ...m, [j.workerId]: (m[j.workerId] || 0) + 1 } : m), {});

  return (
    <View style={styles.page}>
      <ScreenHeader title="Orders" safeArea onBack={() => router.back()} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {BOARD_COLUMNS.map((c) => <Chip key={c.key} label={`${c.label} ${inColumn(c.key).length}`} selected={column === c.key} onPress={() => setColumn(c.key)} />)}
      </ScrollView>
      {workers.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Whole team" selected={!who} onPress={() => setWho('')} />
          {leads.map((l) => <Chip key={`g${l._id}`} label={`${l.name || l.phone}'s group`} selected={who === `group:${l._id}`} onPress={() => setWho(`group:${l._id}`)} />)}
          {workers.map((w) => <Chip key={w._id} label={w.name || w.phone || ''} selected={who === String(w._id)} onPress={() => setWho(String(w._id))} />)}
        </ScrollView>
      ) : null}
      {isLoading ? <LoadingState /> : (
        <ScrollView contentContainerStyle={styles.body}>
          {inColumn(column).length === 0 ? <Text variant="bodySmall" color={ink[400]} style={styles.empty}>Nothing here</Text> : null}
          {inColumn(column).map((j) => (
            <View key={`${j.kind}${j.id}`} style={[styles.card, j.attention && styles.cardAttention]}>
              <Pressable onPress={() => router.push(providerPath(j.to) as never)} accessibilityRole="button" style={styles.gap}>
                <Text variant="bodySmall" weight="semibold" numberOfLines={1}>{j.title}</Text>
                {j.subtitle ? <Text variant="caption" color={ink[500]} numberOfLines={1}>{j.subtitle}</Text> : null}
                <View style={styles.row}>
                  <StagePill label={j.late ? `${j.status}, late` : j.status} attention={j.attention || j.late} />
                  {j.valuePaise ? <Text variant="caption" color={ink[500]}>{formatPaise(j.valuePaise)}</Text> : null}
                </View>
                {j.workerId ? <Text variant="caption" color={j.late ? danger[600] : ink[500]}>With {nameOf(j.workerId) || 'a member'}</Text> : null}
              </Pressable>
              {column === 'new' || column === 'assigned' ? <AssignTechnician jobId={j.id} workerId={j.workerId} busy={busy} /> : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  body: { padding: spacing.base, paddingBottom: 120, gap: spacing.sm },
  empty: { textAlign: 'center', paddingVertical: spacing.xl },
  card: { padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cardAttention: { borderColor: accent[500] },
  gap: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
