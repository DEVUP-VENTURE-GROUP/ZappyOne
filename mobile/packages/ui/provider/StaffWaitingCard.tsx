/**
 * On Rakshak, someone not yet ZappyOne staff (the website's StaffWaitingCard):
 * they finish their verification, and ZappyOne adds them to a hub with a salary.
 */
import { StyleSheet, View } from 'react-native';
import { Hourglass } from 'lucide-react-native';
import { Text } from '../components';
import { accent, colors, ink } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

export function StaffWaitingCard() {
  return (
    <View style={styles.card}>
      <View style={styles.icon}><Hourglass size={19} color={accent[600]} /></View>
      <View style={styles.flex}>
        <Text variant="body" weight="bold">Joining ZappyOne</Text>
        <Text variant="caption" color={ink[700]}>Finish your ID check and your services. Our team will add you to a hub and set your salary, then your shifts appear here.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, padding: spacing.base },
  icon: { width: 40, height: 40, borderRadius: radius.medium, backgroundColor: accent[50], alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0, gap: 2 },
});
