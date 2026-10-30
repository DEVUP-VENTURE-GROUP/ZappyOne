import { Pressable, StyleSheet, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight } from 'lucide-react-native';
import { useAppSelector } from '@zappy/core/store/hooks';
import { useMyJobs } from '@zappy/core/shared/useMyJobs';
import { Text } from '@zappy/ui/components';
import { accent, ink, success } from '@zappy/ui/theme/colors';

const TAB_BAR = 56;

// A live job follows the customer across the tabs, as Rapido's "Active order" tab does (the website's ActiveJobPill); Home has its own card.
export function ActiveJobPill() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const signedIn = useAppSelector((s) => s.auth.isAuthenticated && s.auth.role === 'user');
  const { current } = useMyJobs({ skip: !signedIn });
  if (!signedIn || !current || pathname === '/' || pathname.startsWith(current.href)) return null;
  const dot = current.needsYou ? accent[500] : success[500];
  return (
    <Pressable onPress={() => router.push(current.href as never)} accessibilityRole="button" accessibilityLabel={`Your ${current.title}: ${current.stage}. Open`}
      style={[styles.pill, { bottom: insets.bottom + TAB_BAR + 12 }]}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <View style={styles.text}>
        <Text variant="bodySmall" weight="bold" color="#FFFFFF" numberOfLines={1} style={styles.cap}>{current.needsYou ? 'Needs your approval' : current.title}</Text>
        <Text variant="caption" color="rgba(255,255,255,0.65)" numberOfLines={1}>{current.stage}</Text>
      </View>
      <ChevronRight size={16} color="rgba(255,255,255,0.7)" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { position: 'absolute', left: 0, maxWidth: '78%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 12, paddingRight: 14, borderTopRightRadius: 999, borderBottomRightRadius: 999, backgroundColor: ink[900], elevation: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { flexShrink: 1, minWidth: 0 },
  cap: { textTransform: 'capitalize' },
});
