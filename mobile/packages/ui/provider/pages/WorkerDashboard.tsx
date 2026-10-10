/**
 * Provider home — the app's version of the websites' WorkerDashboard.
 *
 *   online switch → what's in your hands → open work near you → today's
 *   numbers → the week → your services
 *
 * Online is the master switch: while on, the app shares location (WorkerFrame)
 * and new work rings; while off, nothing does. Work of every kind comes from
 * the shared useProviderJobs, so this screen never branches on job kind.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Bell,
  BadgeIndianRupee,
  Briefcase,
  Clock,
  Menu,
  ShieldCheck,
  Star,
  TrendingDown,
  TrendingUp,
  Radio,
  MapPin,
} from 'lucide-react-native';
import {
  useAccountMeQuery,
  useGetWorkerMeQuery,
  useGoOnlineMutation,
  useGoOfflineMutation,
  useGetEarningsQuery,
  useGetKycStatusQuery,
  useListNotificationsQuery,
  useProviderOnboardingStatusQuery,
} from '@zappy/core/api';
import { getBestPosition } from '@zappy/core/hooks/useBestPosition';
import { useSocketEvent } from '@zappy/core/hooks/useSocketEvent';
import { formatPaise } from '@zappy/core/shared/money';
import { useProviderJobs } from '@zappy/core/shared/useProviderJobs';
import { last7, weekDeltaPct, hm, ratingLabel, kycBannerText } from '@zappy/core/shared/workerHome';
import { Avatar, Text } from '../../components';
import { toast } from '../../components/Toast';
import { ProviderServicesCard } from '../../components/provider/ProviderServicesCard';
import { Panel, LinkButton, StatTile, NoticeRow, inr } from '../../components/worker/DashboardUI';
import { HotZonesCard } from '../../components/worker/HotZonesCard';
import { MineRow } from '../../components/worker/MineRow';
import { MyAreaChip } from '../../components/worker/MyAreaChip';
import { OnlineSwitch } from '../../components/worker/OnlineSwitch';
import { WeekChart } from '../../components/worker/WeekChart';
import type { ApiErr } from '../../lib/feedback';
import { describeCoordinates } from '../../location/geocode';
import { colors, ink, success, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { DuesCard } from '../DuesCard';
import { WorkerMenuSheet } from '../WorkerMenuSheet';
import { WorkerOnboarding } from './WorkerOnboarding';
import { errText } from '../../lib/feedback';

const KINDS = ['repair', 'pet', 'helping'];

function NotifBell({ onPress }: { onPress: () => void }) {
  const { data, refetch } = useListNotificationsQuery({ page: 1, unreadOnly: true }, { pollingInterval: 60000 });
  useSocketEvent('notification', () => { refetch(); });
  const count = data?.unread ?? 0;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Notifications${count ? `, ${count} unread` : ''}`} style={styles.iconBtn} hitSlop={6}>
      <Bell size={19} color={ink[700]} strokeWidth={2.2} />
      {count > 0 ? <View style={styles.dot}><Text variant="caption" weight="bold" color="#fff" style={styles.dotText}>{count > 99 ? '99+' : count}</Text></View> : null}
    </Pressable>
  );
}

export function WorkerDashboard({ kinds = KINDS }: { kinds?: string[] }) {
  const router = useRouter();
  const go = (to: string) => router.push(to as never);
  const insets = useSafeAreaInsets();

  const { data: meData, refetch: refetchMe } = useGetWorkerMeQuery(undefined, { pollingInterval: 60000 });
  const { data: todayData, refetch: refetchToday } = useGetEarningsQuery('today');
  const { data: weekData, refetch: refetchWeek } = useGetEarningsQuery('week');
  const { data: kycData, refetch: refetchKyc } = useGetKycStatusQuery(undefined);
  const { data: providerStatus } = useProviderOnboardingStatusQuery();
  const { data: account } = useAccountMeQuery();
  const { mine, open, notApproved, refetch: refetchJobs } = useProviderJobs({ kinds });
  const [goOnline] = useGoOnlineMutation();
  const [goOffline] = useGoOfflineMutation();

  const [areaName, setAreaName] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [onlineSec, setOnlineSec] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const onlineStart = useRef<number | null>(null);

  const me = meData?.worker;
  const isOnline: boolean = me?.isOnline ?? false;
  const kycStatus: string | undefined = kycData?.kyc?.status;
  const kycApproved = kycStatus === 'approved';
  // Service verification collects the same documents; don't ask twice while it's in flight.
  const verificationInFlight = (providerStatus?.enrolments || []).some((e: { status: string }) => ['pending_review', 'approved'].includes(e.status));
  const lastCoords: number[] | undefined = me?.currentLocation?.coordinates;

  // Online clock, from the server's stamp so it survives a restart.
  useEffect(() => {
    if (!isOnline) { onlineStart.current = null; setOnlineSec(0); return undefined; }
    const base = me?.onlineSince ? Date.parse(me.onlineSince) : (onlineStart.current ??= Date.now());
    const tick = () => setOnlineSec(Math.max(0, Math.floor((Date.now() - base) / 1000)));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [isOnline, me?.onlineSince]);

  // Verification can be revoked while online.
  useSocketEvent('kyc.rejected', (p) => {
    toast.error(p?.reason ? `Verification rejected: ${p.reason}` : 'Your verification was not approved. Please resubmit.', { duration: 8000 });
    refetchMe();
    refetchKyc();
  });

  // Opened while already online: name the area from the last known position.
  useEffect(() => {
    if (!isOnline || areaName || lastCoords?.length !== 2 || (!lastCoords[0] && !lastCoords[1])) return;
    describeCoordinates(lastCoords[1], lastCoords[0]).then((r) => { if (r) setAreaName(r.subtitle ? `${r.title}, ${r.subtitle.split(',')[0]}` : r.title); });
  }, [isOnline, areaName, lastCoords?.[0], lastCoords?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  // First sign-in: name and emergency contact, before anything else.
  if (meData && !me?.onboardingComplete) return <WorkerOnboarding onComplete={refetchMe} />;

  async function toggleOnline() {
    if (!kycApproved) { toast.error('Get verified for a service before going online'); go('/provider/onboarding'); return; }
    setToggling(true);
    try {
      if (isOnline) {
        await goOffline(undefined).unwrap();
        setAreaName(null);
        toast.success('You are offline. No new work will ring.');
      } else {
        const pos = await getBestPosition();
        // The server refuses worse than 500 m; 100–500 m works, with a tip.
        if (pos.accuracy != null && pos.accuracy > 100 && pos.accuracy <= 500) {
          toast('Your location is a little rough. Step near a window or outdoors for a sharper fix.', { duration: 5000 });
        }
        await goOnline({ lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy ?? null }).unwrap();
        toast.success('You are online. New work near you will ring.');
        describeCoordinates(pos.lat, pos.lng).then((r) => { if (r) setAreaName(r.subtitle ? `${r.title}, ${r.subtitle.split(',')[0]}` : r.title); });
      }
      refetchMe();
    } catch (err) {
      const e = err as ApiErr;
      if (e?.data?.code === 'ON_TRIP') {
        toast.error(errText(e, 'Finish your current job first'));
        if (e.data.job?.link) go(e.data.job.link);
      } else {
        toast.error(errText(e, 'Could not change your status'));
      }
    } finally {
      setToggling(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.allSettled([refetchMe(), refetchToday(), refetchWeek(), refetchKyc(), refetchJobs()]);
    setRefreshing(false);
  }

  const firstName = (me?.name || 'there').trim().split(/\s+/)[0];
  const week = last7(weekData?.dailyBreakdown);
  const deltaPct = weekDeltaPct(weekData?.dailyBreakdown);
  const up = deltaPct >= 0;

  return (
    <View style={styles.page}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => setMenuOpen(true)} accessibilityRole="button" accessibilityLabel="Open menu" style={styles.iconBtn} hitSlop={6}>
          <Menu size={20} color={ink[700]} />
        </Pressable>
        <View style={styles.flex}>
          <Text variant="heading3" weight="bold" numberOfLines={1}>Hello, {firstName}</Text>
          {isOnline ? <MyAreaChip label={areaName} coordinates={lastCoords} live /> : null}
        </View>
        <NotifBell onPress={() => go('/worker/notifications')} />
        <Pressable onPress={() => go('/worker/profile')} accessibilityRole="button" accessibilityLabel="Profile">
          <Avatar uri={account?.photoUrl || null} name={me?.name} size={36} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* The master switch, first and largest. */}
        <View style={[styles.hero, isOnline ? styles.heroOn : null]}>
          <View style={styles.flex}>
            <Text variant="heading2" weight="black">{isOnline ? 'You’re online' : 'You’re offline'}</Text>
            <Text variant="bodySmall" color={colors.textSecondary}>{isOnline ? 'New jobs will ring in.' : 'Go online to get more jobs'}</Text>
          </View>
          <OnlineSwitch isOnline={isOnline} busy={toggling} onToggle={toggleOnline} />
        </View>

        {kycData && !kycApproved && !verificationInFlight ? (
          <NoticeRow
            tone={kycStatus === 'rejected' ? 'red' : 'amber'}
            icon={<ShieldCheck size={18} color={kycStatus === 'rejected' ? danger[600] : '#D97706'} />}
            title={kycBannerText(kycStatus)}
            body="You verify once. Your ID is reused for every service you add."
            onPress={() => go('/provider/onboarding')}
          />
        ) : null}

        <DuesCard />
        {isOnline ? <HotZonesCard coords={lastCoords} /> : null}

        <View style={styles.grid}>
          <StatTile Icon={BadgeIndianRupee} tone="green" label="Today" value={inr(todayData?.earningsRupees ?? 0)} sub="Earnings" onPress={() => go('/worker/earnings')} />
          <StatTile Icon={Briefcase} tone="blue" label="Jobs today" value={todayData?.jobs ?? 0} sub="Completed" onPress={() => go('/worker/work')} />
        </View>
        <View style={styles.grid}>
          <StatTile Icon={Clock} tone="slate" label="Online" value={isOnline ? hm(onlineSec) : 'Off'} sub={isOnline ? 'This session' : 'Go online'} />
          <StatTile Icon={Star} tone="amber" label="Rating" value={ratingLabel(me)} sub={`${me?.completedJobs ?? 0} job${(me?.completedJobs ?? 0) === 1 ? '' : 's'}`} onPress={() => go('/worker/reviews')} />
        </View>

        <Panel title="In your hands" action={<LinkButton label="All work" onPress={() => go('/worker/work')} />}>
          {mine.length ? (
            <View style={styles.list}>
              {mine.slice(0, 3).map((j: { kind: string; id: string; to: string; title: string; subtitle?: string; status: string; attention?: boolean }) => (
                <MineRow key={`${j.kind}-${j.id}`} job={j} compact onPress={() => go(j.to)} />
              ))}
              {mine.length > 3 ? <Text variant="caption" color={colors.textSecondary}>and {mine.length - 3} more on your Work page</Text> : null}
            </View>
          ) : (
            <Text variant="bodySmall" color={colors.textSecondary}>Nothing in hand. {isOnline ? 'New work will ring when it comes in.' : 'Go online to start getting work.'}</Text>
          )}
        </Panel>

        <Panel title={`Open near you${open.length ? ` · ${open.length}` : ''}`} action={open.length > 0 ? <LinkButton label="See all" onPress={() => go('/worker/work')} /> : undefined}>
          {!isOnline ? (
            <Pressable onPress={toggleOnline} disabled={toggling} accessibilityRole="button" style={styles.goOnline}>
              <Radio size={18} color={colors.primary} />
              <Text variant="bodySmall" weight="medium" style={styles.flex}>Go online to see and take open work near you</Text>
            </Pressable>
          ) : open.length ? (
            <View style={styles.list}>
              {open.slice(0, 2).map((j: { kind: string; id: string; service: string; title: string; km?: number | null; where?: string; earningPaise: number }) => (
                <Pressable key={`${j.kind}-${j.id}`} onPress={() => go('/worker/work')} accessibilityRole="button" style={styles.openRow}>
                  <View style={styles.flex}>
                    <Text variant="bodySmall" weight="semibold" numberOfLines={1} style={styles.capitalize}>{j.service} · {j.title}</Text>
                    <View style={styles.inline}>
                      <MapPin size={12} color={ink[400]} />
                      <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>{[j.km != null ? `${j.km} km` : null, j.where].filter(Boolean).join(' · ')}</Text>
                    </View>
                  </View>
                  <Text variant="body" weight="bold" color={success[700]}>{formatPaise(j.earningPaise)}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text variant="bodySmall" color={colors.textSecondary}>{notApproved.length ? 'Get verified for more services to see open work here.' : 'No open work near you right now.'}</Text>
          )}
        </Panel>

        <ProviderServicesCard />

        <Panel title="Earnings overview" action={<LinkButton label="View details" onPress={() => go('/worker/earnings')} />}>
          <Text variant="caption" color={colors.textSecondary}>This week</Text>
          <Text variant="heading1" weight="black">{inr(weekData?.earningsRupees ?? 0)}</Text>
          <View style={styles.inline}>
            {up ? <TrendingUp size={13} color={success[600]} /> : <TrendingDown size={13} color={danger[600]} />}
            <Text variant="caption" weight="bold" color={up ? success[600] : danger[600]}>{up ? '+' : ''}{deltaPct}% from last week</Text>
          </View>
          <View style={styles.chart}>
            <WeekChart points={week.map((d: { date: string; earningsPaise: number }) => ({
              label: new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short' }), value: Math.round(d.earningsPaise / 100),
            }))} />
          </View>
        </Panel>
      </ScrollView>

      <WorkerMenuSheet visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  capitalize: { textTransform: 'capitalize' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  dot: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: danger[500], alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  dotText: { fontSize: 10, lineHeight: 12 },
  body: { padding: spacing.base, gap: spacing.base, paddingBottom: spacing.xxxl },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.base },
  heroOn: { borderColor: success[100], backgroundColor: success[50] },
  grid: { flexDirection: 'row', gap: spacing.md },
  list: { gap: spacing.sm },
  goOnline: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.primaryTint, borderRadius: radius.button, padding: spacing.md, minHeight: 52 },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.button, padding: spacing.md, minHeight: 56 },
  chart: { marginTop: spacing.md },
});
