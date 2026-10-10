/**
 * Emergency SOS (the website's SOS sheet): calls 112 first, because that is
 * what brings help and it must not wait on our network, then tells the
 * ZappyOne safety team. It never claims we were told when we were not.
 */
import { StyleSheet, View } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { BottomSheet, Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { callNumber } from '@zappy/ui/lib/openLink';
import { danger, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function SosSheet({ visible, onClose, onAlert }: { visible: boolean; onClose: () => void; onAlert?: () => Promise<void> }) {
  async function sos() {
    onClose();
    callNumber('112');
    if (!onAlert) return;
    try { await onAlert(); toast('112 dialled, and our safety team has been alerted', { duration: 8000 }); }
    catch { toast.error('112 dialled. We could not reach ZappyOne support. Please call us too.', { duration: 10000 }); }
  }
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <View style={styles.icon}><ShieldAlert size={28} color={danger[600]} /></View>
        <Text variant="heading3" weight="bold">Emergency SOS?</Text>
        <Text variant="bodySmall" color={ink[500]} style={styles.center}>This calls 112 and alerts the ZappyOne safety team with this booking. Use it only in a real emergency.</Text>
        <Button label="Call 112, I need help" variant="danger" size="large" icon={<ShieldAlert size={20} color="#fff" />} onPress={sos} fullWidth />
        <Button label="Cancel, I'm safe" variant="outline" onPress={onClose} fullWidth />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: spacing.md, paddingBottom: spacing.lg },
  icon: { width: 64, height: 64, borderRadius: radius.large, alignItems: 'center', justifyContent: 'center', backgroundColor: danger[50] },
  center: { textAlign: 'center' },
});
