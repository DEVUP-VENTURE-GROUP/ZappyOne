/**
 * The exact build (the website's ConfigurationStep): two units of one model can take different
 * panels, so it is asked, not inferred.
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { HelpCircle } from 'lucide-react-native';
import { useRepairConfigurationsQuery } from '@zappy/core/api';
import { Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { ink, zappy } from '@zappy/ui/theme/colors';
import type { Coded } from './BrandStep';
import { Shell, Spinner, flow } from './FlowChrome';

interface Config extends Coded { displaySize?: number; displayResolution?: string; isTouch?: boolean; ramGb?: number; ramType?: string; storageGb?: number; storageType?: string }

/** The exact build: two units of one model can take different panels, so it is asked, not inferred. */
export function ConfigurationStep({ vertical, model, onPick, onSkip }: { vertical: string; model: Coded; onPick: (c: Config) => void; onSkip: () => void }) {
  const { data, isLoading } = useRepairConfigurationsQuery({ vertical, modelCode: model.code });
  const configs: Config[] = data?.configurations || [];
  useEffect(() => { if (!isLoading && !configs.length) onSkip(); }, [isLoading, configs.length, onSkip]);
  if (isLoading || !configs.length) return <Spinner />;
  return (
    <Shell>
      <Text variant="caption" color={ink[500]} style={flow.label}>Same model, different builds. The screen and memory that fit depend on which one you own; pick the closest match, and the technician confirms it on arrival.</Text>
      {configs.map((c) => (
        <Pressable key={c.code} onPress={() => onPick(c)} android_ripple={RIPPLE} accessibilityRole="button" style={flow.card}>
          <Text variant="bodySmall" weight="semibold">{c.name}</Text>
          <View style={styles.specs}>
            {c.displaySize ? <Text variant="caption" color={ink[500]}>{c.displaySize}" {c.displayResolution}{c.isTouch ? ' touch' : ''}</Text> : null}
            {c.ramGb ? <Text variant="caption" color={ink[500]}>{c.ramGb}GB {c.ramType}</Text> : null}
            {c.storageGb ? <Text variant="caption" color={ink[500]}>{c.storageGb}GB {c.storageType}</Text> : null}
          </View>
        </Pressable>
      ))}
      <Pressable onPress={onSkip} style={flow.link}><HelpCircle size={15} color={zappy[600]} /><Text variant="bodySmall" weight="semibold" color={zappy[600]}>I'm not sure which one I have</Text></Pressable>
    </Shell>
  );
}

const styles = StyleSheet.create({
  specs: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, marginTop: 4 },
});
