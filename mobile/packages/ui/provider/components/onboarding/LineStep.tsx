/**
 * Pick the services inside a domain. A service that is not open yet says so
 * rather than being hidden, and "My service isn't listed" lets the provider
 * tell us what to open next.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, Plus } from 'lucide-react-native';
import { useProviderServiceLinesQuery, useProviderEnrolMutation } from '@zappy/core/api';
import { LoadingState, Text } from '../../../components';
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
  const [enrol, { isLoading: enrolling }] = useProviderEnrolMutation();
  if (isLoading) return <LoadingState />;
  const lines: Line[] = data?.lines || [];

  async function choose(line: Line) {
    if (line.myStatus) { onPick(line); return; }   // already started: go straight in
    try { await enrol({ lineCode: line.code }).unwrap(); onPick(line); }
    catch (err) { toast.error(errText(err, 'Could not start that service')); }
  }

  return (
    <View style={ob.shell}>
      {lines.map((l) => {
        const live = l.status === 'live';
        return (
          <Pressable key={l.code} onPress={() => live && choose(l)} disabled={!live || enrolling} android_ripple={live ? RIPPLE : undefined}
            accessibilityRole="button" accessibilityState={{ disabled: !live }} style={[ob.card, ob.row, !live && styles.closed]}>
            <ServiceThumb src={pictureOf(l.code, domain.code, l.imageUrl)} />
            <View style={[ob.flex, styles.gapXs]}>
              <Text variant="bodySmall" weight="bold">{l.name}</Text>
              {l.description ? <Text variant="caption" color={ink[500]}>{l.description}</Text> : null}
              {l.myStatus ? <StatusChip status={l.myStatus} /> : !live ? (
                <View style={styles.soon}><Text variant="caption" weight="bold" color={ink[500]}>Opening soon</Text></View>
              ) : null}
            </View>
            {live ? <ChevronRight size={16} color={slate[300]} /> : null}
          </Pressable>
        );
      })}
      <Pressable onPress={onRequest} style={ob.link} accessibilityRole="button">
        <Plus size={15} color={zappy[600]} /><Text variant="bodySmall" weight="semibold" color={zappy[600]}>My service isn't listed</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  closed: { opacity: 0.7 },
  gapXs: { gap: 4 },
  soon: { alignSelf: 'flex-start', backgroundColor: slate[100], borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
});
