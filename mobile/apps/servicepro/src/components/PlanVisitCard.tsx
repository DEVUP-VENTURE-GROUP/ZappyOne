import { useState } from 'react';
import { SOSButton } from '@zappy/ui/components/worker/SOSButton';
import { StyleSheet, TextInput, View } from 'react-native';
import { Check, KeyRound } from 'lucide-react-native';
import { useCompletePlanVisitMutation, useStartPlanVisitMutation } from '@zappy/core/api';
import { Button, Text } from '@zappy/ui/components';
import { ProofPhotos, photosSettled, readyKeys, type ProofPhoto } from '@zappy/ui/components/common/ProofPhotos';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, ink, success } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface Visit { _id: string; plan: string; day: string; at: string; status: string; address: string }
const dayLabel = (d: string) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const digits = (v: string) => v.replace(/\D/g, '');

// One plan visit, run at the door: the customer's code starts it, photos of the finished work close it.
export function VisitCard({ v, sos = false }: { v: Visit; sos?: boolean }) {
  const [start, { isLoading: starting }] = useStartPlanVisitMutation();
  const [complete, { isLoading: finishing }] = useCompletePlanVisitMutation();
  const [code, setCode] = useState('');
  const [photos, setPhotos] = useState<ProofPhoto[]>([]);
  return (
    <View style={styles.card}>
      <View style={styles.between}>
        <View style={styles.flex}><Text variant="bodySmall" weight="bold">{v.plan}</Text><Text variant="caption" color={ink[500]} numberOfLines={1}>{dayLabel(v.day)} · {new Date(v.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · {v.address}</Text></View>
        <Text variant="caption" weight="bold" color={v.status === 'done' ? success[600] : ink[500]}>{v.status}</Text>
      </View>
      {v.status === 'scheduled' ? (
        <View style={styles.pair}>
          <TextInput value={code} onChangeText={(t) => setCode(digits(t).slice(0, 4))} keyboardType="number-pad" placeholder="Code" accessibilityLabel="Customer's start code" placeholderTextColor={ink[400]} style={[styles.input, styles.code]} />
          <Button label="Start" icon={<KeyRound size={15} color="#fff" />} loading={starting} disabled={code.length !== 4} onPress={async () => { try { await start({ id: v._id, code }).unwrap(); toast.success('Visit started'); } catch (err) { toast.error(errText(err, 'Could not start')); } }} />
        </View>
      ) : null}
      {v.status === 'started' ? (
        <>
          {sos ? <SOSButton /> : null}
          <ProofPhotos photos={photos} onChange={setPhotos} folder="completion-photos" max={4} title="Photos of the finished work" />
          <Button label="Mark done" icon={<Check size={15} color="#fff" />} loading={finishing} disabled={!readyKeys(photos).length || !photosSettled(photos)} fullWidth
            onPress={async () => { try { await complete({ id: v._id, photoKeys: readyKeys(photos) }).unwrap(); toast.success('Visit done. The customer has the photos.'); } catch (err) { toast.error(errText(err, 'Could not finish')); } }} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  between: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  pair: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  flex: { flex: 1, minWidth: 0 },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  code: { flex: 1, textAlign: 'center', fontSize: 20, letterSpacing: 8 },
});
