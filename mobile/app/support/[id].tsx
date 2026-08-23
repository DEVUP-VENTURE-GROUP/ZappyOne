/**
 * One support ticket, and its conversation.
 * ----------------------------------------------------------------------------
 * `GET /support/:id` returns the ticket with its full `messages` array, and
 * `POST /support/:id/messages` returns the UPDATED ticket — so replying needs
 * no refetch (see `supportApi`, which writes the response into this query's
 * cache).
 *
 * The composer disappears on `resolved`/`closed`, matching the server: those
 * are terminal for the customer, and an input that posts into a closed ticket
 * would be a lie. The website does the same.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleCheck, Clock } from 'lucide-react-native';
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
  humanizeCategory,
  isThreadClosed,
  shortRef,
  ticketStatusMeta,
} from '../../components/support/statusMeta';
import {
  useAddTicketMessageMutation,
  useGetTicketQuery,
} from '../../services/api/supportApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { screenPadding, spacing } from '../../theme/spacing';

export default function TicketThreadScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ticketId = String(id);

  const { data: ticket, isLoading, error, refetch } = useGetTicketQuery(ticketId, {
    skip: !ticketId,
  });
  const [addMessage, { isLoading: sending }] = useAddTicketMessageMutation();
  const [sendError, setSendError] = useState<string | null>(null);

  const send = useCallback(
    async (text: string) => {
      setSendError(null);
      try {
        await addMessage({ id: ticketId, text }).unwrap();
      } catch (e) {
        setSendError(getApiErrorMessage(e, "That message didn't send."));
        // Rethrow so the composer keeps the draft rather than clearing it.
        throw e;
      }
    },
    [addMessage, ticketId],
  );

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Ticket" onBack={() => router.back()} />
        <LoadingState label="Loading your ticket…" />
      </View>
    );
  }

  if (error || !ticket) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Ticket" onBack={() => router.back()} />
        <ErrorState
          message={getApiErrorMessage(error, "We couldn't open that ticket.")}
          onRetry={refetch}
        />
      </View>
    );
  }

  const meta = ticketStatusMeta(ticket.status);
  const closed = isThreadClosed(ticket.status);

  // The server stores an absolute deadline; show what is left of it rather
  // than the raw timestamp. Only meaningful while the ticket is still live.
  const deadline = ticket.slaDeadline ? new Date(ticket.slaDeadline) : null;
  const hoursLeft = deadline
    ? Math.max(0, Math.round((deadline.getTime() - Date.now()) / 3_600_000))
    : null;
  const overdue = deadline ? deadline.getTime() < Date.now() : false;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Ticket" onBack={() => router.back()} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.summary}>
          <View style={styles.summaryBody}>
          <View style={styles.summaryTop}>
            <View style={styles.flex}>
              <Text variant="bodySmall" weight="semibold">
                {ticket.subject}
              </Text>
              <Text variant="caption" color={colors.textMuted}>
                {humanizeCategory(ticket.category)} · {shortRef(ticket._id)}
              </Text>
            </View>
            <Chip label={meta.label} tone={meta.tone} />
          </View>

          {/*
            The description is deliberately NOT repeated here.
            `engagement.controller.js` seeds `messages[0]` with it on create,
            so the thread below always opens with the same text — printing it
            in this card too showed every customer their own complaint twice.
          */}

          {!closed && hoursLeft !== null ? (
            <View style={[styles.sla, overdue ? styles.slaLate : styles.slaOk]}>
              <Clock size={11} color={overdue ? colors.errorDark : colors.textSecondary} />
              <Text
                variant="caption"
                weight="medium"
                color={overdue ? colors.errorDark : colors.textSecondary}
              >
                {overdue
                  ? 'Reply overdue — escalated to our senior team'
                  : `Expected reply within ${hoursLeft}h`}
              </Text>
            </View>
          ) : null}
        </View>
        </Card>

        {(ticket.messages ?? []).map((message, i) => (
          <MessageBubble
            key={`${message.at}-${i}`}
            message={message}
            supportLabel="Zappy Support"
          />
        ))}

        {ticket.status === 'resolved' ? (
          <View style={styles.resolved}>
            <CircleCheck size={16} color={colors.successDark} />
            <View style={styles.flex}>
              <Text variant="caption" weight="semibold" color={colors.successDark}>
                Ticket resolved
              </Text>
              <Text variant="caption" color={colors.successDark}>
                If you still need help, open a new ticket and we'll pick it up.
              </Text>
            </View>
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
            This ticket is {meta.label.toLowerCase()}. Open a new one to continue.
          </Text>
        </View>
      ) : (
        <View style={{ paddingBottom: insets.bottom + spacing.sm }}>
          <Composer placeholder="Reply to support…" sending={sending} onSend={send} />
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
  sla: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.small,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  slaOk: { backgroundColor: colors.surfaceSecondary },
  slaLate: { backgroundColor: colors.errorTint },
  resolved: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.successTint,
    borderRadius: radius.medium,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  sendError: { marginTop: spacing.sm },
  closedNote: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
});
