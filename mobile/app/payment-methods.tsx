/**
 * Saved payment methods.
 * ----------------------------------------------------------------------------
 * List, set default, remove — the three things `/users/payment-methods`
 * supports. There is no "add" here on purpose: the backend saves a method as a
 * side effect of paying with it at checkout, and there is no endpoint to
 * register one directly. An Add button would open a form with nowhere to POST.
 *
 * Removal confirms in a BottomSheet rather than `Alert.alert`, matching every
 * other destructive action in the app (sign out, remove address).
 * ----------------------------------------------------------------------------
 */

import React, { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreditCard, Smartphone, Star, Trash2 } from 'lucide-react-native';
import {
  Appear,
  BottomSheet,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ScreenHeader,
  SkeletonList,
  Text,
} from '../components/ui';
import {
  useDeletePaymentMethodMutation,
  useGetPaymentMethodsQuery,
  useSetDefaultPaymentMethodMutation,
} from '../services/api/authApi';
import { getApiErrorMessage } from '../services/api/apiSlice';
import { colors, success } from '../theme/colors';
import { radius } from '../theme/radius';
import { screenPadding, spacing } from '../theme/spacing';
import type { StoredPaymentMethod } from '../types/api';

export default function PaymentMethodsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: methods = [], isLoading, error, refetch } = useGetPaymentMethodsQuery();
  const [deleteMethod] = useDeletePaymentMethodMutation();
  const [setDefault] = useSetDefaultPaymentMethodMutation();
  const [confirmDelete, setConfirmDelete] = useState<StoredPaymentMethod | null>(null);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Payment methods" onBack={() => router.back()} />
      </View>

      {isLoading ? (
        <View style={styles.padded}>
          <SkeletonList count={3} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <ErrorState
            message={getApiErrorMessage(error, "We couldn't load your payment methods.")}
            onRetry={refetch}
          />
        </View>
      ) : (
        <FlatList
          data={methods}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Appear delay={index * 40}>
              <Card variant="outline">
                <View style={styles.row}>
                  <View style={styles.icon}>
                    {item.type === 'upi' ? (
                      <Smartphone size={17} color={colors.primary} />
                    ) : (
                      <CreditCard size={17} color={colors.primary} />
                    )}
                  </View>
                  <View style={styles.flex}>
                    <View style={styles.titleRow}>
                      <Text
                        variant="bodySmall"
                        weight="semibold"
                        numberOfLines={1}
                        style={styles.label}
                      >
                        {item.label || item.type}
                      </Text>
                      {item.isDefault ? (
                        <View style={styles.defaultPill}>
                          <Text variant="caption" color={colors.successDark}>
                            DEFAULT
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {/* Never the full number — the API only ever returns the
                        last four digits, and that is all that is shown. */}
                    <Text variant="caption" color={colors.textMuted} style={styles.detail}>
                      {item.type === 'upi'
                        ? item.upiId
                        : item.last4
                          ? `•••• ${item.last4}`
                          : ''}
                    </Text>
                  </View>
                </View>

                <View style={styles.actions}>
                  {!item.isDefault ? (
                    <Button
                      label="Set default"
                      variant="ghost"
                      size="small"
                      icon={<Star size={13} color={colors.primary} />}
                      onPress={() => setDefault(item._id)}
                    />
                  ) : null}
                  <Button
                    label="Remove"
                    variant="dangerGhost"
                    size="small"
                    icon={<Trash2 size={13} color={colors.error} />}
                    onPress={() => setConfirmDelete(item)}
                  />
                </View>
              </Card>
            </Appear>
          )}
          ListEmptyComponent={
            <View style={styles.centered}>
              <EmptyState
                icon={<CreditCard size={28} color={colors.textMuted} />}
                title="No saved payment methods"
                message="Cards and UPI IDs you use at checkout are saved here for next time."
              />
            </View>
          }
        />
      )}

      <BottomSheet
        visible={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Remove this payment method?"
      >
        <Text variant="bodySmall" color={colors.textSecondary}>
          {confirmDelete?.label || 'This method'} will be removed from your account.
          Your past payments are unaffected.
        </Text>
        <Button
          label="Remove"
          variant="danger"
          onPress={() => {
            if (confirmDelete) deleteMethod(confirmDelete._id);
            setConfirmDelete(null);
          }}
          fullWidth
          style={styles.sheetPrimary}
        />
        <Button
          label="Keep it"
          variant="secondary"
          onPress={() => setConfirmDelete(null)}
          fullWidth
          style={styles.sheetSecondary}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  padded: { paddingHorizontal: screenPadding, paddingTop: spacing.base },
  centered: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xs },
  list: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.base,
    gap: spacing.md,
    flexGrow: 1,
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.medium,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { textTransform: 'capitalize', flexShrink: 1 },
  detail: { marginTop: spacing.xxs },
  defaultPill: {
    backgroundColor: colors.successTint,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.md,
  },

  sheetPrimary: { marginTop: spacing.lg },
  sheetSecondary: { marginTop: spacing.sm },
});
