/**
 * The provider's menu: every place the bottom tabs don't show (the websites'
 * MENU_ITEMS, same order), plus sign out.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Building2, CalendarClock, FileText, GraduationCap, LogOut, Scale, ShieldCheck, Star, Target, Wallet, ChevronRight } from 'lucide-react-native';
import { useSignOut } from '@zappy/core/hooks/useSignOut';
import { BottomSheet, Text } from '../components';
import { colors, ink, danger } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

export const WORKER_MENU = [
  { key: 'services', label: 'My services', Icon: ShieldCheck, to: '/provider/onboarding' },
  { key: 'documents', label: 'My documents', Icon: FileText, to: '/provider/documents' },
  { key: 'hours', label: 'My hours', Icon: CalendarClock, to: '/worker/hours' },
  { key: 'withdraw', label: 'Withdraw', Icon: Wallet, to: '/worker/withdraw' },
  { key: 'bank', label: 'Bank & UPI', Icon: Building2, to: '/worker/bank' },
  { key: 'reviews', label: 'Reviews', Icon: Star, to: '/worker/reviews' },
  { key: 'appeals', label: 'Appeals', Icon: Scale, to: '/worker/appeals' },
  { key: 'training', label: 'Training', Icon: GraduationCap, to: '/worker/training' },
  { key: 'goals', label: 'Goals', Icon: Target, to: '/worker/goals' },
];

export function WorkerMenuSheet({ visible, onClose, items = WORKER_MENU }: { visible: boolean; onClose: () => void; items?: typeof WORKER_MENU }) {
  const router = useRouter();
  const signOut = useSignOut();
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Menu">
      <View style={styles.list}>
        {items.map(({ key, label, Icon, to }) => (
          <Pressable key={key} accessibilityRole="button" onPress={() => { onClose(); router.push(to as never); }}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
            <Icon size={19} color={ink[700]} strokeWidth={2.1} />
            <Text variant="body" weight="semibold" style={styles.flex}>{label}</Text>
            <ChevronRight size={16} color={ink[400]} />
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" onPress={() => { onClose(); void signOut(); }} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
          <LogOut size={19} color={danger[600]} />
          <Text variant="body" weight="semibold" color={danger[600]} style={styles.flex}>Sign out</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: spacing.base },
  flex: { flex: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, minHeight: 52, borderRadius: radius.button },
  pressed: { backgroundColor: colors.surfaceSecondary },
});
