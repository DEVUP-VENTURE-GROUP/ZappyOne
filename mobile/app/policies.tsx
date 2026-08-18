/**
 * Terms & policies.
 * ----------------------------------------------------------------------------
 * ── WHY THIS NOW MAKES TWO REQUESTS ────────────────────────────────────────
 * `GET /content/policies` projects `slug title` and NOTHING ELSE — there is no
 * `body` on a list entry. This screen used to render `active.body` straight
 * off that list, so the page was permanently blank below the title: the tabs
 * worked, and every document appeared to be empty.
 *
 * The text lives on `GET /content/policy/:slug`, so the selected slug is
 * fetched separately. (That endpoint was already wired in `contentApi`, but
 * pointed at `/content/policies/:slug` — plural, not a route — so it 404'd and
 * was never used.)
 * ----------------------------------------------------------------------------
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollText } from 'lucide-react-native';
import {
  Appear,
  Chip,
  EmptyState,
  ErrorState,
  Heading,
  ScreenHeader,
  Skeleton,
  SkeletonList,
  Text,
} from '../components/ui';
import { useGetPoliciesQuery, useGetPolicyQuery } from '../services/api/contentApi';
import { getApiErrorMessage } from '../services/api/apiSlice';
import { colors } from '../theme/colors';
import { screenPadding, spacing } from '../theme/spacing';

export default function PoliciesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    data: policies = [],
    isLoading,
    error,
    refetch,
  } = useGetPoliciesQuery();
  const [selected, setSelected] = useState<string | null>(null);

  // Default to the first document so the screen never opens on nothing.
  const activeSlug = useMemo(
    () => selected ?? policies[0]?.slug ?? null,
    [selected, policies],
  );

  const {
    data: policy,
    isFetching: bodyLoading,
    error: bodyError,
    refetch: refetchBody,
  } = useGetPolicyQuery(activeSlug as string, { skip: !activeSlug });

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Terms & policies" onBack={() => router.back()} />
      </View>

      {isLoading ? (
        <View style={styles.padded}>
          <SkeletonList count={3} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <ErrorState
            message={getApiErrorMessage(error, "We couldn't load the policy documents.")}
            onRetry={refetch}
          />
        </View>
      ) : policies.length === 0 ? (
        <View style={styles.centered}>
          <EmptyState
            icon={<ScrollText size={26} color={colors.textMuted} />}
            title="No policies published"
            message="There are no policy documents available right now."
          />
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabs}
          >
            {policies.map((item) => (
              <Chip
                key={item.slug}
                label={item.title}
                selected={item.slug === activeSlug}
                tone="neutral"
                onPress={() => setSelected(item.slug)}
              />
            ))}
          </ScrollView>

          <ScrollView
            contentContainerStyle={[
              styles.body,
              { paddingBottom: insets.bottom + spacing.xxl },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {bodyLoading ? (
              <View style={styles.skeletonBody}>
                <Skeleton width="60%" height={22} />
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} width={i % 3 === 2 ? '75%' : '100%'} height={13} />
                ))}
              </View>
            ) : bodyError ? (
              <ErrorState
                message={getApiErrorMessage(bodyError, "We couldn't load this document.")}
                onRetry={refetchBody}
              />
            ) : policy ? (
              <Appear key={policy.slug}>
                <Heading level={3}>{policy.title}</Heading>
                <Text variant="bodySmall" color={colors.textSecondary} style={styles.text}>
                  {policy.body}
                </Text>
                {policy.updatedAt ? (
                  <Text variant="caption" color={colors.textMuted} style={styles.updated}>
                    Last updated{' '}
                    {new Date(policy.updatedAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Text>
                ) : null}
              </Appear>
            ) : null}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  padded: { paddingHorizontal: screenPadding, paddingTop: spacing.base },
  centered: { flex: 1, justifyContent: 'center', paddingHorizontal: screenPadding },

  tabs: {
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  body: { paddingHorizontal: screenPadding, paddingTop: spacing.sm },
  text: { marginTop: spacing.md, lineHeight: 22 },
  updated: { marginTop: spacing.lg },
  skeletonBody: { gap: spacing.md },
});
