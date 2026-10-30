import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { PartyPopper, Store, Wrench } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { WorkerLoginPage } from '@zappy/ui/provider/pages/WorkerLoginPage';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const ROLES = [
  { key: 'shop', label: 'Shop owner', Icon: Store },
  { key: 'worker', label: 'Shop worker', Icon: Wrench },
  { key: 'event_partner', label: 'Event business', Icon: PartyPopper },
] as const;
type As = (typeof ROLES)[number]['key'];

const SUBTITLE: Record<As, string> = {
  shop: 'Sign in to run your shop',
  worker: 'Sign in as a technician of your shop',
  event_partner: 'Sign in to run your decor and events business',
};

/**
 * Three ways in (the website's LoginRoleSwitch): a shop's owner, a technician
 * of the shop, or an event partner (decor and events, events.zappyone.com on the web).
 */
export default function LoginScreen() {
  const [as, setAs] = useState<As>('shop');
  return (
    <WorkerLoginPage
      title="ZappyOne ServicePro"
      subtitle={SUBTITLE[as]}
      role={as}
      params={{ as }}
      header={
        <View style={styles.wrap}>
          <Text variant="caption" weight="bold" color={ink[400]} style={styles.center}>SIGNING IN AS</Text>
          <View style={styles.switch} accessibilityRole="tablist">
            {ROLES.map(({ key, label, Icon }) => (
              <Pressable key={key} onPress={() => setAs(key)} accessibilityRole="tab" accessibilityState={{ selected: as === key }} style={[styles.tab, as === key && styles.tabOn]}>
                <Icon size={14} color={as === key ? ink[900] : ink[500]} />
                <Text variant="caption" weight="bold" color={as === key ? ink[900] : ink[500]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginBottom: spacing.md },
  center: { textAlign: 'center' },
  switch: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.large, backgroundColor: slate[100] },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 48, paddingHorizontal: 4, borderRadius: radius.medium },
  tabOn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: zappy[100] },
});
