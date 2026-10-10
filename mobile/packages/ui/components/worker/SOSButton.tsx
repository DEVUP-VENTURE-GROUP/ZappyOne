/**
 * Hold for three seconds to send an SOS with the provider's position
 * (the websites' SOSButton). Sends at once; the server falls back to the last position.
 */
import React, { useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Heart, Phone, ShieldAlert } from 'lucide-react-native';
import { useTriggerSOSMutation } from '@zappy/core/api';
import { getBestPosition } from '@zappy/core/hooks/useBestPosition';
import { PET_EMERGENCY_CONTACTS, isPetJob } from '@zappy/core/shared/jobFlows';
import { Text } from '..';
import { RIPPLE } from '../../lib/feedback';
import { ink, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { toast } from '../Toast';
import { JobCard } from '../jobs/JobCard';

const HOLD_MS = 3000;

export function SOSButton({ jobId, kind, service }: { jobId: string; kind: string; service?: string }) {
  const [triggerSOS] = useTriggerSOSMutation();
  const [holding, setHolding] = useState(false);
  const [left, setLeft] = useState(3);
  const [triggered, setTriggered] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const pet = isPetJob(kind, service);

  function start() {
    if (triggered) return;
    setHolding(true);
    const t0 = Date.now();
    tick.current = setInterval(() => setLeft(Math.max(1, Math.ceil((HOLD_MS - (Date.now() - t0)) / 1000))), 200);
    timer.current = setTimeout(() => { stop(); void fire(); }, HOLD_MS);
  }
  function stop() {
    if (timer.current) clearTimeout(timer.current);
    if (tick.current) clearInterval(tick.current);
    setHolding(false); setLeft(3);
  }
  async function fire() {
    // Send even without a fix: the server uses the last known position.
    const here = await getBestPosition({ windowMs: 4000 }).catch(() => null);
    try {
      await triggerSOS({ jobId, lat: here?.lat, lng: here?.lng, type: pet ? 'pet_emergency' : 'worker_sos' }).unwrap();
      setTriggered(true);
      toast.error(pet ? 'SOS sent. Your emergency contact and support are told. Vet contacts are below.' : 'SOS sent. Your emergency contact and support are told.', { duration: 8000 });
    } catch {
      toast.error('SOS failed to send. Call 112 immediately.');
    }
  }

  return (
    <View style={styles.gap}>
      <Text variant="caption" weight="semibold" color={ink[500]}>Feeling unsafe or need urgent help?</Text>
      <View style={styles.row}>
        <Pressable onPress={() => Linking.openURL('tel:112')} android_ripple={RIPPLE} accessibilityRole="button" style={styles.call112}>
          <Phone size={14} color="#fff" /><Text variant="bodySmall" weight="bold" color="#fff">Call 112</Text>
        </Pressable>
        <Pressable onPressIn={start} onPressOut={stop} accessibilityRole="button" accessibilityLabel="Hold for three seconds to send SOS"
          style={[styles.sos, triggered ? styles.sosDone : null]}>
          {pet ? <Heart size={14} color={triggered ? danger[600] : '#fff'} /> : <ShieldAlert size={14} color={triggered ? danger[600] : '#fff'} />}
          <Text variant="bodySmall" weight="bold" color={triggered ? danger[600] : '#fff'}>
            {triggered ? 'SOS active' : holding ? `Keep holding… ${left}s` : 'Hold 3s for SOS'}
          </Text>
        </Pressable>
      </View>
      {triggered && pet ? (
        <JobCard tone="red">
          <Text variant="caption" weight="extrabold" color={danger[600]}>PET EMERGENCY CONTACTS</Text>
          {PET_EMERGENCY_CONTACTS.map((c: { label: string; number: string; hint: string }) => (
            <View key={c.number} style={styles.between}>
              <View style={styles.flex}><Text variant="caption" weight="bold">{c.label}</Text><Text variant="caption" color={ink[500]}>{c.hint}</Text></View>
              <Pressable onPress={() => Linking.openURL(`tel:${c.number.replace(/[^0-9+]/g, '')}`)} style={styles.petCall}>
                <Phone size={11} color={danger[600]} /><Text variant="caption" weight="bold" color={danger[600]}>{c.number}</Text>
              </Pressable>
            </View>
          ))}
        </JobCard>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  gap: { gap: spacing.sm },
  call112: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: ink[700], borderRadius: radius.medium, minHeight: 48 },
  sos: { flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: danger[600], borderRadius: radius.medium, minHeight: 48 },
  sosDone: { backgroundColor: danger[50], borderWidth: 1, borderColor: danger[100] },
  petCall: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: danger[100], borderRadius: radius.button, paddingHorizontal: spacing.sm, minHeight: 32 },
});
