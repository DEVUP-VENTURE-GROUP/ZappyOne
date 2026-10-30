/** What is left before the dashboard opens (the website's ProfileGate list). */
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, CircleDashed } from 'lucide-react-native';
import { useProviderProfileStatusQuery } from '@zappy/core/api';
import { Appear, Button, Text } from '@zappy/ui/components';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { MOBILE_PATH } from '../src/components/ProfileGate';

export default function FinishProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, refetch, isFetching } = useProviderProfileStatusQuery(undefined, { refetchOnMountOrArgChange: true });
  const missing: { key: string; label: string; path: string }[] = data?.missing || [];
  const done = (data?.total || 0) - missing.length;
  return (
    <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}>
      <Text variant="caption" weight="bold" color={zappy[600]}>STEP {done + 1} OF {data?.total || 1}</Text>
      <Text variant="pageTitle" weight="bold">Finish your profile to open your dashboard</Text>
      <Text variant="bodySmall" color={ink[500]}>Customers see these details before they book you, and ZappyOne checks them before you take work.</Text>
      <View style={styles.track}><View style={[styles.fill, { width: `${data?.total ? (done / data.total) * 100 : 0}%` }]} /></View>
      {missing.map((m, i) => (
        <Appear key={m.key} delay={i * 40}>
          <Pressable onPress={() => router.push((MOBILE_PATH[m.path] || m.path) as never)} accessibilityRole="button" style={styles.row}>
            <CircleDashed size={18} color={slate[300]} />
            <Text variant="bodySmall" weight="semibold" style={styles.flex}>{m.label}</Text>
            <ArrowRight size={16} color={ink[400]} />
          </Pressable>
        </Appear>
      ))}
      <Button label={data?.complete ? 'Open my dashboard' : 'I have filled these in'} variant={data?.complete ? 'primary' : 'outline'} loading={isFetching}
        onPress={() => (data?.complete ? router.replace('/' as never) : refetch())} fullWidth />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingHorizontal: spacing.base, backgroundColor: colors.background, flexGrow: 1 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: slate[100] },
  fill: { height: 8, backgroundColor: zappy[600] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  flex: { flex: 1 },
});
