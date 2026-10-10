/** Shown when a booking flow reopens on a saved draft: carry on, or start over (the website's ResumeBanner). */
import { Pressable, StyleSheet, View } from 'react-native';
import { RotateCcw, X } from 'lucide-react-native';
import { Text } from '../Text';
import { ink, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export function ResumeBanner({ onStartOver, onDismiss }: { onStartOver: () => void; onDismiss: () => void }) {
  return (
    <View style={styles.bar}>
      <Text variant="caption" color={ink[700]} style={styles.flex}>Continuing where you left off.</Text>
      <Pressable onPress={onStartOver} accessibilityRole="button" hitSlop={8} style={styles.action}>
        <RotateCcw size={13} color={zappy[700]} /><Text variant="caption" weight="semibold" color={zappy[700]}>Start over</Text>
      </Pressable>
      <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Hide" hitSlop={8}><X size={15} color={ink[400]} /></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginHorizontal: spacing.base, marginTop: spacing.md, paddingHorizontal: spacing.base, paddingVertical: 10, borderRadius: radius.large, borderWidth: 1, borderColor: zappy[100], backgroundColor: zappy[50] },
  flex: { flex: 1 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
