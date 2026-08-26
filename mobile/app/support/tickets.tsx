/**
 * My support tickets.
 * ----------------------------------------------------------------------------
 * The mobile half of a system the backend has had all along. Information
 * architecture follows `client/src/pages/SupportPage.jsx`: a list of tickets,
 * each showing subject, category, status and activity, with `waiting_user`
 * called out at the top of its card because that state means WE are the
 * blocker — the ticket is stalled until the customer replies.
 *
 * Creating a ticket is a bottom sheet rather than a separate route, matching
 * how the rest of this app collects short structured input (addresses, rating,
 * cancellation).
 *
 * The website's form asks the customer to TYPE an order id. That is a desktop
 * affordance and nobody knows their order id by heart, so it is dropped here —
 * a ticket about a specific booking is better raised from the booking itself,
 * and `orderId` is optional in the route's schema.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertCircle, ChevronRight, Clock, Headphones, MessageCircle, Plus } from 'lucide-react-native';
import {
  Appear,
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  ScalePressable,
  SkeletonList,
  Text,
} from '../../components/ui';
import { SupportHeader } from '../../components/support/SupportHeader';
import {
  humanizeCategory,
  PRIORITY_SLA_HOURS,
  ticketStatusMeta,
} from '../../components/support/statusMeta';
import {
  useCreateTicketMutation,
  useListMyTicketsQuery,
} from '../../services/api/supportApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { screenPadding, spacing } from '../../theme/spacing';
import { fontFamily, typography } from '../../theme/typography';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  type SupportCategory,
  type SupportPriority,
} from '../../types/api';

/** Labels for the category grid. The website prefixes each with an emoji; the
 *  app leans on its own iconography instead of emoji in form controls. */
const CATEGORY_LABEL: Record<SupportCategory, string> = {
  payment: 'Payment',
  order: 'Order issue',
  account: 'Account',
  kyc: 'Verification',
  app_bug: 'App problem',
  other: 'Something else',
};

const MIN_DESCRIPTION = 10; // server: Joi.string().min(10)

/** The support address the website publishes on this page. */
const SUPPORT_EMAIL = 'support@zappyone.com';

export default function TicketsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // `?new=1` opens the composer straight away, so other screens can deep-link
  // into "raise a ticket" without a second tap.
  const { new: openNew } = useLocalSearchParams<{ new?: string }>();

  const { data: tickets = [], isLoading, error, refetch } = useListMyTicketsQuery();
  const [createTicket, { isLoading: creating }] = useCreateTicketMutation();

  const [sheetOpen, setSheetOpen] = useState(openNew === '1');
  const [category, setCategory] = useState<SupportCategory | null>(null);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<SupportPriority>('normal');
  const [formError, setFormError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setCategory(null);
    setSubject('');
    setDescription('');
    setPriority('normal');
    setFormError(null);
  }, []);

  const canSubmit =
    !!category && subject.trim().length >= 3 && description.trim().length >= MIN_DESCRIPTION;

  const submit = useCallback(async () => {
    if (!canSubmit || !category) return;
    setFormError(null);
    try {
      const ticket = await createTicket({
        category,
        subject: subject.trim(),
        description: description.trim(),
        priority,
      }).unwrap();
      setSheetOpen(false);
      reset();
      router.push(`/support/${ticket._id}` as never);
    } catch (e) {
      setFormError(getApiErrorMessage(e, "We couldn't create that ticket."));
    }
  }, [canSubmit, category, subject, description, priority, createTicket, reset, router]);

  const sorted = useMemo(
    () =>
      [...tickets].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [tickets],
  );

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top }}>
        <SupportHeader
          title="Help & Support"
          icon={Headphones}
          iconColor="#A78BFA"
          onBack={() => router.back()}
          actionLabel="New ticket"
          onAction={() => setSheetOpen(true)}
        />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/*
          Direct email support — the website leads this page with it, on a dark
          indigo card, so the fastest route to a human is visible before any
          ticket list. The address is the website's own published one.
        */}
        <Appear>
          <View style={styles.emailCard}>
            <View style={styles.flex}>
              <Text variant="eyebrow" color="#A5B4FC">
                Direct email support
              </Text>
              <Text style={styles.emailAddress}>{SUPPORT_EMAIL}</Text>
              <Text variant="caption" color="rgba(255,255,255,0.55)">
                24/7 dedicated customer resolution desk
              </Text>
            </View>
            <Button
              label="Email us"
              size="small"
              onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
              style={styles.emailButton}
            />
          </View>
        </Appear>

        {isLoading ? (
          <SkeletonList count={3} />
        ) : error ? (
          <ErrorState
            message={getApiErrorMessage(error, "We couldn't load your tickets.")}
            onRetry={refetch}
          />
        ) : sorted.length === 0 ? (
          <EmptyState
            title="No support tickets yet"
            message="Raise one and our team will get back to you."
            actionLabel="New ticket"
            onAction={() => setSheetOpen(true)}
          />
        ) : (
          sorted.map((ticket, index) => {
            const meta = ticketStatusMeta(ticket.status);
            const awaiting = ticket.status === 'waiting_user';
            const count = ticket.messages?.length ?? 0;
            return (
              <Appear key={ticket._id} delay={index * 40}>
                <ScalePressable
                  onPress={() => router.push(`/support/${ticket._id}` as never)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ticket: ${ticket.subject}, ${meta.label}`}
                >
                  <Card>
                    <View style={styles.card}>
                    {awaiting ? (
                      <View style={styles.awaiting}>
                        <AlertCircle size={12} color={colors.accentDark} />
                        <Text variant="caption" weight="semibold" color={colors.accentDark}>
                          Action needed — reply to support
                        </Text>
                      </View>
                    ) : null}

                    <View style={styles.cardTop}>
                      <View style={styles.flex}>
                        <Text variant="bodySmall" weight="semibold" numberOfLines={1}>
                          {ticket.subject}
                        </Text>
                        <Text variant="caption" color={colors.textSecondary}>
                          {humanizeCategory(ticket.category)}
                        </Text>
                      </View>
                      <Chip label={meta.label} tone={meta.tone} />
                    </View>

                    <View style={styles.cardMeta}>
                      <View style={styles.metaItem}>
                        <Clock size={11} color={colors.textMuted} />
                        <Text variant="caption" color={colors.textMuted}>
                          {new Date(ticket.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </Text>
                      </View>
                      {count > 0 ? (
                        <View style={styles.metaItem}>
                          <MessageCircle size={11} color={colors.textMuted} />
                          <Text variant="caption" color={colors.textMuted}>
                            {count} {count === 1 ? 'message' : 'messages'}
                          </Text>
                        </View>
                      ) : null}
                      <View style={styles.spacer} />
                      <ChevronRight size={15} color={colors.primary} />
                    </View>
                  </View>
                  </Card>
                </ScalePressable>
              </Appear>
            );
          })
        )}
      </ScrollView>

      {/*
        New ticket — pinned below the list, like the website's header action.
        Hidden while the empty state is showing, because that already offers
        the same button and two identical CTAs on one screen reads as a bug.
      */}
      {sorted.length > 0 ? (
        <View style={[styles.fabWrap, { paddingBottom: insets.bottom + spacing.base }]}>
          <Button
            label="New ticket"
            icon={<Plus size={16} color={colors.textInverse} />}
            onPress={() => setSheetOpen(true)}
            fullWidth
          />
        </View>
      ) : null}

      <BottomSheet
        visible={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          reset();
        }}
        title="New support ticket"
      >
        <Text variant="label" color={colors.textSecondary} style={styles.fieldLabel}>
          WHAT IS IT ABOUT?
        </Text>
        <View style={styles.grid}>
          {SUPPORT_CATEGORIES.map((value) => (
            <Chip
              key={value}
              label={CATEGORY_LABEL[value]}
              tone="neutral"
              selected={category === value}
              onPress={() => setCategory(value)}
              style={styles.gridChip}
            />
          ))}
        </View>

        <Text variant="label" color={colors.textSecondary} style={styles.fieldLabel}>
          SUBJECT
        </Text>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          placeholder="Brief summary of the issue"
          placeholderTextColor={colors.textMuted}
          maxLength={200}
          style={styles.input}
          accessibilityLabel="Ticket subject"
        />

        <Text variant="label" color={colors.textSecondary} style={styles.fieldLabel}>
          DETAILS
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What happened? The more detail, the faster we can help."
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={2000}
          style={[styles.input, styles.textarea]}
          accessibilityLabel="Ticket details"
        />
        {description.length > 0 && description.trim().length < MIN_DESCRIPTION ? (
          <Text variant="caption" color={colors.textMuted}>
            {MIN_DESCRIPTION - description.trim().length} more characters needed
          </Text>
        ) : null}

        <Text variant="label" color={colors.textSecondary} style={styles.fieldLabel}>
          PRIORITY
        </Text>
        <View style={styles.priorityRow}>
          {SUPPORT_PRIORITIES.map((value) => (
            <Chip
              key={value}
              label={value.charAt(0).toUpperCase() + value.slice(1)}
              tone="neutral"
              selected={priority === value}
              onPress={() => setPriority(value)}
              style={styles.flex}
            />
          ))}
        </View>
        <Text variant="caption" color={colors.textMuted} style={styles.slaHint}>
          We aim to reply within {PRIORITY_SLA_HOURS[priority]}h for {priority} priority.
        </Text>

        {formError ? (
          <View style={styles.formError}>
            <Text variant="caption" color={colors.errorDark}>
              {formError}
            </Text>
          </View>
        ) : null}

        <Button
          label="Submit ticket"
          onPress={submit}
          disabled={!canSubmit}
          loading={creating}
          fullWidth
          style={styles.submit}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  // `bg-indigo-950/80 border border-indigo-800/50 rounded-2xl p-4`
  emailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#1E1B4B',
    borderWidth: 1,
    borderColor: 'rgba(55,48,163,0.5)',
    borderRadius: radius.medium,
    padding: spacing.base,
  },
  emailAddress: {
    fontFamily: fontFamily.extrabold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textInverse,
  },
  emailButton: { backgroundColor: '#4F46E5' },
  scroll: { paddingHorizontal: screenPadding, paddingTop: spacing.base, gap: spacing.md },
  flex: { flex: 1 },
  card: { gap: spacing.sm },
  awaiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.accentTint,
    borderRadius: radius.small,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  spacer: { flex: 1 },
  fabWrap: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  fieldLabel: { marginTop: spacing.base, marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridChip: { marginBottom: spacing.xxs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    ...typography.bodySmall,
    color: colors.textPrimary,
  },
  textarea: { minHeight: 96, textAlignVertical: 'top' },
  priorityRow: { flexDirection: 'row', gap: spacing.sm },
  slaHint: { marginTop: spacing.sm },
  formError: {
    marginTop: spacing.base,
    backgroundColor: colors.errorTint,
    borderRadius: radius.button,
    padding: spacing.md,
  },
  submit: { marginTop: spacing.lg },
});
