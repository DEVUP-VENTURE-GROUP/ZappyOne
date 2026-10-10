/**
 * Everything under one heading: Display, Storage, Connectivity (the website's
 * CategoryProblemsPage). Choosing a symptom starts the booking with it filled
 * in; the flow still asks its questions, because "cracked screen" covers both
 * a glass swap and a whole panel.
 */
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wrench } from 'lucide-react-native';
import { useLiveCatalogQuery } from '@zappy/core/api';
import { categoryPhoto } from '@zappy/core/shared/problemArt';
import { EmptyState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { CATEGORY_ICONS } from '@zappy/ui/components/repair/categoryIcons';
import { webAsset } from '@zappy/ui/lib/media';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { ProblemLayout } from './ProblemCard';

interface Category { code: string; name: string; problems: { code: string; name: string }[] }
interface Service { code: string; artKey?: string; name: string; path: string; coverage?: Category[] }

export function CategoryProblemsPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { vertical, categoryCode } = useLocalSearchParams<{ vertical: string; categoryCode: string }>();
  const { data, isLoading } = useLiveCatalogQuery(undefined);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/services' as never));

  if (isLoading) return <LoadingState />;
  const service: Service | undefined = (data?.domains || []).flatMap((d: { services: Service[] }) => d.services).find((s: Service) => (s.artKey || s.code) === vertical);
  const category = (service?.coverage || []).find((c) => c.code === categoryCode);

  if (!service || !category) {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <ScreenHeader title="Not found" onBack={back} />
        <EmptyState title="This category isn’t available" message="It may have been renamed or taken offline." actionLabel="See all services" onAction={() => router.replace('/services' as never)} />
      </View>
    );
  }

  const Icon = CATEGORY_ICONS[category.code] || Wrench;
  const cover = webAsset(categoryPhoto(vertical, category));
  const n = category.problems.length;
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={category.name} subtitle={service.name} onBack={back} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.hero}>
          <View style={styles.cover}>{cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} /> : <Icon size={28} color={zappy[600]} strokeWidth={1.6} />}</View>
          <View style={styles.flex}>
            <Text variant="heading3" weight="bold">{category.name}</Text>
            <Text variant="caption" color={ink[500]}>{n} {n === 1 ? 'problem' : 'problems'} we fix. Pick the closest match.</Text>
          </View>
        </View>
        <ProblemLayout vertical={vertical} problems={category.problems} category={category}
          onPick={(p) => router.push(`${service.path}?problem=${encodeURIComponent(p.code)}` as never)} />
        <Pressable onPress={() => router.push(service.path as never)} accessibilityRole="button" style={styles.notSeeing}>
          <Text variant="bodySmall" weight="bold" color={ink[700]}>Not seeing your problem?</Text>
          <Text variant="caption" color={ink[500]}>Start the booking anyway. The technician diagnoses it on site.</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.base, padding: spacing.base },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cover: { width: 80, height: 80, borderRadius: radius.medium, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  flex: { flex: 1, minWidth: 0 },
  notSeeing: { alignItems: 'center', gap: 2, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderStyle: 'dashed', borderColor: slate[300], backgroundColor: colors.surface },
});
