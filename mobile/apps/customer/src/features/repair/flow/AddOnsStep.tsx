/**
 * Optional extras done on the same visit by the same provider (the website's
 * AddOnsStep). Priced by the server against this provider; a repair with none
 * skips the step so Back never lands on it.
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useRepairAddOnsQuery } from '@zappy/core/api';
import { formatPaise } from '@zappy/core/shared/money';
import { Button, Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { Shell, Spinner, flow } from './FlowChrome';
import type { Provider } from './repairRules';

interface AddOn { repairCode: string; name: string; description?: string; estimatedDurationMin?: number; warrantyDays?: number; totalPaise: number; isEstimate?: boolean }

export function AddOnsStep({ vertical, provider, repairCode, qualityCode, brandCode, modelCode, serviceMode, selected, onToggle, onContinue, onSkipStep }: {
  vertical: string; provider: Provider | null; repairCode?: string | null; qualityCode?: string | null; brandCode?: string; modelCode?: string; serviceMode: string;
  selected: string[]; onToggle: (code: string) => void; onContinue: () => void; onSkipStep: () => void;
}) {
  const { data, isLoading } = useRepairAddOnsQuery({
    vertical, repairCode: repairCode || undefined, brandCode, modelCode, qualityCode: qualityCode || undefined, serviceMode,
    shopId: provider?.shopId || undefined, workerId: provider?.workerId || undefined,
  }, { skip: !repairCode });
  const addOns: AddOn[] = data?.addOns || [];

  useEffect(() => {
    if (!repairCode || (!isLoading && data && !addOns.length)) onSkipStep();
  }, [repairCode, isLoading, data, addOns.length, onSkipStep]);

  if (isLoading || !addOns.length) return <Spinner />;
  const picked = new Set(selected);
  const extraPaise = addOns.reduce((sum, a) => (picked.has(a.repairCode) ? sum + a.totalPaise : sum), 0);

  return (
    <Shell>
      <View>
        <Text variant="heading3" weight="black">Anything else while they’re there?</Text>
        <Text variant="bodySmall" color={ink[500]}>Optional. Done on the same visit by the same provider.</Text>
      </View>
      {addOns.map((a) => {
        const on = picked.has(a.repairCode);
        const meta = [a.estimatedDurationMin ? `+${a.estimatedDurationMin} min` : '', a.warrantyDays ? `${a.warrantyDays}-day warranty` : ''].filter(Boolean).join(' · ');
        return (
          <Pressable key={a.repairCode} onPress={() => onToggle(a.repairCode)} android_ripple={RIPPLE} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
            style={[flow.card, styles.row, on && styles.on]}>
            <View style={[styles.box, on && styles.boxOn]}>{on ? <Check size={14} color="#fff" strokeWidth={3} /> : null}</View>
            <View style={flow.flex}>
              <Text variant="bodySmall" weight="bold">{a.name}</Text>
              {a.description ? <Text variant="caption" color={ink[500]}>{a.description}</Text> : null}
              {meta ? <Text variant="caption" color={ink[400]}>{meta}</Text> : null}
            </View>
            <Text variant="bodySmall" weight="black">{a.isEstimate ? '~' : '+'}{formatPaise(a.totalPaise)}</Text>
          </Pressable>
        );
      })}
      <Button label={extraPaise > 0 ? `Continue · +${formatPaise(extraPaise)}` : 'Continue without extras'} onPress={onContinue} fullWidth />
    </Shell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 2 },
  on: { borderColor: zappy[500], backgroundColor: zappy[50] },
  box: { width: 24, height: 24, borderRadius: radius.small, borderWidth: 2, borderColor: slate[300], alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  boxOn: { borderColor: zappy[500], backgroundColor: zappy[500] },
});
