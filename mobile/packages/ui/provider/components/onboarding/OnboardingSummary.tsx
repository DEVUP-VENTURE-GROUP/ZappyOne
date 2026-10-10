/**
 * Where the provider stands: who they are, whether customers can see them yet
 * (and what is missing if not), and each service with its verification state.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, ChevronRight, Plus, Store, User } from 'lucide-react-native';
import { Button, Text } from '../../../components';
import { RIPPLE } from '../../../lib/feedback';
import { danger, ink, slate, success, zappy } from '../../../theme/colors';
import { StatusChip } from './StatusChip';
import { ob } from './onboardingStyles';

export interface Enrolment { _id: string; lineCode: string; status: string; reviewNote?: string; line?: { name?: string } }
export interface OnboardingStatus {
  providerKind?: string;
  profile?: { businessName?: string; name?: string };
  isLive?: boolean;
  nextStep?: { label: string } | null;
  storefront?: { key: string; label: string; done: boolean }[];
  enrolments: Enrolment[];
  repairVerticals?: string[];
}

export function OnboardingSummary({ status, onAddService, onOpenEnrolment }: {
  status: OnboardingStatus; onAddService: () => void; onOpenEnrolment: (e: Enrolment) => void;
}) {
  const router = useRouter();
  const shop = status.providerKind === 'shop';
  const name = status.profile?.businessName || status.profile?.name || 'Your account';
  const storefront = status.storefront || [];

  return (
    <View style={ob.shell}>
      <View style={[ob.card, ob.row]}>
        <View style={styles.avatar}>{shop ? <Store size={20} color={zappy[600]} /> : <User size={20} color={zappy[600]} />}</View>
        <View style={ob.flex}>
          <Text variant="body" weight="bold" numberOfLines={1}>{name}</Text>
          <Text variant="caption" color={ink[500]}>{shop ? 'Shop' : 'Independent technician'}</Text>
        </View>
      </View>

      {/* "Can customers see me?" Approval alone does not answer it, so the gap is named. */}
      {status.isLive ? (
        <View style={[ob.card, styles.live]}>
          <Text variant="caption" weight="black" color={success[700]}>YOU'RE LIVE</Text>
          <Text variant="bodySmall" weight="semibold" color={success[700]}>Customers can find and book you.</Text>
        </View>
      ) : (
        <View style={[ob.card, styles.notLive]}>
          <Text variant="caption" weight="black" color={zappy[700]}>NOT VISIBLE TO CUSTOMERS YET</Text>
          {status.nextStep ? <Text variant="bodySmall" weight="semibold" color={zappy[800]}>{status.nextStep.label}</Text> : null}
          {storefront.some((s) => !s.done) ? storefront.map((s) => (
            <View key={s.key} style={styles.todo}>
              <View style={[styles.tick, s.done ? styles.tickDone : styles.tickOpen]}>{s.done ? <Check size={10} color="#fff" strokeWidth={3} /> : null}</View>
              <Text variant="caption" weight={s.done ? 'regular' : 'semibold'} color={s.done ? ink[400] : zappy[800]} style={s.done ? styles.struck : undefined}>{s.label}</Text>
            </View>
          )) : null}
        </View>
      )}

      <Text variant="caption" weight="bold" color={ink[500]} style={ob.label}>YOUR SERVICES</Text>
      {!status.enrolments.length ? (
        <View style={[ob.card, styles.empty]}>
          <Text variant="bodySmall" weight="bold" color={ink[700]}>Nothing chosen yet</Text>
          <Text variant="caption" color={ink[400]}>Pick what you work on to start getting jobs.</Text>
        </View>
      ) : null}
      {status.enrolments.map((e) => (
        <Pressable key={e._id} onPress={() => onOpenEnrolment(e)} android_ripple={RIPPLE} accessibilityRole="button" style={[ob.card, ob.row]}>
          <View style={[ob.flex, styles.gapXs]}>
            <Text variant="bodySmall" weight="bold">{e.line?.name || e.lineCode}</Text>
            <StatusChip status={e.status} />
            {e.reviewNote && e.status === 'rejected' ? <Text variant="caption" color={danger[600]}>{e.reviewNote}</Text> : null}
          </View>
          <ChevronRight size={16} color={slate[300]} />
        </Pressable>
      ))}

      <Pressable onPress={onAddService} style={ob.link} accessibilityRole="button">
        <Plus size={15} color={zappy[600]} /><Text variant="bodySmall" weight="semibold" color={zappy[600]}>Add a service</Text>
      </Pressable>
      {status.repairVerticals?.length ? <Button label="Set up your pricing and stock" onPress={() => router.push('/provider/services' as never)} fullWidth size="large" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: zappy[50], alignItems: 'center', justifyContent: 'center' },
  live: { backgroundColor: success[50], borderColor: success[100] },
  notLive: { backgroundColor: zappy[50], borderColor: zappy[100] },
  todo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tick: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tickDone: { backgroundColor: success[500] },
  tickOpen: { backgroundColor: '#fff', borderWidth: 1, borderColor: zappy[200] },
  struck: { textDecorationLine: 'line-through' },
  empty: { alignItems: 'center', paddingVertical: 28 },
  gapXs: { gap: 4 },
});
