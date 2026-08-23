/**
 * Raising a dispute about a specific booking.
 * ----------------------------------------------------------------------------
 * Always opened FROM an order, never from a blank form — which is the one
 * substantive departure from `client/src/pages/DisputesPage.jsx`, where the
 * customer is asked to type an order id into a text field. On a phone that is
 * unusable: nobody knows their order id, and it is the single field the server
 * will 404 on. Raising it from the booking means `orderId` is always right.
 *
 * ── WHAT THE SERVER ENFORCES ───────────────────────────────────────────────
 * `dispute.service.open()` rejects a dispute for reasons the client cannot
 * fully predict — the 7-day window, one open dispute per order, three per
 * rolling 30 days. The obvious ones are pre-checked so the entry point can be
 * hidden rather than offered-then-refused, but the server's own message is
 * always what gets shown when it does refuse: it knows things this screen
 * does not.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BottomSheet, Button, Chip, Text } from '../ui';
import { humanizeCategory } from './statusMeta';
import { useOpenDisputeMutation } from '../../services/api/disputesApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { DISPUTE_CATEGORIES, type DisputeCategory } from '../../types/api';

const MIN_DESCRIPTION = 10; // server: Joi.string().min(10)

export interface RaiseDisputeSheetProps {
  visible: boolean;
  onClose: () => void;
  orderId: string;
}

export function RaiseDisputeSheet({ visible, onClose, orderId }: RaiseDisputeSheetProps) {
  const router = useRouter();
  const [openDispute, { isLoading }] = useOpenDisputeMutation();

  const [category, setCategory] = useState<DisputeCategory | null>(null);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!category && description.trim().length >= MIN_DESCRIPTION;

  const close = useCallback(() => {
    setCategory(null);
    setDescription('');
    setError(null);
    onClose();
  }, [onClose]);

  const submit = useCallback(async () => {
    if (!canSubmit || !category) return;
    setError(null);
    try {
      const dispute = await openDispute({
        orderId,
        category,
        description: description.trim(),
      }).unwrap();
      close();
      router.push(`/disputes/${dispute._id}`);
    } catch (e) {
      // The server's wording is better than anything generic here: it names
      // the window, the limit, or the existing dispute.
      setError(getApiErrorMessage(e, "We couldn't raise that dispute."));
    }
  }, [canSubmit, category, description, orderId, openDispute, close, router]);

  return (
    <BottomSheet visible={visible} onClose={close} title="Report an issue">
      <Text variant="bodySmall" color={colors.textSecondary}>
        Tell us what went wrong and our team will review this booking.
      </Text>

      <Text variant="label" color={colors.textSecondary} style={styles.fieldLabel}>
        WHAT HAPPENED?
      </Text>
      <View style={styles.grid}>
        {DISPUTE_CATEGORIES.map((value) => (
          <Chip
            key={value}
            label={humanizeCategory(value)}
            tone="neutral"
            selected={category === value}
            onPress={() => setCategory(value)}
          />
        ))}
      </View>

      <Text variant="label" color={colors.textSecondary} style={styles.fieldLabel}>
        DETAILS
      </Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Describe the issue — what you expected, and what actually happened."
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={2000}
        style={styles.textarea}
        accessibilityLabel="Dispute details"
      />
      {description.length > 0 && description.trim().length < MIN_DESCRIPTION ? (
        <Text variant="caption" color={colors.textMuted}>
          {MIN_DESCRIPTION - description.trim().length} more characters needed
        </Text>
      ) : null}

      {error ? (
        <View style={styles.error}>
          <Text variant="caption" color={colors.errorDark}>
            {error}
          </Text>
        </View>
      ) : null}

      <Button
        label="Submit report"
        onPress={submit}
        disabled={!canSubmit}
        loading={isLoading}
        fullWidth
        style={styles.submit}
      />
      <Text variant="caption" color={colors.textMuted} style={styles.note}>
        Reports can be raised within 7 days of a booking finishing.
      </Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { marginTop: spacing.lg, marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  textarea: {
    minHeight: 96,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    ...typography.bodySmall,
    color: colors.textPrimary,
  },
  error: {
    marginTop: spacing.base,
    backgroundColor: colors.errorTint,
    borderRadius: radius.button,
    padding: spacing.md,
  },
  submit: { marginTop: spacing.lg },
  note: { marginTop: spacing.sm, textAlign: 'center' },
});
