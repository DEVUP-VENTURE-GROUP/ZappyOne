/**
 * Help & support.
 * ----------------------------------------------------------------------------
 * Two ways to reach a human, then the FAQ.
 *
 * ── WHY THE FAQ LIST CHANGED SHAPE ─────────────────────────────────────────
 * `GET /content/faqs` returns questions GROUPED BY CATEGORY —
 * `[{ category, items: [{ id, question, answer }] }]` — and this screen mapped
 * the group array as though each element were a question. `faq.question` and
 * `faq.answer` were both `undefined`, so every row rendered blank, and
 * `key={faq._id}` was `undefined` too, which is where React's duplicate-key
 * warning came from. The categories are now section headings, which is what
 * the grouping was for.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, ChevronRight, Headphones, MessageCircle, Phone, Scale } from 'lucide-react-native';
import {
  Appear,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ScalePressable,
  ScreenHeader,
  SectionTitle,
  SkeletonList,
  Text,
} from '../../components/ui';
import { useGetFaqsQuery } from '../../services/api/contentApi';
import { useListMyTicketsQuery } from '../../services/api/supportApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { screenPadding, spacing } from '../../theme/spacing';

const SUPPORT_PHONE = 'tel:+911800000000';

export default function SupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: groups = [], isLoading, error, refetch } = useGetFaqsQuery();
  const [openId, setOpenId] = useState<string | null>(null);

  // Ticket counts for the "My tickets" row. A failure here must not take the
  // FAQ down with it, so the error is unused on purpose — the row simply
  // falls back to its neutral wording.
  const { data: tickets = [], isLoading: ticketsLoading } = useListMyTicketsQuery();
  const openTickets = tickets.filter(
    (t) => t.status !== 'resolved' && t.status !== 'closed',
  ).length;
  /** Tickets stalled on US — the badge exists to make these hard to miss. */
  const needsReply = tickets.filter((t) => t.status === 'waiting_user').length;

  const toggle = useCallback(
    (id: string) => setOpenId((current) => (current === id ? null : id)),
    [],
  );

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Help & support" onBack={() => router.back()} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <Appear>
          <View style={styles.actions}>
            <Button
              label="Call us"
              icon={<Phone size={15} color={colors.textInverse} />}
              onPress={() => Linking.openURL(SUPPORT_PHONE)}
              style={styles.action}
            />
            {/*
              This used to read "Chat with us" and push `/(tabs)/chat` — the
              list of bookings you can message your assigned PRO about. Nobody
              from Zappy is on the other end of that, and with no active
              booking it opens an empty screen. The real support channel is
              the ticket system the backend has always exposed.
            */}
            <Button
              label="Message us"
              variant="secondary"
              icon={<MessageCircle size={15} color={colors.primary} />}
              // `as never`: typed-routes stale-cache artifact — route is real.
              onPress={() => router.push('/support/tickets' as never)}
              style={styles.action}
            />
          </View>
        </Appear>

        <Appear delay={60}>
          <ScalePressable
            // `as never`: typed-routes stale-cache artifact — route is real.
            onPress={() => router.push('/support/tickets' as never)}
            accessibilityRole="button"
            accessibilityLabel={
              openTickets > 0
                ? `My tickets, ${openTickets} still open`
                : 'My support tickets'
            }
          >
            <Card>
              <View style={styles.ticketsRow}>
                <View style={styles.ticketsIcon}>
                  <Headphones size={17} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <Text variant="bodySmall" weight="semibold">
                    My tickets
                  </Text>
                  <Text variant="caption" color={colors.textSecondary}>
                    {ticketsLoading
                      ? 'Checking your tickets…'
                      : openTickets > 0
                        ? `${openTickets} still open`
                        : 'Track anything you have raised with us'}
                  </Text>
                </View>
                {needsReply > 0 ? <Badge count={needsReply} /> : null}
                <ChevronRight size={16} color={colors.textMuted} />
              </View>
            </Card>
          </ScalePressable>
        </Appear>

        <Appear delay={90}>
          <ScalePressable
            // `as never`: typed-routes stale-cache artifact — route is real.
            onPress={() => router.push('/disputes' as never)}
            accessibilityRole="button"
            accessibilityLabel="Issues I have reported about a booking"
          >
            <Card>
              <View style={styles.ticketsRow}>
                <View style={styles.ticketsIcon}>
                  <Scale size={17} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <Text variant="bodySmall" weight="semibold">
                    Reported issues
                  </Text>
                  <Text variant="caption" color={colors.textSecondary}>
                    Problems you've raised about a specific booking
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.textMuted} />
              </View>
            </Card>
          </ScalePressable>
        </Appear>

        {isLoading ? (
          <SkeletonList count={4} />
        ) : error ? (
          <ErrorState
            message={getApiErrorMessage(error, "We couldn't load the help articles.")}
            onRetry={refetch}
          />
        ) : groups.length === 0 ? (
          <EmptyState
            title="No help articles yet"
            message="Nothing has been published here so far. Call or chat and we'll help directly."
          />
        ) : (
          groups.map((group, groupIndex) => (
            <Appear key={group.category} delay={40 + groupIndex * 40}>
              <View style={styles.group}>
                <SectionTitle>{group.category}</SectionTitle>
                <Card variant="outline" padding={0}>
                  {group.items.map((faq, index) => {
                    const open = openId === faq.id;
                    return (
                      <ScalePressable
                        key={faq.id}
                        onPress={() => toggle(faq.id)}
                        accessibilityRole="button"
                        accessibilityLabel={faq.question}
                        accessibilityState={{ expanded: open }}
                      >
                        <View
                          style={[styles.faq, index > 0 ? styles.faqDivided : null]}
                        >
                          <View style={styles.faqHead}>
                            <Text
                              variant="bodySmall"
                              weight="semibold"
                              style={styles.flex}
                            >
                              {faq.question}
                            </Text>
                            <ChevronDown
                              size={16}
                              color={colors.textMuted}
                              style={open ? styles.chevronOpen : undefined}
                            />
                          </View>
                          {open ? (
                            <Text
                              variant="bodySmall"
                              color={colors.textSecondary}
                              style={styles.answer}
                            >
                              {faq.answer}
                            </Text>
                          ) : null}
                        </View>
                      </ScalePressable>
                    );
                  })}
                </Card>
              </View>
            </Appear>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.lg,
    flexGrow: 1,
  },

  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },

  ticketsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ticketsIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.button,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },

  group: { gap: spacing.sm },
  faq: { padding: spacing.base, gap: spacing.sm },
  faqDivided: { borderTopWidth: 1, borderTopColor: colors.divider },
  faqHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  answer: { lineHeight: 20 },
});
