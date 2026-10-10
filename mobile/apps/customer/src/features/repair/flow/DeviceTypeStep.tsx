/**
 * Which kind of machine (the website's DeviceTypeStep): only the types this brand makes,
 * and nothing asked when there is just one.
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Laptop } from 'lucide-react-native';
import { useRepairProductTypesQuery } from '@zappy/core/api';
import { Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { Coded } from './BrandStep';
import { Shell, Spinner, flow } from './FlowChrome';

/** Which kind of machine; only the types this brand makes, and none asked when there is one. */
export function DeviceTypeStep({ vertical, brand, onPick, onAuto }: { vertical: string; brand: Coded | null; onPick: (t: Coded) => void; onAuto: (t: Coded | null) => void }) {
  const { data, isLoading } = useRepairProductTypesQuery(brand?.code ? { vertical, brandCode: brand.code } : vertical);
  const types: Coded[] = data?.productTypes || [];
  const only = !isLoading && types.length === 1 ? types[0] : null;
  const none = !isLoading && types.length === 0;
  useEffect(() => { if (only) onAuto(only); else if (none) onAuto(null); }, [only, none]); // eslint-disable-line react-hooks/exhaustive-deps
  if (isLoading || only || none) return <Spinner />;
  return (
    <Shell>
      <View style={styles.grid2}>
        {types.map((t) => (
          <Pressable key={t.code} onPress={() => onPick(t)} android_ripple={RIPPLE} accessibilityRole="button" style={[flow.card, styles.half]}>
            <View style={styles.typeIcon}><Laptop size={17} color={zappy[600]} /></View>
            <Text variant="bodySmall" weight="bold">{t.name}</Text>
            {t.description ? <Text variant="caption" color={ink[400]}>{t.description}</Text> : null}
          </Pressable>
        ))}
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  half: { width: '48.5%' },
  typeIcon: { width: 36, height: 36, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
});
