/**
 * Pick the services inside a domain (the websites' LineStep): tick every one
 * you do and add them together, documents asked once. A service that is not
 * open yet says so, and "My service isn't listed" asks ZappyOne to open it.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, ChevronRight, Plus } from 'lucide-react-native';
import { useProviderServiceLinesQuery, useProviderEnrolMutation } from '@zappy/core/api';
import { Button, LoadingState, Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { RIPPLE, errText } from '../../../lib/feedback';
import { ink, slate, zappy } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { ServiceThumb, pictureOf } from './ServiceThumb';
import { StatusChip } from './StatusChip';
import type { Domain } from './DomainStep';
import { ob } from './onboardingStyles';

export interface Line { code: string; name: string; description?: string; imageUrl?: string; status: string; myStatus?: string | null }

export function LineStep({ domain, onPick, onRequest }: { domain: Domain; onPick: (l: Line) => void; onRequest: () => void }) {
  const { data, isLoading } = useProviderServiceLinesQuery(domain.code);
  const [enrol] = useProviderEnrolMutation();
  const [picked, setPicked] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  if (isLoading) return <LoadingState />;
  const lines: Line[] = data?.lines || [];
  const toggle = (code: string) => setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]));

  async function addPicked() {
    setAdding(true);
    const started: string[] = [];
    for (const code of picked) {
      try { await enrol({ lineCode: code }).unwrap(); started.push(code); } catch (err) { toast.error(errText(err, 'Could not start one of them')); }
    }
    setAdding(false);
    if (!started.length) return;
    if (started.length > 1) toast.success(`${started.length} services added. Your documents carry over to each one.`);
    const first = lines.find((l) => l.code === started[0]);
    if (first) onPick(first);
  }

  return (
    <View style={ob.shell}>
      <Text variant="caption" color={ink[500]}>Tick every service you do. You send your documents once.</Text>
      {lines.map((l) => {
        const live = l.status === 'live';
        const on = picked.includes(l.code);
        return (
          <Pressable key={l.code} onPress={() => (!live ? null : l.myStatus ? onPick(l) : toggle(l.code))} disabled={!live || adding} android_ripple={live ? RIPPLE : undefined}
            accessibilityRole={l.myStatus ? 'button' : 'checkbox'} accessibilityState={{ disabled: !live, checked: l.myStatus ? undefined : on }}
            style={[ob.card, ob.row, !live && styles.closed, on && styles.on]}>
            <ServiceThumb src={pictureOf(l.code, domain.code, l.imageUrl)} />
            <View style={[ob.flex, styles.gapXs]}>
              <Text variant="bodySmall" weight="bold">{l.name}</Text>
              {l.description ? <Text variant="caption" color={ink[500]}>{l.description}</Text> : null}
              {l.myStatus ? <StatusChip status={l.myStatus} /> : !live ? (
                <View style={styles.soon}><Text variant="caption" weight="bold" color={ink[500]}>Opening soon</Text></View>
              ) : null}
            </View>
            {!live ? null : l.myStatus ? <ChevronRight size={16} color={slate[300]} /> : (
              <View style={[styles.box, on && styles.boxOn]}>{on ? <Check size={14} color="#fff" strokeWidth={3} /> : null}</View>
            )}
          </Pressable>
        );
      })}
      <Pressable onPress={onRequest} style={ob.link} accessibilityRole="button">
        <Plus size={15} color={zappy[600]} /><Text variant="bodySmall" weight="semibold" color={zappy[600]}>My service isn't listed</Text>
      </Pressable>
      {picked.length ? <Button label={`Add ${picked.length} service${picked.length === 1 ? '' : 's'}`} onPress={addPicked} loading={adding} fullWidth size="large" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  closed: { opacity: 0.7 },
  on: { borderColor: zappy[500], borderWidth: 2 },
  gapXs: { gap: 4 },
  soon: { alignSelf: 'flex-start', backgroundColor: slate[100], borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: slate[300], alignItems: 'center', justifyContent: 'center' },
  boxOn: { borderColor: zappy[600], backgroundColor: zappy[600] },
});
