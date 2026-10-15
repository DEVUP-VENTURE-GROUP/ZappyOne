/**
 * Your schedule (the website's ScheduledBookingsPage): what is happening now,
 * the next booking with a countdown, every booking ahead by day, repeats, and
 * a way to book for later. The grouping and countdown are core/shared/schedule.
 */
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarClock, Radio, Repeat2, type LucideIcon } from 'lucide-react-native';
import { useGetEventBookingsQuery, useMyRepeatsQuery } from '@zappy/core/api';
import { buildSchedule } from '@zappy/core/shared/schedule';
import { useMyJobs } from '@zappy/core/shared/useMyJobs';
import { ScreenHeader, Skeleton, Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { MoveSheet } from './MoveSheet';
import { NextUpCard } from './NextUpCard';
import { PlanAhead } from './PlanAhead';
import { RepeatRow, type RepeatPlan } from './RepeatRow';
import { BookingRow, LiveRow } from './ScheduleRows';
import type { ScheduleItem } from './scheduleTypes';

function Section({ title, Icon, tone = ink[400], children }: { title: string; Icon?: LucideIcon; tone?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.inline}>{Icon ? <Icon size={13} color={tone} /> : null}<Text variant="caption" weight="bold" color={ink[500]} style={styles.label}>{title.toUpperCase()}</Text></View>
      {children}
    </View>
  );
}

export function ScheduledBookingsPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { active, isLoading, isFetching, refetch } = useMyJobs() as { active: unknown[]; isLoading: boolean; isFetching: boolean; refetch: () => void };
  const { data: events, isLoading: eventsLoading } = useGetEventBookingsQuery(1);
  const { data: repeatData } = useMyRepeatsQuery(undefined);
  const [moving, setMoving] = useState<ScheduleItem | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);

  const { live, ahead, next, days } = useMemo(() => buildSchedule({ active: active as never[], eventBookings: events?.bookings || [], now }) as {
    live: ScheduleItem[]; ahead: ScheduleItem[]; next: ScheduleItem | null; days: { label: string; items: ScheduleItem[] }[];
  }, [active, events, now]);
  const repeats: RepeatPlan[] = repeatData?.plans || [];
  const loading = isLoading || eventsLoading;
  const empty = !loading && !live.length && !ahead.length && !repeats.length;
  const open = (href: string) => router.push(href as never);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/orders' as never));
  const subtitle = loading || empty ? undefined
    : `${ahead.length ? `${ahead.length} ${t('schedule.ahead', 'booked ahead')}` : t('schedule.nothingAhead', 'Nothing booked ahead')}${live.length ? `, ${live.length} ${t('schedule.happening', 'happening now')}` : ''}`;

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('profile.scheduled', 'Your schedule')} subtitle={subtitle} onBack={back} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={zappy[500]} />}>
        {loading ? [0, 1, 2].map((i) => <Skeleton key={i} height={88} borderRadius={radius.large} />) : empty ? (
          <View style={styles.empty}>
            <Text variant="heading3" weight="bold" style={styles.center}>{t('schedule.clear', 'Your schedule is clear')}</Text>
            <Text variant="bodySmall" color={ink[500]} style={styles.center}>{t('schedule.clearHint', 'Book a service for a day and time that suits you. It shows up here with a countdown, and you can add it to your calendar or move it.')}</Text>
          </View>
        ) : (
          <>
            {live.length ? <Section title={t('schedule.happeningNow', 'Happening now')} Icon={Radio} tone={success[600]}>{live.map((i) => <LiveRow key={i.key} item={i} onOpen={() => open(i.href)} />)}</Section> : null}
            {next ? <Section title={t('schedule.nextUp', 'Next up')} Icon={CalendarClock}><NextUpCard item={next} now={now} onOpen={() => open(next.href)} onMove={() => setMoving(next)} /></Section> : null}
            {days.map((d) => <Section key={d.label} title={d.label}>{d.items.map((i) => <BookingRow key={i.key} item={i} onOpen={() => open(i.href)} onMove={() => setMoving(i)} />)}</Section>)}
            {repeats.length ? <Section title={t('schedule.repeats', 'Repeats')} Icon={Repeat2}>{repeats.map((p) => <RepeatRow key={p._id} plan={p} />)}</Section> : null}
          </>
        )}
        {!loading ? <PlanAhead /> : null}
      </ScrollView>
      {moving ? <MoveSheet key={moving.key} item={moving} onClose={() => setMoving(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.lg, padding: spacing.base },
  section: { gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { letterSpacing: 1 },
  empty: { gap: spacing.sm, padding: spacing.xl, borderRadius: 24, borderWidth: 1, borderColor: zappy[100], backgroundColor: zappy[50] },
  center: { textAlign: 'center' },
});
