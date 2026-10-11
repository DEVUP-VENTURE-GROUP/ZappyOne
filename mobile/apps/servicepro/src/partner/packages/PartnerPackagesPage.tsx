/** What customers can book from the partner, with one all-in price (the events website's PackagesPage). */
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Images, Plus } from 'lucide-react-native';
import { usePartnerThemesQuery } from '@zappy/core/api';
import { Button, EmptyState, ErrorState, LoadingState, ScreenHeader } from '@zappy/ui/components';
import { colors, slate } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import { usePartner } from '../usePartner';
import { VerifyFirst } from '../VerifyFirst';
import { PackageCard, type PartnerPackage } from './PackageCard';

export function PartnerPackagesPage() {
  const router = useRouter();
  const { partner, verified } = usePartner();
  const { data, isLoading, isError, refetch, isFetching } = usePartnerThemesQuery(undefined, { skip: !verified });
  const rows: PartnerPackage[] = data?.themes || [];
  const add = () => router.push('/partner/packages/new' as never);

  return (
    <View style={styles.page}>
      <ScreenHeader title="Packages" subtitle="What customers can book from you, with one all-in price." safeArea
        right={verified ? <Button label="New" size="small" icon={<Plus size={14} color="#fff" />} onPress={add} /> : undefined} />
      {!verified ? <VerifyFirst kycStatus={partner?.kyc?.status} />
        : isError ? <ErrorState onRetry={refetch} /> : isLoading ? <LoadingState /> : (
          <FlatList data={rows} keyExtractor={(t) => t._id} contentContainerStyle={styles.list} onRefresh={refetch} refreshing={isFetching}
            renderItem={({ item }) => <PackageCard pkg={item} />}
            ListEmptyComponent={<EmptyState icon={<Images size={40} color={slate[300]} />} title="No packages yet"
              message="Add your first setup with photos, price and what is included. We review it within a day." actionLabel="Add a package" onAction={add} />} />
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  list: { gap: spacing.md, padding: spacing.base, paddingBottom: spacing.xxl },
});
