/**
 * How the repair should happen (the website's ModeStep): always the same three
 * choices on screen. A repair that cannot be done one way shows that card
 * locked with the reason, so the customer sees the whole menu and learns why.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, HelpCircle, Home, Lock, Truck } from 'lucide-react-native';
import { formatPaise } from '@zappy/core/shared/money';
import { Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { accent, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { Diagnosis } from './DiagnoseStep';
import { Shell, flow } from './FlowChrome';
import { MODE_BLOCKED_REASON } from './repairRules';

export function ModeStep({ diagnosis, inspectionFeePaise, onPick }: { diagnosis: Diagnosis | null; inspectionFeePaise: number | null; onPick: (mode: string) => void }) {
  const allowed = diagnosis?.recommendations?.[0]?.allowedServiceModes || ['doorstep', 'workshop', 'pickup_repair'];
  const options = [
    { key: 'doorstep', title: 'Home Service', body: 'A technician comes to your home or office and repairs it there, usually in one visit.', Icon: Home, available: allowed.includes('doorstep') },
    { key: 'pickup_repair', title: 'Pickup & repair', body: 'We collect the device, repair it at the workshop, and return it to you.', Icon: Truck, available: allowed.includes('pickup_repair') || allowed.includes('workshop'), note: 'Pickup and return charges may apply.' },
    { key: 'diagnosis_only', title: 'Inspection', body: 'A technician inspects the device and gives you a written diagnosis. No repair yet.', Icon: HelpCircle, available: true, fee: inspectionFeePaise },
  ];
  return (
    <Shell>
      {diagnosis?.summary ? <View style={[flow.card, styles.summary]}><Text variant="caption" weight="medium" color={zappy[700]}>{diagnosis.summary}</Text></View> : null}
      {options.map((o) => {
        const Icon = o.available ? o.Icon : Lock;
        return (
          <Pressable key={o.key} onPress={() => o.available && onPick(o.key)} disabled={!o.available} android_ripple={o.available ? RIPPLE : undefined}
            accessibilityRole="button" accessibilityState={{ disabled: !o.available }} style={[flow.card, styles.option, !o.available && styles.locked]}>
            <View style={[styles.icon, { backgroundColor: o.available ? zappy[50] : slate[100] }]}><Icon size={18} color={o.available ? zappy[600] : ink[400]} /></View>
            <View style={flow.flex}>
              <Text variant="bodySmall" weight="bold" color={o.available ? ink[900] : ink[500]}>{o.title}</Text>
              <Text variant="caption" color={ink[500]}>{o.body}</Text>
              {o.available && o.note ? <Text variant="caption" color={accent[600]}>{o.note}</Text> : null}
              {o.available && o.fee != null ? (
                <Text variant="caption" weight="semibold" color={success[700]}>{o.fee > 0 ? `${formatPaise(o.fee)} inspection fee · adjusted against the repair if you go ahead` : 'Free inspection'}</Text>
              ) : null}
              {!o.available ? <Text variant="caption" weight="semibold" color={ink[400]}>Not for this repair: {MODE_BLOCKED_REASON[o.key]}</Text> : null}
            </View>
            {o.available ? <ChevronRight size={16} color={slate[300]} /> : null}
          </Pressable>
        );
      })}
    </Shell>
  );
}

const styles = StyleSheet.create({
  summary: { borderColor: zappy[100], backgroundColor: zappy[50] },
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  locked: { opacity: 0.6 },
  icon: { width: 40, height: 40, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center' },
});
