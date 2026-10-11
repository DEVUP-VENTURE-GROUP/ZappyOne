/**
 * Pages that need a verified partner show this instead (the events website's
 * VerifiedOnly): where verification stands, and the way to it.
 */
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { Button, Text } from '@zappy/ui/components';
import { colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function VerifyFirst({ kycStatus, inset = true }: { kycStatus?: string; inset?: boolean }) {
  const router = useRouter();
  const inReview = kycStatus === 'pending';
  return (
    <View style={[styles.card, inset && styles.inset]}>
      <View style={styles.icon}><ShieldCheck size={22} color={zappy[600]} /></View>
      <Text variant="body" weight="bold">{inReview ? 'Your documents are being reviewed' : 'Verify your business to start taking bookings'}</Text>
      <Text variant="bodySmall" color={ink[500]}>
        {inReview ? 'We usually respond within 24 hours. You can finish your profile meanwhile.'
          : 'Upload your ID and a live selfie. Packages, bookings and earnings open once you are verified.'}
      </Text>
      <Button label={inReview ? 'View status' : 'Verify now'} onPress={() => router.push('/partner/kyc' as never)} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.large, borderWidth: 1, borderColor: zappy[100], backgroundColor: colors.surface },
  inset: { margin: spacing.base },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
});
