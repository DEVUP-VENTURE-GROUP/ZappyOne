/**
 * Which makes they handle. First because a provider answers it instantly, and
 * because it is the same first question the customer is asked.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { useRepairBrandsQuery } from '@zappy/core/api';
import { ErrorState, LoadingState, Text } from '../../../components';
import { errText } from '../../../lib/feedback';
import { BrandLogo } from '../../../components/common/BrandLogo';
import { colors, ink, slate, zappy } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import { StepShell } from './StepShell';

interface Brand { code: string; name: string; logoUrl?: string }

export function BrandsStep({ vertical, selected, onChange, onNext }: { vertical: string; selected: string[]; onChange: (codes: string[]) => void; onNext: () => void }) {
  const { data, isLoading, isError, error, refetch } = useRepairBrandsQuery(vertical);
  // The server's own reason, so a failure says what is wrong rather than always blaming the internet.
  if (isError && !data) return <ErrorState title="This did not load" message={errText(error, 'Check your internet and try again.')} onRetry={refetch} />;
  if (isLoading) return <LoadingState />;
  const brands: Brand[] = data?.brands || [];
  const chosen = new Set(selected);
  const all = brands.length > 0 && selected.length === brands.length;
  // No brand list from ZappyOne for this service yet: nothing to pick, so the pro goes on to their own work and prices.
  const none = brands.length === 0;

  return (
    <StepShell title="Which brands do you work on?" hint="Customers see these on your profile. You can change them any time."
      onNext={onNext} canNext={none || selected.length > 0} nextLabel={none ? 'Continue' : selected.length ? `Continue with ${selected.length}` : 'Pick at least one'}>
      {none ? <Text variant="body" color={ink[500]}>No brand list for this service yet. Continue and set up the work you do and your prices.</Text> : null}
      <Pressable onPress={() => onChange(all ? [] : brands.map((b) => b.code))} hitSlop={8} accessibilityRole="button" style={styles.selectAll}>
        <Text variant="caption" weight="bold" color={zappy[600]}>{all ? 'Clear all' : 'Select all brands'}</Text>
      </Pressable>
      <View style={styles.grid}>
        {brands.map((b) => {
          const on = chosen.has(b.code);
          return (
            <Pressable key={b.code} onPress={() => onChange(on ? selected.filter((c) => c !== b.code) : [...selected, b.code])}
              accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={b.name} style={[styles.tile, on && styles.tileOn]}>
              <View style={styles.logo}><BrandLogo name={b.name} url={b.logoUrl} active={on} /></View>
              <Text variant="caption" weight="bold" color={on ? zappy[700] : ink[700]} numberOfLines={2} style={styles.center}>{b.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </StepShell>
  );
}

const styles = StyleSheet.create({
  selectAll: { alignSelf: 'flex-start', paddingHorizontal: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { width: '31.5%', alignItems: 'center', gap: 6, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: slate[200], backgroundColor: colors.surface },
  tileOn: { borderColor: zappy[500], backgroundColor: zappy[50] },
  logo: { height: 40, width: '100%', alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
