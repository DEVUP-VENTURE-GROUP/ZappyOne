/**
 * My things (the website's MyAssetsPage): a tank, a phone or a vehicle saved
 * once, with where it is and when it was last serviced, for any live service.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock, MapPin, Package, Plus, Trash2 } from 'lucide-react-native';
import { useDeleteAssetMutation, useMyAssetsQuery } from '@zappy/core/api';
import { EmptyState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { AddAssetSheet } from './AddAssetSheet';
import { VERTICAL_LABEL } from './assetLabels';

interface Asset { _id: string; vertical: string; label?: string; brandName: string; modelName?: string; location?: { address?: string }; lastServicedAt?: string }

export function MyAssetsPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading } = useMyAssetsQuery(undefined);
  const [remove] = useDeleteAssetMutation();
  const [showAdd, setShowAdd] = useState(false);
  const assets: Asset[] = data?.assets || [];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile' as never));

  async function drop(id: string) {
    try { await remove(id).unwrap(); toast.success(t('pets.removed', 'Removed')); }
    catch (err) { toast.error(errText(err, t('pets.removeFailed', 'Could not remove. Try again.'))); }
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('profile.myAssets', 'My things')} onBack={back} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <Text variant="bodySmall" color={ink[500]}>{t('assets.intro', 'Save a tank, phone or vehicle once and rebook against it without typing it in again.')}</Text>
        {isLoading ? <LoadingState /> : !assets.length ? <EmptyState icon={<Package size={28} color={slate[300]} />} title={t('assets.none', 'Nothing saved yet.')} /> : assets.map((a) => {
          const name = `${a.brandName}${a.modelName ? ` · ${a.modelName}` : ''}`;
          return (
            <View key={a._id} style={styles.card}>
              <View style={styles.flex}>
                <Text variant="caption" weight="bold" color={zappy[500]}>{(VERTICAL_LABEL[a.vertical] || a.vertical).toUpperCase()}</Text>
                <Text variant="bodySmall" weight="bold">{a.label || name}</Text>
                {a.label ? <Text variant="caption" color={ink[500]}>{name}</Text> : null}
                {a.location?.address ? <View style={styles.inline}><MapPin size={11} color={ink[400]} /><Text variant="caption" color={ink[400]}>{a.location.address}</Text></View> : null}
                <View style={styles.inline}><Clock size={11} color={ink[400]} /><Text variant="caption" color={ink[400]}>{a.lastServicedAt ? `${t('assets.last', 'Last serviced')} ${new Date(a.lastServicedAt).toLocaleDateString('en-IN')}` : t('assets.never', 'No service on record yet')}</Text></View>
              </View>
              <Pressable onPress={() => drop(a._id)} accessibilityRole="button" accessibilityLabel={t('common.delete', 'Delete')} hitSlop={8} style={styles.trash}><Trash2 size={16} color={slate[300]} /></Pressable>
            </View>
          );
        })}
        <Pressable onPress={() => setShowAdd(true)} accessibilityRole="button" style={styles.add}><Plus size={16} color={ink[500]} /><Text variant="bodySmall" weight="bold" color={ink[500]}>{t('assets.new', 'Save something new')}</Text></Pressable>
      </ScrollView>
      {showAdd ? <AddAssetSheet visible onClose={() => setShowAdd(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  trash: { padding: 6 },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.base, borderRadius: radius.large, borderWidth: 2, borderStyle: 'dashed', borderColor: slate[300] },
});
