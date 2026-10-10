/**
 * A shop technician's home (the website's ShopWorkerHome). The shop assigns the
 * work and pays its staff, so there is no wallet, payout or service sign-up
 * here: just duty, today's jobs and the shop they work for. Job value is what
 * customers paid the shop.
 */
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, ClipboardList, Info, Menu, Phone, ShieldCheck, Store } from 'lucide-react-native';
import { useGetKycStatusQuery, useGetMyShopQuery, useGetWorkerMeQuery, useGoOfflineMutation, useGoOnlineMutation } from '@zappy/core/api';
import { getBestPosition } from '@zappy/core/hooks/useBestPosition';
import { formatPaise } from '@zappy/core/shared/money';
import { useProviderJobs } from '@zappy/core/shared/useProviderJobs';
import { LoadingState, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { NoticeRow, StagePill } from '@zappy/ui/components/worker/DashboardUI';
import { MyAreaChip } from '@zappy/ui/components/worker/MyAreaChip';
import { OnlineSwitch } from '@zappy/ui/components/worker/OnlineSwitch';
import { errText, type ApiErr } from '@zappy/ui/lib/feedback';
import { callNumber } from '@zappy/ui/lib/openLink';
import { WorkerMenuSheet } from '@zappy/ui/provider/WorkerMenuSheet';
import { providerPath } from '@zappy/ui/provider/paths';
import { colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { TECHNICIAN_MENU } from '../menus';

interface Job { kind: string; id: string; to: string; title: string; subtitle?: string; status: string; attention?: boolean }

export function ShopWorkerHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const go = (to: string) => router.push(to as never);
  const { data: meData, refetch: refetchMe } = useGetWorkerMeQuery(undefined, { pollingInterval: 60000 });
  const { data: shopData, refetch: refetchShop } = useGetMyShopQuery(undefined, { pollingInterval: 120000 });
  const { data: kycData } = useGetKycStatusQuery();
  // A shop's team works what the shop takes: repairs and pet care.
  const { mine, isLoading: loadingJobs, refetch: refetchJobs } = useProviderJobs({ kinds: ['repair', 'pet'] });
  const [goOnline] = useGoOnlineMutation();
  const [goOffline] = useGoOfflineMutation();
  const [toggling, setToggling] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const me = meData?.worker;
  const onDuty = !!me?.isOnline;
  const kycStatus: string | undefined = kycData?.kyc?.status;
  const kycApproved = kycStatus === 'approved';
  // Already sent: nothing to do but wait, so they are not sent back to the form.
  const kycWaiting = kycStatus === 'pending_review';
  const shop = shopData?.shop;
  const jobs = mine as Job[];

  async function toggleDuty() {
    if (kycWaiting) { toast('Your ID is being checked. You can go on duty once it is approved.'); return; }
    if (!kycApproved) { toast.error('Verify your ID first: Aadhaar and a selfie, about 2 minutes'); go('/worker/kyc'); return; }
    setToggling(true);
    try {
      if (onDuty) {
        await goOffline().unwrap();
        toast.success('You are off duty');
      } else {
        const pos = await getBestPosition();
        // The server refuses a location worse than 500 m.
        await goOnline({ lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy ?? null }).unwrap();
        toast.success('You are on duty');
      }
      refetchMe();
    } catch (err) {
      const e = err as ApiErr;
      toast.error(e?.data ? errText(err, 'Could not change duty') : (e as Error)?.message || 'Could not change duty');
      if (e?.data?.code === 'ON_TRIP' && e.data.job?.link) go(providerPath(e.data.job.link));
    } finally { setToggling(false); }
  }

  async function onRefresh() { setRefreshing(true); await Promise.all([refetchMe(), refetchShop(), refetchJobs()]); setRefreshing(false); }

  return (
    <View style={styles.page}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => setMenuOpen(true)} accessibilityRole="button" accessibilityLabel="Menu" style={styles.iconBtn}><Menu size={18} color={ink[900]} /></Pressable>
        <View style={styles.storeIcon}><Store size={20} color={zappy[600]} /></View>
        <View style={styles.flex}>
          <Text variant="body" weight="black" numberOfLines={1}>{me?.name || 'Technician'}</Text>
          <Text variant="caption" color={ink[500]} numberOfLines={1}>{shop ? `Working for ${shop.name}` : 'Loading your shop…'}</Text>
          {onDuty ? <MyAreaChip coordinates={me?.currentLocation?.coordinates} live /> : null}
        </View>
        {shop?.phone ? (
          <Pressable onPress={() => callNumber(shop.phone)} accessibilityRole="button" accessibilityLabel="Call shop owner" style={styles.owner}>
            <Phone size={14} color={ink[700]} /><Text variant="caption" weight="bold" color={ink[700]}>Owner</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={[styles.hero, onDuty && styles.heroOn]}>
          <View style={styles.flex}>
            <Text variant="heading3" weight="black">{onDuty ? 'On duty' : 'Off duty'}</Text>
            <Text variant="caption" color={ink[500]}>{onDuty ? 'Your shop can give you jobs. Switch off to go off duty.' : 'Switch on to start receiving jobs from your shop.'}</Text>
          </View>
          <OnlineSwitch isOnline={onDuty} busy={toggling} onToggle={toggleDuty} />
        </View>

        {kycWaiting ? (
          <View style={styles.waiting}><ShieldCheck size={15} color={ink[500]} /><Text variant="caption" weight="semibold" color={ink[700]} style={styles.flex}>Your ID is being checked. We will notify you when you can go on duty.</Text></View>
        ) : null}
        {kycStatus && !kycApproved && !kycWaiting ? (
          <NoticeRow icon={<ShieldCheck size={18} color="#D97706" />} title="Verify your ID to go on duty" body="Aadhaar and a selfie, about 2 minutes" onPress={() => go('/worker/kyc')} />
        ) : null}

        <View style={styles.row}>
          {([['Today', shopData?.today], ['This week', shopData?.week]] as [string, { jobs: number; valuePaise: number } | undefined][]).map(([title, t]) => (
            <View key={title} style={styles.stat}>
              <Text variant="caption" weight="bold" color={ink[400]}>{title.toUpperCase()}</Text>
              <Text variant="heading2" weight="black">{t?.jobs ?? '–'}</Text>
              <Text variant="caption" color={ink[500]}>jobs done · {t ? formatPaise(t.valuePaise) : '–'}</Text>
            </View>
          ))}
        </View>
        <View style={styles.info}><Info size={12} color={ink[400]} /><Text variant="caption" color={ink[400]} style={styles.flex}>Job value is what customers paid your shop, not your pay. Your shop pays you directly.</Text></View>

        <View style={styles.card}>
          <View style={styles.titleRow}><ClipboardList size={15} color={zappy[600]} /><Text variant="bodySmall" weight="black">My jobs</Text></View>
          {loadingJobs ? <LoadingState /> : !jobs.length ? (
            <Text variant="bodySmall" color={ink[500]} style={styles.center}>No jobs right now. Your shop owner will assign the next one.</Text>
          ) : jobs.map((j) => (
            <Pressable key={`${j.kind}-${j.id}`} onPress={() => go(providerPath(j.to))} accessibilityRole="button" style={styles.job}>
              <View style={styles.flex}>
                <Text variant="bodySmall" weight="semibold" numberOfLines={1} style={styles.cap}>{j.title}</Text>
                {j.subtitle ? <Text variant="caption" color={ink[500]} numberOfLines={1} style={styles.cap}>{j.subtitle}</Text> : null}
              </View>
              <StagePill label={j.status} attention={j.attention} />
              <ChevronRight size={14} color={slate[300]} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <WorkerMenuSheet visible={menuOpen} onClose={() => setMenuOpen(false)} items={TECHNICIAN_MENU} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center', paddingVertical: spacing.lg },
  cap: { textTransform: 'capitalize' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  storeIcon: { width: 40, height: 40, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  owner: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.button, backgroundColor: slate[100] },
  body: { padding: spacing.base, gap: spacing.base, paddingBottom: spacing.xxxl },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  heroOn: { borderColor: success[100], backgroundColor: success[50] },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.large, backgroundColor: slate[100] },
  row: { flexDirection: 'row', gap: spacing.md },
  stat: { flex: 1, gap: 2, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  job: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.medium, borderWidth: 1, borderColor: slate[100] },
});
