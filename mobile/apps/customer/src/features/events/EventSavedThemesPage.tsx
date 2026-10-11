/** Themes the customer saved (the website's EventSavedThemesPage). Unsaving takes it off the list. */
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Heart } from 'lucide-react-native';
import { useGetSavedEventThemesQuery } from '@zappy/core/api';
import { EmptyState, ErrorState, ScreenHeader, Skeleton } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { ThemeCard, type Theme } from './ThemeCard';
import { useSaveTheme } from './useSaveTheme';

export function EventSavedThemesPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading, isError, refetch, isFetching } = useGetSavedEventThemesQuery(undefined);
  const save = useSaveTheme();
  const themes: Theme[] = (data?.themes || []).filter(Boolean).map((th: Theme) => ({ ...th, isSaved: true }));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/events' as never));

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('events.saved', 'Saved themes')} onBack={back} />
      {isError ? <ErrorState onRetry={refetch} /> : (
        <FlatList data={isLoading ? [] : themes} keyExtractor={(th) => th._id} onRefresh={refetch} refreshing={isFetching && !isLoading}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
          renderItem={({ item }) => <ThemeCard theme={item} onSave={save} />}
          ListEmptyComponent={isLoading ? <>{[0, 1].map((i) => <Skeleton key={i} height={280} borderRadius={radius.large} />)}</>
            : <EmptyState icon={<Heart size={44} color={slate[300]} />} title={t('events.noSaved', 'No saved themes yet')} message={t('events.noSavedHint', 'Tap the heart on a theme to keep it here.')} actionLabel={t('events.explore', 'Explore events')} onAction={() => router.push('/events' as never)} />} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  list: { gap: spacing.md, padding: spacing.base },
});
