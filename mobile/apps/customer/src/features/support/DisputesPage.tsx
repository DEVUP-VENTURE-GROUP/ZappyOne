/** My disputes (the website's DisputesPage): every case raised, where it stands, and a way to raise a new one. */
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock, MessageCircle, Plus, Scale } from 'lucide-react-native';
import { useGetMyDisputesQuery } from '@zappy/core/api';
import { Button, EmptyState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { DISPUTE_STATUS } from './disputeMeta';
import { NewDisputeSheet } from './NewDisputeSheet';
import { StatusBadge } from './StatusBadge';

interface Dispute { _id: string; category?: string; description?: string; status: string; createdAt: string; messages?: unknown[] }

export function DisputesPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading, isFetching, refetch } = useGetMyDisputesQuery(undefined);
  const [showNew, setShowNew] = useState(false);
  const disputes: Dispute[] = data?.disputes || [];
  const open = (id: string) => router.push(`/disputes/${id}` as never);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile' as never));

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('dispute.title', 'My Disputes')} onBack={back} right={<Button label={t('common.new', 'New')} size="small" icon={<Plus size={13} color="#fff" />} onPress={() => setShowNew(true)} />} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={zappy[500]} />}>
        {isLoading ? <LoadingState /> : !disputes.length ? (
          <EmptyState icon={<Scale size={24} color={slate[400]} />} title={t('dispute.none', 'No disputes raised')} message={t('dispute.noneHint', 'Had an issue? Raise a dispute and our team will help.')}
            actionLabel={t('dispute.new', 'Raise a Dispute')} onAction={() => setShowNew(true)} />
        ) : disputes.map((d) => (
          <Pressable key={d._id} onPress={() => open(d._id)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.card}>
            <View style={styles.top}>
              <View style={styles.flex}>
                <Text variant="bodySmall" weight="bold" style={styles.cap}>{d.category?.replace(/_/g, ' ')}</Text>
                {d.description ? <Text variant="caption" color={ink[500]} numberOfLines={2}>{d.description}</Text> : null}
              </View>
              <StatusBadge status={d.status} meta={DISPUTE_STATUS} />
            </View>
            <View style={styles.meta}>
              <View style={styles.inline}><Clock size={10} color={ink[400]} /><Text variant="caption" color={ink[400]}>{new Date(d.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text></View>
              {d.messages?.length ? <View style={styles.inline}><MessageCircle size={10} color={ink[400]} /><Text variant="caption" color={ink[400]}>{d.messages.length} {t('support.messages', 'messages')}</Text></View> : null}
              <Text variant="caption" weight="bold" color={zappy[600]} style={styles.view}>{t('support.view', 'View')} →</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <NewDisputeSheet visible={showNew} onClose={() => setShowNew(false)} onCreated={(id) => { setShowNew(false); refetch(); open(id); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base },
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
  cap: { textTransform: 'capitalize' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  view: { marginLeft: 'auto' },
});
