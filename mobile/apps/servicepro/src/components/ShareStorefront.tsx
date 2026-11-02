/** The shop's own storefront link (the website's ShareStorefront): customers who book through it are theirs, at the own-link commission while it lasts. */
import { Share, StyleSheet, View } from 'react-native';
import { Link2 } from 'lucide-react-native';
import { useShopShareLinkQuery } from '@zappy/core/api';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function ShareStorefront() {
  const { data } = useShopShareLinkQuery(undefined);
  if (!data?.url) return null;
  const share = () => Share.share({ message: `Book me on ZappyOne at my fixed prices: ${data.url}` }).catch(() => toast.error('Could not open sharing'));
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}><Link2 size={18} color={zappy[700]} /></View>
        <View style={styles.flex}>
          <Text variant="bodySmall" weight="bold">Share your storefront</Text>
          <Text variant="caption" color={ink[500]}>Send this to your own customers. They book you straight away, with ZappyOne's start code, photos and redo guarantee.</Text>
        </View>
      </View>
      <Text variant="caption" color={ink[700]} selectable numberOfLines={1} style={styles.link}>{data.url}</Text>
      <Button label="Share on WhatsApp or anywhere" onPress={share} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', gap: spacing.md },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  link: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.button, backgroundColor: colors.background },
});
