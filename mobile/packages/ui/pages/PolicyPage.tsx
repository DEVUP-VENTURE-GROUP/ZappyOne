/**
 * Any admin-managed policy by slug (the website's PolicyPage): refund,
 * privacy, warranty, terms. Plain text with line breaks; numbered lines read
 * as headings. Nothing is hardcoded.
 */
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileText } from 'lucide-react-native';
import { useGetPolicyQuery } from '@zappy/core/api';
import { LoadingState, ScreenHeader, Text } from '../components';
import { useT } from '../lib/i18n';
import { colors, ink, slate } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

export function PolicyPage({ fallbackPath = '/support' }: { fallbackPath?: string }) {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading, isError } = useGetPolicyQuery(slug);
  const policy = data?.policy as { title?: string; body?: string; updatedAt?: string } | undefined;
  const back = () => (router.canGoBack() ? router.back() : router.replace(fallbackPath as never));

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={policy?.title || t('policy.title', 'Policy')} onBack={back} />
      {isLoading ? <LoadingState /> : isError || !policy ? (
        <View style={styles.empty}><FileText size={40} color={slate[300]} /><Text variant="bodySmall" weight="medium" color={ink[400]}>{t('policy.unavailable', 'This page isn’t available right now.')}</Text></View>
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.card}>
            {String(policy.body || '').split('\n').map((line, i) => {
              const text = line.trim();
              if (!text) return <View key={i} style={styles.gap} />;
              return <Text key={i} variant="bodySmall" weight={/^\d+\./.test(text) ? 'semibold' : 'regular'} color={/^\d+\./.test(text) ? ink[900] : ink[700]}>{text}</Text>;
            })}
            {policy.updatedAt ? <Text variant="caption" color={ink[400]} style={styles.updated}>{t('policy.updated', 'Last updated')} {new Date(policy.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</Text> : null}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.base },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  gap: { height: 4 },
  updated: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
});
