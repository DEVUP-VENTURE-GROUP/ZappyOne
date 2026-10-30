import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, CircleCheck, CircleDashed, Clock3 } from 'lucide-react-native';
import { useProviderSetupJourneyQuery } from '@zappy/core/api';
import { Appear, Button, Text } from '@zappy/ui/components';
import { providerPath } from '@zappy/ui/provider/paths';
import { accent, colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

interface Step { key: string; label: string; done: boolean; waiting?: boolean; path: string }

// Where the shop is on the way to taking work: done, waiting on ZappyOne, and the one thing to do next. Gone once the shop is live.
export function SetupJourney() {
  const router = useRouter();
  const { data } = useProviderSetupJourneyQuery(undefined);
  if (!data || data.live) return null;
  const go = (path: string) => router.push(providerPath(path) as never);
  const steps = data.steps as Step[];
  return (
    <Appear>
      <View style={styles.card}>
        <Text variant="caption" weight="black" color={zappy[600]}>YOUR SETUP · {data.done} OF {data.total}</Text>
        <Text variant="body" weight="black">{data.next ? `Next: ${String(data.next.label).toLowerCase()}` : 'ZappyOne is checking your details'}</Text>
        <View style={styles.track}><View style={[styles.fill, { width: `${Math.round((data.done / data.total) * 100)}%` }]} /></View>
        {steps.map((s) => {
          const Icon = s.done ? CircleCheck : s.waiting ? Clock3 : CircleDashed;
          return (
            <Pressable key={s.key} onPress={() => go(s.path)} accessibilityRole="button" style={styles.row}>
              <Icon size={16} color={s.done ? success[600] : s.waiting ? accent[600] : slate[300]} />
              <Text variant="bodySmall" weight="semibold" color={s.done ? ink[500] : ink[900]} style={styles.flex}>{s.label}{s.waiting ? ' · in review' : ''}</Text>
            </Pressable>
          );
        })}
        {data.next ? <Button label="Continue" icon={<ArrowRight size={15} color="#fff" />} onPress={() => go(data.next.path)} fullWidth /> : null}
      </View>
    </Appear>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: slate[100] },
  fill: { height: '100%', backgroundColor: zappy[600] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36 },
  flex: { flex: 1, minWidth: 0 },
});
