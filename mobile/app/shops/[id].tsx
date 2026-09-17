/**
 * Public shop profile — browse a verified shop and pick a service to book.
 * Mirrors client/src/pages/ShopPublicProfilePage.jsx.
 */

import React from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, ChevronLeft, ChevronRight, MapPin, ShieldCheck, Star, Store } from 'lucide-react-native';
import { Card, EmptyState, ErrorState, Heading, ScalePressable, SkeletonList, Text, IconButton } from '../../components/ui';
import { useGetShopProfileQuery } from '../../services/api/shopApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { screenPadding, spacing } from '../../theme/spacing';

const SERVICE_LABELS: Record<string, string> = {
  screen_replacement: 'Phone Screen Replacement', battery_replacement: 'Phone Battery Replacement',
  charging_issue: 'Phone Charging Issue', speaker_mic_issue: 'Phone Speaker/Mic Issue',
  camera_issue: 'Phone Camera Issue', water_damage: 'Phone Water Damage',
  data_recovery: 'Phone Data Recovery', device_not_turning_on: 'Phone Not Turning On',
  laptop_screen_issue: 'Laptop Screen Repair', laptop_motherboard_issue: 'Laptop Motherboard Repair',
  laptop_keyboard_issue: 'Laptop Keyboard Repair', laptop_ssd_upgrade: 'Laptop SSD Upgrade',
  laptop_ram_upgrade: 'Laptop RAM Upgrade', laptop_charging_issue: 'Laptop Charging Issue',
  laptop_virus_removal: 'Laptop Virus Removal', laptop_data_recovery: 'Laptop Data Recovery',
  smart_tv_repair: 'Smart TV Repair', cctv_install: 'CCTV Installation',
  router_troubleshoot: 'Router Troubleshoot', event_decorator: 'Event Decoration',
};

export default function ShopProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const shopId = String(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: shop, isLoading, error, refetch } = useGetShopProfileQuery(shopId);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.hero, { paddingTop: insets.top + spacing.sm }]}>
        {shop?.coverImageUrl ? (
          <Image source={{ uri: shop.coverImageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : null}
        <View style={styles.heroOverlay} />
        <IconButton
          icon={<ChevronLeft size={20} color={colors.textInverse} />}
          onPress={() => router.back()}
          variant="plain"
          accessibilityLabel="Go back"
          style={styles.backBtn}
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <SkeletonList count={3} />
        ) : error || !shop ? (
          <ErrorState message={getApiErrorMessage(error, 'Shop not found')} onRetry={refetch} />
        ) : (
          <>
            <Card style={styles.headerCard}>
              <View style={styles.nameRow}>
                <Heading level={3} style={styles.flex}>{shop.businessName}</Heading>
                <ShieldCheck size={18} color={colors.success} />
              </View>
              <Text variant="bodySmall" color={colors.textSecondary}>{shop.category || 'Local Repair Shop'}</Text>
              <View style={styles.statsRow}>
                {shop.rating ? (
                  <View style={styles.statPill}>
                    <Star size={13} color="#F59E0B" fill="#F59E0B" />
                    <Text variant="bodySmall" weight="bold">{shop.rating.toFixed(1)}</Text>
                    {shop.reviewCount ? <Text variant="caption" color={colors.textMuted}>({shop.reviewCount})</Text> : null}
                  </View>
                ) : null}
                {shop.completedJobs ? (
                  <Text variant="caption" color={colors.textMuted}>{shop.completedJobs} jobs completed</Text>
                ) : null}
                {shop.yearsActive ? (
                  <View style={styles.statPill}>
                    <Calendar size={12} color={colors.textMuted} />
                    <Text variant="caption" color={colors.textMuted}>{shop.yearsActive}+ yrs</Text>
                  </View>
                ) : null}
              </View>
            </Card>

            {shop.bio ? (
              <Card>
                <Text variant="bodySmall" color={colors.textSecondary}>{shop.bio}</Text>
              </Card>
            ) : null}

            {shop.address?.text ? (
              <Card>
                <View style={styles.addressRow}>
                  <MapPin size={16} color={colors.primary} />
                  <View style={styles.flex}>
                    <Text variant="bodySmall" weight="semibold">{shop.address.text}</Text>
                    {shop.address.landmark ? (
                      <Text variant="caption" color={colors.textMuted}>Near {shop.address.landmark}</Text>
                    ) : null}
                  </View>
                </View>
              </Card>
            ) : null}

            <View>
              <Text variant="caption" weight="bold" color={colors.textMuted} style={styles.sectionLabel}>
                BOOK A SERVICE AT THIS SHOP
              </Text>
              <View style={styles.serviceList}>
                {(shop.services ?? []).map((s) => (
                  <ScalePressable
                    key={s}
                    onPress={() => router.push(`/book/${s}?shopId=${shop._id}` as never)}
                    accessibilityRole="button"
                    accessibilityLabel={SERVICE_LABELS[s] ?? s}
                  >
                    <Card>
                      <View style={styles.serviceRow}>
                        <Text variant="bodySmall" weight="semibold" style={styles.flex}>
                          {SERVICE_LABELS[s] ?? s.replace(/_/g, ' ')}
                        </Text>
                        <ChevronRight size={16} color={colors.textMuted} />
                      </View>
                    </Card>
                  </ScalePressable>
                ))}
                {(!shop.services || shop.services.length === 0) ? (
                  <EmptyState title="No services listed yet" icon={<Store size={28} color={colors.textMuted} />} />
                ) : null}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hero: { height: 180, backgroundColor: colors.surfaceSecondary, justifyContent: 'flex-start' },
  heroOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,23,42,0.25)' },
  backBtn: { marginLeft: screenPadding, backgroundColor: 'rgba(255,255,255,0.2)' },
  scroll: { paddingHorizontal: screenPadding, paddingTop: spacing.md, gap: spacing.md, marginTop: -spacing.xl },
  headerCard: { gap: spacing.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs, flexWrap: 'wrap' },
  statPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  sectionLabel: { marginBottom: spacing.sm, letterSpacing: 0.4 },
  serviceList: { gap: spacing.sm },
  serviceRow: { flexDirection: 'row', alignItems: 'center' },
});
