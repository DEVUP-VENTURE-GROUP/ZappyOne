/**
 * One reported issue, and its conversation.
 * ----------------------------------------------------------------------------
 * Mirrors the ticket thread — same shared `Thread` pieces — with two things a
 * ticket does not have: the original complaint is pinned above the messages,
 * and a resolution, when one exists, is rendered with the refund amount the
 * admin decided on.
 *
 * `resolution.refundAmountPaise` is PAISE. Dividing by 100 is not cosmetic;
 * showing it raw would overstate every refund by 100×.
 *
 * This screen is also the destination of the server's own deep link — dispute
 * notifications carry `deepLink: /disputes/:id`, which until now resolved to
 * null because there was no mobile screen behind it.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleCheck } from 'lucide-react-native';
import {
  Card,
  Chip,
  ErrorState,
  LoadingState,
  ScreenHeader,
  Text,
} from '../../components/ui';
import { Composer, MessageBubble } from '../../components/support/Thread';
import {
  disputeStatusMeta,
  humanizeCategory,
  isThreadClosed,
  shortRef,
} from '../../components/support/statusMeta';
import {
  useAddDisputeMessageMutation,
  useGetDisputeQuery,
} from '../../services/api/disputesApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { screenPadding, spacing } from '../../theme/spacing';

export default function DisputeThreadScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const disputeId = String(id);

  const { data: dispute, isLoading, error, refetch } = useGetDisputeQuery(disputeId, {
    skip: !disputeId,
  });
  const [addMessage, { isLoading: sending }] = useAddDisputeMessageMutation();
  const [sendError, setSendError] = useState<string | null>(null);

  const send = useCallback(
    async (text: string) => {
      setSendError(null);
      try {
        await addMessage({ id: disputeId, text }).unwrap();
      } catch (e) {
        setSendError(getApiErrorMessage(e, "That message didn't send."));
        throw e; // keeps the draft in the composer
      }
    },
    [addMessage, disputeId],
  );

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Reported issue" onBack={() => router.back()} />
        <LoadingState label="Loading your report…" />
      </View>
    );
  }

  if (error || !dispute) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Reported issue" onBack={() => router.back()} />
        <ErrorState
          message={getApiErrorMessage(error, "We couldn't open that report.")}
          onRetry={refetch}
        />
      </View>
    );
  }

  const meta = disputeStatusMeta(dispute.status);
  const closed = isThreadClosed(dispute.status);
  const refundPaise = dispute.resolution?.refundAmountPaise ?? 0;
  // Disputes are always about an order; naming it is what distinguishes this
  // from a support ticket.
  const orderRef = dispute.orderId ? shortRef(String(dispute.orderId)) : null;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Reported issue" onBack={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.summary}>
          <View style={styles.summaryBody}>
          <View style={styles.summaryTop}>
            <View style={styles.flex}>
              <Text variant="bodySmall" weight="semibold">
                {humanizeCategory(dispute.category)}
              </Text>
              <Text variant="caption" color={colors.textMuted}>
                {shortRef(dispute._id)}
              </Text>
            </View>
            <Chip label={meta.label} tone={meta.tone} />
          </View>

          {/*
            No "what you reported" block. `dispute.service.open()` seeds
            `messages[0]` with the description, so the thread below already
            opens with it. (The website's DisputesPage renders both and shows
            the complaint twice as a result.)
          */}
          {orderRef ? (
            <Text variant="caption" color={colors.textSecondary}>
              About booking {orderRef}
            </Text>
          ) : null}
        </View>
        </Card>

        {(dispute.messages ?? []).map((message, i) => (
          <MessageBubble
            key={`${message.at}-${i}`}
            message={message}
            supportLabel="Support Team"
          />
        ))}

        {dispute.resolution?.type ? (
          <View style={styles.resolution}>
            <View style={styles.resolutionHead}>
              <CircleCheck size={15} color={colors.successDark} />
              <Text variant="label" weight="semibold" color={colors.successDark}>
                RESOLUTION
              </Text>
            </View>
            <Text variant="bodySmall" color={colors.successDark}>
              {humanizeCategory(dispute.resolution.type)}
            </Text>
            {dispute.resolution.adminNotes ? (
              <Text variant="caption" color={colors.successDark}>
                {dispute.resolution.adminNotes}
              </Text>
            ) : null}
            {refundPaise > 0 ? (
              <Text variant="bodySmall" weight="semibold" color={colors.successDark}>
                Refund: ₹{Math.round(refundPaise / 100)}
              </Text>
            ) : null}
          </View>
        ) : null}

        {sendError ? (
          <Text variant="caption" color={colors.errorDark} style={styles.sendError}>
            {sendError}
          </Text>
        ) : null}
      </ScrollView>

      {closed ? (
        <View style={[styles.closedNote, { paddingBottom: insets.bottom + spacing.base }]}>
          <Text variant="caption" color={colors.textMuted}>
            This report is {meta.label.toLowerCase()}. Contact support if you need more help.
          </Text>
        </View>
      ) : (
        <View style={{ paddingBottom: insets.bottom + spacing.sm }}>
          <Composer placeholder="Add more details…" sending={sending} onSend={send} />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.base,
    paddingBottom: spacing.xl,
  },
  flex: { flex: 1 },
  summary: { marginBottom: spacing.lg },
  summaryBody: { gap: spacing.sm },
  summaryTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  resolution: {
    gap: spacing.xs,
    backgroundColor: colors.successTint,
    borderRadius: radius.medium,
    padding: spacing.base,
    marginTop: spacing.sm,
  },
  resolutionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sendError: { marginTop: spacing.sm },
  closedNote: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
});
