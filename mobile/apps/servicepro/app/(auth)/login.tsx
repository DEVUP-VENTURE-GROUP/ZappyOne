import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Store, Wrench } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { WorkerLoginPage } from '@zappy/ui/provider/pages/WorkerLoginPage';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const ROLES = [
  { key: 'shop', label: 'Shop owner', Icon: Store },
  { key: 'worker', label: 'Shop worker', Icon: Wrench },
] as const;

/** The same shop, two ways in (the website's LoginRoleSwitch): the owner, or a technician of the shop. */
export default function LoginScreen() {
  const [as, setAs] = useState<'shop' | 'worker'>('shop');
  return (
    <WorkerLoginPage
      title="ZappyOne ServicePro"
      subtitle={as === 'shop' ? 'Sign in to run your shop' : 'Sign in as a technician of your shop'}
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
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, borderRadius: radius.medium },
  tabOn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: zappy[100] },
});
