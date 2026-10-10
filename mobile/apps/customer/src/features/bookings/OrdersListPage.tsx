/**
 * Activity (the website's OrdersListPage): every kind of booking from one
 * source (useMyJobs). Upcoming first, anything waiting on the customer
 * leading; then the last completed job featured and the rest of the past,
 * filterable and grouped by day. Pull down to refresh.
 */
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useMyJobs } from '@zappy/core/shared/useMyJobs';
import { Button, ErrorState, Skeleton, Text } from '@zappy/ui/components';
import { jobIcon } from '@zappy/ui/components/jobs/jobIcons';
import { useI18n } from '@zappy/ui/lib/i18n';
import { colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { dateBucket } from './activityDates';
import { CompactRow } from './CompactRow';
import { EmptyUpcoming, type Suggestion } from './EmptyUpcoming';
import { FilterChips, type PastFilter } from './FilterChips';
import { PastHero } from './PastHero';
import type { MyJob } from './types';
import { UpcomingCard } from './UpcomingCard';

const isCancelled = (j: MyJob) => j.outcome === 'cancelled' || j.outcome === 'failed';

export function OrdersListPage() {
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<PastFilter>('all');
  const { jobs, active, past, isLoading, isFetching, isError, refetch, orderPages } = useMyJobs({ page }) as {
    jobs: MyJob[]; active: MyJob[]; past: MyJob[]; isLoading: boolean; isFetching: boolean; isError: boolean; refetch: () => void; orderPages: number;
  };

  const lastCompleted = past.find((j) => j.outcome === 'completed');
  const restPast = lastCompleted ? past.filter((j) => j.id !== lastCompleted.id) : past;
  const counts = { all: restPast.length, completed: restPast.filter((j) => j.outcome === 'completed').length, cancelled: restPast.filter(isCancelled).length };
  const filtered = restPast.filter((j) => (filter === 'all' ? true : filter === 'completed' ? j.outcome === 'completed' : isCancelled(j)));
  const upcoming = useMemo(() => [...active].sort((a, b) => Number(b.needsYou) - Number(a.needsYou)), [active]);

  // One pass: day header → its rows, in order.
  const grouped = useMemo(() => {
    const map = new Map<string, MyJob[]>();
    for (const j of filtered) {
      const key = dateBucket(j.createdAt, t, lang);
      const rows = map.get(key);
      if (rows) rows.push(j); else map.set(key, [j]);
    }
    return [...map.entries()];
  }, [filtered, t, lang]);

  // The three most recent distinct things they booked.
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: Suggestion[] = [];
    for (const j of past) {
      if (!j.rebookHref || seen.has(j.rebookHref)) continue;
      seen.add(j.rebookHref);
      out.push({ href: j.rebookHref, label: j.title, labelKey: j.titleKey, Icon: jobIcon(j.iconCode) });
      if (out.length >= 3) break;
    }
    return out;
  }, [past]);

  const emptyNote = filter === 'completed' && !filtered.length && lastCompleted
    ? t('activity.featuredAbove', 'Your only completed booking is featured above.')
    : t('activity.noneYet', 'No {x} bookings yet').replace('{x}', t(`activity.filter.${filter}`, filter));

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.body, { paddingTop: insets.top + spacing.xl }]}
      refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={zappy[500]} />}>
      <View>
        <Text variant="heading1" weight="black">{t('activity.title', 'Activity')}</Text>
        <Text variant="bodySmall" color={ink[500]}>{t('activity.subtitle', "Track live bookings and revisit what you've done.")}</Text>
      </View>

      {isError ? <ErrorState onRetry={refetch} /> : isLoading ? (
        <View style={styles.section}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={96} borderRadius={radius.large} />)}</View>
      ) : (
        <>
          <View style={styles.section}>
            <Text variant="heading3" weight="bold">{t('activity.upcoming', 'Upcoming')}</Text>
            {upcoming.length ? upcoming.map((j) => <UpcomingCard key={j.id} job={j} />) : <EmptyUpcoming suggestions={jobs.length ? suggestions : []} />}
          </View>

          {past.length ? (
            <View style={styles.section}>
              <View style={styles.head}>
                <Text variant="heading3" weight="bold">{t('activity.past', 'Past')}</Text>
                <Text variant="caption" weight="semibold" color={ink[400]}>{t('activity.total', '{n} total').replace('{n}', String(past.length))}</Text>
              </View>
              {lastCompleted ? <PastHero job={lastCompleted} /> : null}
              {restPast.length ? (
                <>
                  <FilterChips filter={filter} onChange={setFilter} counts={counts} />
                  {!grouped.length ? <View style={styles.box}><Text variant="bodySmall" weight="semibold" color={ink[500]} style={styles.center}>{emptyNote}</Text></View>
                    : grouped.map(([label, rows]) => (
                      <View key={label} style={styles.group}>
                        <Text variant="caption" weight="bold" color={ink[400]}>{label.toUpperCase()}</Text>
                        <View style={[styles.box, styles.rows]}>{rows.map((j, i) => <CompactRow key={j.id} job={j} last={i === rows.length - 1} />)}</View>
                      </View>
                    ))}
                </>
              ) : null}
            </View>
          ) : null}

          {orderPages > 1 ? (
            <View style={styles.pager}>
              <Button label={t('activity.prev', 'Previous')} size="small" variant="outline" icon={<ChevronLeft size={14} color={ink[700]} />} disabled={page === 1 || isFetching} onPress={() => setPage((p) => p - 1)} />
              <Text variant="caption" weight="semibold" color={ink[400]}>{t('activity.pageOf', 'Page {p} of {n}').replace('{p}', String(page)).replace('{n}', String(orderPages))}</Text>
              <Button label={t('activity.next', 'Next')} size="small" variant="outline" disabled={page >= orderPages || isFetching} onPress={() => setPage((p) => p + 1)} />
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.xl, paddingHorizontal: spacing.lg, paddingBottom: 120 },
  section: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  group: { gap: 6 },
  box: { padding: spacing.lg, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  rows: { paddingVertical: 0 },
  center: { textAlign: 'center' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
