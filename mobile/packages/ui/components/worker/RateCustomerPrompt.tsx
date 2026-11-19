// After a job the pro rates the customer before going on: the card stays over Home until a rating is sent (the websites' RateCustomerPrompt).
import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { usePendingCustomerRatingQuery } from '@zappy/core/api';
import { Text } from '..';
import { RateCustomerCard } from './RateCustomerCard';
import { colors, ink } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export function RateCustomerPrompt() {
  const { data } = usePendingCustomerRatingQuery(undefined);
  const job = data?.pending as { id: string; reference?: string } | null | undefined;
  if (!job) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text variant="caption" weight="bold" color={ink[400]}>{`JOB DONE${job.reference ? ` · ${job.reference}` : ''}`}</Text>
          <Text variant="body" weight="bold">Rate the customer to continue.</Text>
          <RateCustomerCard jobId={job.id} rated={false} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,24,40,0.5)' },
  sheet: { gap: spacing.sm, padding: spacing.lg, borderTopLeftRadius: radius.extraLarge, borderTopRightRadius: radius.extraLarge, backgroundColor: colors.surface },
});
