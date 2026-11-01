import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wallet, X } from 'lucide-react-native';
import { useShopDuesQuery, useWorkerDuesQuery } from '@zappy/core/api';
import { useAppSelector } from '@zappy/core/store/hooks';
import { Text } from '..';
import { PayDuesButton } from '../../provider/PayDuesButton';
import { colors, ink, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

const rupees = (p: number) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;

// Over the dues limit when a job rings (the website's PayToAccept): pay what is owed, and the job is taken in the same step.
export function PayToAccept({ duesPaise, onPaid, onClose }: { duesPaise: number | null; onPaid: () => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const role = useAppSelector((s) => s.auth.role);
  const { data: w } = useWorkerDuesQuery(undefined, { skip: role !== 'worker' });
  const { data: sh } = useShopDuesQuery(undefined, { skip: role !== 'shop' });
  const owed = duesPaise ?? (role === 'shop' ? sh?.duesPaise : w?.dues?.duesPaise) ?? 0;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.head}>
          <View style={styles.icon}><Wallet size={20} color={zappy[700]} /></View>
          <View style={styles.flex}>
            <Text variant="heading3" weight="extrabold">Pay {rupees(owed)} to take this job</Text>
            <Text variant="bodySmall" color={ink[500]}>Your ZappyOne dues are over the limit. Pay now and the job is yours, if it is still open.</Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}><X size={20} color={ink[500]} /></Pressable>
        </View>
        {owed > 0 ? <PayDuesButton duesPaise={owed} onPaid={onPaid} /> : <Text variant="bodySmall" color={ink[500]}>Checking what you owe.</Text>}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(16,24,40,0.5)' },
  sheet: { gap: spacing.md, padding: spacing.lg, borderTopLeftRadius: radius.extraLarge, borderTopRightRadius: radius.extraLarge, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  flex: { flex: 1, minWidth: 0, gap: 2 },
});
