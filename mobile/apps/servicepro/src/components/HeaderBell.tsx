import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useListNotificationsQuery } from '@zappy/core/api';
import { Text } from '@zappy/ui/components';
import { colors, danger, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';

// The top-right bell: unread count at a glance, the notifications tab a tap away; refreshed live with every notification.
export function HeaderBell({ to }: { to: string }) {
  const router = useRouter();
  const { data } = useListNotificationsQuery({ page: 1, unreadOnly: false }, { pollingInterval: 120000 });
  const unread: number = data?.unread ?? 0;
  return (
    <Pressable onPress={() => router.push(to as never)} accessibilityRole="button" accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'} style={styles.btn}>
      <Bell size={18} color={ink[900]} />
      {unread > 0 ? (
        <View style={styles.badge}><Text variant="caption" weight="black" color="#fff" style={styles.count}>{unread > 99 ? '99+' : unread}</Text></View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  badge: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: danger[500], borderWidth: 2, borderColor: colors.surface },
  count: { fontSize: 10, lineHeight: 12 },
});
