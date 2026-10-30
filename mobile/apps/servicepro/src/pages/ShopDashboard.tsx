/**
 * The shop owner's home (the website's ShopDashboard), built around what an
 * owner opens it to answer: can customers find me now (live pill), what needs
 * doing (jobs, unassigned first), who is free (team), what did we make (stats,
 * week), and what still blocks me (the setup band, only when real).
 */
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, Briefcase, Clock, IndianRupee, MapPin, Menu, ShieldCheck, Star, Users, Wrench, XCircle } from 'lucide-react-native';
import {
  useProviderOnboardingStatusQuery, useRepairOnboardingStatusQuery, useShopEarningsQuery, useShopKycStatusQuery, useShopMeQuery,
  useShopPriceRequestsQuery, useShopWorkersQuery, useProviderWorkspaceQuery,
} from '@zappy/core/api';
import { useProviderJobs } from '@zappy/core/shared/useProviderJobs';
import { last7, weekDeltaPct } from '@zappy/core/shared/workerHome';
import { Button, LoadingState, Text } from '@zappy/ui/components';
import { ProviderServicesCard } from '@zappy/ui/components/provider/ProviderServicesCard';
import { Panel, StatTile, inr } from '@zappy/ui/components/worker/DashboardUI';
import { EarningsOverview, weekPoints } from '@zappy/ui/components/worker/EarningsOverview';
import { WorkerMenuSheet } from '@zappy/ui/provider/WorkerMenuSheet';
import { accent, colors, danger, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { ShopJobs } from '../components/ShopJobs';
import { PartnerTermsCard } from '../components/PartnerTermsCard';
import { PartnerDuesCard } from '../components/PartnerDuesCard';
import { ShareStorefront } from '../components/ShareStorefront';
import { SetupJourney } from '../components/SetupJourney';
import { TradeToday } from '../components/TradeToday';
import { ShopHeader } from '../components/ShopHeader';
import { ZappyWordmark } from '@zappy/ui/components/ZappyLogo';
import { TeamPanel, type TeamWorker } from '../components/TeamPanel';
import { OWNER_MENU } from '../menus';
import { HeaderBell } from '../components/HeaderBell';

const KYC_META: Record<string, { label: string; bg: string; fg: string; Icon: typeof ShieldCheck }> = {
  not_submitted: { label: 'Verification pending', bg: slate[100], fg: ink[500], Icon: AlertTriangle },
  pending_review: { label: 'Under review', bg: accent[50], fg: accent[700], Icon: Clock },
  approved: { label: 'Verified', bg: success[50], fg: success[700], Icon: ShieldCheck },
  rejected: { label: 'Verification rejected', bg: danger[50], fg: danger[600], Icon: XCircle },
  suspended: { label: 'Verification suspended', bg: danger[50], fg: danger[600], Icon: XCircle },
};
/** Every kind of work a shop can be booked for. */
const SHOP_KINDS = ['repair', 'pet'];

/** One missing piece of the storefront, a tap from where it is fixed. */
function Gap({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.gap}>
      <MapPin size={10} color={accent[700]} /><Text variant="caption" weight="bold" color={accent[700]}>{label}</Text>
    </Pressable>
  );
}

export function ShopDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const go = (to: string) => router.push(to as never);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Customers near the shop asking for its price.
  const { data: priceReqs } = useShopPriceRequestsQuery(undefined, { pollingInterval: 60000 });
  const askingNow = ((priceReqs?.requests || []) as { myOffer?: unknown }[]).filter((r) => !r.myOffer).length;
  const { data, isLoading, refetch } = useShopMeQuery();
  const { data: kycData } = useShopKycStatusQuery();
  const { data: today } = useShopEarningsQuery('today');
  const { data: week } = useShopEarningsQuery('week');
  const { data: teamData } = useShopWorkersQuery();
  const { mine: jobs } = useProviderJobs({ kinds: SHOP_KINDS });
  const { data: workspace } = useProviderWorkspaceQuery(undefined);
  const { data: setup } = useRepairOnboardingStatusQuery('mobile');
  // Service verification already collected the owner's ID, shop photo and selfie: no second ask while it is in flight.
  const { data: providerStatus } = useProviderOnboardingStatusQuery();
  const verificationInFlight = ((providerStatus?.enrolments || []) as { status: string }[]).some((e) => ['pending_review', 'approved'].includes(e.status));

  if (isLoading) return <View style={styles.page}><LoadingState /></View>;

  const shop = data?.shop;
  const workers: TeamWorker[] = teamData?.workers || [];
  const kycStatus: string = kycData?.kyc?.status || shop?.kyc?.status || 'not_submitted';
  const meta = KYC_META[kycStatus] || KYC_META.not_submitted;
  const hasPin = shop?.address?.location?.coordinates?.length === 2;
  const isDiscoverable = shop?.isActive && kycStatus === 'approved' && hasPin && Array.isArray(shop?.services) && shop.services.length > 0;
  // The server's answer from India's clock; null means hours were never stated, not shut.
  const isOpen: boolean | null = shop?.openNow ?? null;
  const liveNow = isDiscoverable && isOpen !== false;
  const needsAction = (jobs as { attention?: boolean; workerId?: string | null }[]).filter((j) => j.attention || !j.workerId);
  const pendingApprovals = (setup?.pending?.skillVerifications || 0) + (setup?.pending?.priceApprovals || 0);
  const days = last7(week?.dailyBreakdown);
  const rating = shop?.rating ? Number(shop.rating).toFixed(1) : '-';

  async function onRefresh() { setRefreshing(true); await refetch(); setRefreshing(false); }

  return (
    <View style={styles.page}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => setMenuOpen(true)} accessibilityRole="button" accessibilityLabel="Menu" style={styles.iconBtn}><Menu size={18} color={ink[900]} /></Pressable>
        <ZappyWordmark size={22} />
        <View style={styles.flex} />
        <HeaderBell to="/shop/notifications" />
      </View>

      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <ShopHeader shop={shop} trade={workspace?.domains?.[0]?.name} live={!!liveNow} isOpen={isOpen}
          blocker={kycStatus !== 'approved' ? 'Documents not approved yet' : !hasPin ? 'Pin your shop address' : !shop?.services?.length ? 'Add a service' : null} />
        {askingNow > 0 ? (
          <Pressable onPress={() => go('/shop/price-requests')} accessibilityRole="button" style={styles.asking}>
            <View style={styles.flex}>
              <Text variant="bodySmall" weight="black">{askingNow} {askingNow === 1 ? 'customer is' : 'customers are'} asking for your price</Text>
              <Text variant="caption" color={ink[500]}>Reply with your price to win the job.</Text>
            </View>
            <Button label="Reply" size="small" onPress={() => go('/shop/price-requests')} />
          </Pressable>
        ) : null}

        {/* Only when something genuinely blocks the shop. */}
        {!isDiscoverable ? (
          <View style={[styles.block, kycStatus === 'rejected' || kycStatus === 'suspended' ? styles.blockRed : styles.blockAmber]}>
            <View style={[styles.blockIcon, { backgroundColor: meta.bg }]}><meta.Icon size={18} color={meta.fg} /></View>
            <View style={styles.flex}>
              <Text variant="bodySmall" weight="black">{kycStatus === 'approved' ? 'Almost there' : meta.label}</Text>
              <Text variant="caption" color={ink[500]}>
                {kycStatus === 'approved' ? 'Your documents are approved. Finish your profile so customers can find you.'
                  : kycStatus === 'pending_review' || verificationInFlight ? "We'll notify you within 24 hours."
                    : 'Submit your documents to start receiving bookings.'}
              </Text>
              {kycStatus === 'approved' ? (
                <View style={styles.gaps}>
                  {!hasPin ? <Gap label="Shop address" onPress={() => go('/shop/profile')} /> : null}
                  {!shop?.services?.length ? <Gap label="Services" onPress={() => go('/provider/onboarding')} /> : null}
                  {!shop?.hours?.length ? <Gap label="Opening hours" onPress={() => go('/shop/profile')} /> : null}
                </View>
              ) : null}
            </View>
            {(kycStatus === 'not_submitted' || kycStatus === 'rejected') && !verificationInFlight ? <Button label="Verify" size="small" onPress={() => go('/shop/kyc')} /> : null}
          </View>
        ) : null}

        <View style={styles.stats}>
          <StatTile Icon={IndianRupee} tone="green" label="Today's earnings" value={inr(today?.earningsRupees || 0)} sub="View details" onPress={() => go('/shop/earnings')} />
          <StatTile Icon={Briefcase} tone="amber" label="Today's jobs" value={today?.jobs || 0} sub="View all" onPress={() => go('/shop/earnings')} />
          <StatTile Icon={Wrench} tone="blue" label="Needs action" value={needsAction.length} sub={needsAction.length ? 'Assign now' : undefined} />
          <StatTile Icon={Users} tone="violet" label="Technicians" value={workers.length} sub="Manage team" onPress={() => go('/shop/workers')} />
          <StatTile Icon={Star} tone="cyan" label="Rating" value={rating} sub={`${shop?.reviewCount || 0} reviews`} onPress={() => go('/shop/reviews')} />
          <StatTile Icon={ShieldCheck} tone="rose" label="Awaiting approval" value={pendingApprovals} sub={pendingApprovals ? 'Skills & prices' : undefined} />
        </View>

        <SetupJourney />
        {liveNow ? <ShareStorefront /> : null}
        <TradeToday home={workspace?.home} kinds={SHOP_KINDS} />
        <PartnerTermsCard />
        <PartnerDuesCard />
        <Panel title="Jobs" action={needsAction.length ? <View style={styles.need}><Text variant="caption" weight="black" color={accent[700]}>{needsAction.length} need{needsAction.length === 1 ? 's' : ''} you</Text></View> : undefined}>
          <ShopJobs kinds={SHOP_KINDS} />
        </Panel>
        <TeamPanel workers={workers} jobs={jobs as { workerId?: string | null }[]} onManage={() => go('/shop/workers')} />
        <ProviderServicesCard />
        <EarningsOverview weekRupees={Math.round(days.reduce((s: number, d: { earningsPaise: number }) => s + d.earningsPaise, 0) / 100)}
          deltaPct={weekDeltaPct(week?.dailyBreakdown)} points={weekPoints(days)} onViewDetails={() => go('/shop/earnings')} />
        <Panel title="Performance">
          <View style={styles.stats}>
            <StatTile Icon={Briefcase} tone="blue" label="Jobs this week" value={week?.jobs ?? 0} sub={`${today?.jobs ?? 0} today`} />
            <StatTile Icon={Users} tone="violet" label="Technicians" value={workers.length} sub="On your team" />
            <StatTile Icon={Star} tone="amber" label="Rating" value={rating} sub={`${shop?.reviewCount || 0} reviews`} />
            <StatTile Icon={ShieldCheck} tone="green" label="Completed" value={shop?.completedJobs ?? 0} sub="All time" />
          </View>
        </Panel>
      </ScrollView>
      <WorkerMenuSheet visible={menuOpen} onClose={() => setMenuOpen(false)} items={OWNER_MENU} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  body: { padding: spacing.base, gap: spacing.base, paddingBottom: spacing.xxxl },
  asking: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: zappy[200], backgroundColor: zappy[50] },
  block: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1 },
  blockAmber: { borderColor: accent[100], backgroundColor: accent[50] },
  blockRed: { borderColor: danger[100], backgroundColor: danger[50] },
  blockIcon: { width: 40, height: 40, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center' },
  gaps: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  gap: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: accent[100], backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 4 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  need: { borderRadius: radius.pill, backgroundColor: accent[50], paddingHorizontal: 10, paddingVertical: 2 },
});
