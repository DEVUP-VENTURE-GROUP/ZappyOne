/**
 * Which brand: the popular ones first, then all, and a way to tell us a missing one (the website's BrandStep).
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { HelpCircle } from 'lucide-react-native';
import { useRepairBrandsQuery } from '@zappy/core/api';
import { Text } from '@zappy/ui/components';
import { BrandLogo } from '@zappy/ui/components/common/BrandLogo';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { ink, zappy } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import { MissingItemSheet } from './CatalogRequestSheets';
import { Shell, Spinner, flow } from './FlowChrome';

export interface Coded { code: string; name: string; description?: string; logoUrl?: string }

function Tile({ b, onPick }: { b: Coded; onPick: (b: Coded) => void }) {
  return (
    <Pressable onPress={() => onPick(b)} android_ripple={RIPPLE} accessibilityRole="button" accessibilityLabel={b.name} style={[flow.card, styles.brand]}>
      <View style={styles.logo}><BrandLogo name={b.name} url={b.logoUrl} height={32} /></View>
      <Text variant="caption" weight="semibold" numberOfLines={2} style={styles.center}>{b.name}</Text>
    </Pressable>
  );
}

export function BrandStep({ vertical, onPick }: { vertical: string; onPick: (b: Coded) => void }) {
  const { data, isLoading } = useRepairBrandsQuery(vertical);
  const [missing, setMissing] = useState(false);
  if (isLoading) return <Spinner />;
  const brands: Coded[] = data?.brands || [];
  const popular: Coded[] = data?.popular || [];
  const rest = brands.filter((b) => !popular.some((p) => p.code === b.code));
  return (
    <Shell>
      {missing ? <MissingItemSheet kind="brand" onClose={() => setMissing(false)} /> : null}
      {popular.length ? <Text variant="caption" weight="bold" color={ink[500]} style={flow.label}>POPULAR BRANDS</Text> : null}
      {popular.length ? <View style={styles.grid}>{popular.map((b) => <Tile key={b.code} b={b} onPick={onPick} />)}</View> : null}
      {rest.length ? <Text variant="caption" weight="bold" color={ink[500]} style={flow.label}>ALL BRANDS</Text> : null}
      {rest.length ? <View style={styles.grid}>{rest.map((b) => <Tile key={b.code} b={b} onPick={onPick} />)}</View> : null}
      <Pressable onPress={() => setMissing(true)} style={flow.link}><HelpCircle size={15} color={zappy[600]} /><Text variant="bodySmall" weight="semibold" color={zappy[600]}>Can't find your brand?</Text></Pressable>
    </Shell>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  brand: { width: '31.5%', minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm },
  logo: { height: 40, width: '100%', alignItems: 'center', justifyContent: 'center' },
});
