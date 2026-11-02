/**
 * Rate the customer once the job is done (the websites' RateCustomerCard).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ShieldAlert, Star } from 'lucide-react-native';
import { useBlockJobCustomerMutation, useRateCustomerMutation } from '@zappy/core/api';
import { useAppSelector } from '@zappy/core/store/hooks';
import { CheckRow } from '../common/CheckRow';
import { rateOptions } from '@zappy/core/shared/jobFlows';
import { Button, Text } from '..';
import { type ApiErr, errText } from '../../lib/feedback';
import { colors, ink, slate, accent, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { toast } from '../Toast';
import { JobCard } from '../jobs/JobCard';

export function RateCustomerCard({ jobId, rated }: { jobId: string; rated?: boolean }) {
  const [rate, { isLoading }] = useRateCustomerMutation();
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const [block, setBlock] = useState(false);
  const [blockCustomer] = useBlockJobCustomerMutation();
  const isWorker = useAppSelector((st) => st.auth.role) === 'worker';
  if (rated || done) return <View style={styles.thanks}><Text variant="caption" color={ink[500]}>You rated this customer. Thank you.</Text></View>;
  const options = rateOptions(stars) as [string, string][];
  const toggle = (t: string) => setTags((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t]));

  async function send() {
    try {
      const r = await rate({ id: jobId, stars, tags, note: note.trim() }).unwrap();
      if (block) await blockCustomer({ id: jobId, reason: note.trim() }).unwrap().catch(() => toast.error('Rating saved, but the block did not go through'));
      toast.success(r.message);
      setDone(true);
    } catch (err) {
      if ((err as ApiErr)?.data?.code === 'ALREADY_RATED') setDone(true);
      toast.error(errText(err, 'Could not save the rating'));
    }
  }

  return (
    <JobCard>
      <Text variant="bodySmall" weight="bold">How was the customer?</Text>
      <Text variant="caption" color={ink[500]}>Private: they never see who rated them. It helps other pros, and ZappyOne steps in when someone is unsafe.</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => { setStars(n); setTags([]); }} accessibilityRole="button" accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`} hitSlop={4}>
            <Star size={32} color={n <= stars ? accent[500] : slate[300]} fill={n <= stars ? accent[500] : 'none'} />
          </Pressable>
        ))}
      </View>
      {stars > 0 ? (
        <>
          <View style={styles.wrap}>
            {options.map(([t, label]) => {
              const on = tags.includes(t);
              const unsafe = t === 'unsafe';
              return (
                <Pressable key={t} onPress={() => toggle(t)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                  style={[styles.chip, on && (unsafe ? styles.chipRed : styles.chipDark), !on && unsafe && styles.chipRedLine]}>
                  {unsafe ? <ShieldAlert size={12} color={on ? '#fff' : danger[600]} /> : null}
                  <Text variant="caption" weight="semibold" color={on ? '#fff' : unsafe ? danger[600] : ink[700]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          {stars <= 3 ? <TextInput value={note} onChangeText={setNote} maxLength={300} multiline placeholder="What happened? (optional, only ZappyOne reads this)" placeholderTextColor={ink[400]} style={styles.textArea} /> : null}
          {isWorker && stars <= 2 ? <CheckRow checked={block} onChange={setBlock}><Text variant="caption" weight="semibold" color={ink[700]}>Do not send me jobs from this customer again</Text></CheckRow> : null}
          <Button label="Send rating" onPress={send} loading={isLoading} fullWidth />
        </>
      ) : null}
    </JobCard>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, minHeight: 36, backgroundColor: colors.surface },
  chipDark: { borderColor: ink[900], backgroundColor: ink[900] },
  chipRed: { borderColor: danger[600], backgroundColor: danger[600] },
  chipRedLine: { borderColor: danger[100] },
  textArea: { minHeight: 64, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, padding: spacing.md, fontSize: 14, fontFamily: 'Figtree-Regular', color: ink[900], textAlignVertical: 'top' },
  thanks: { backgroundColor: slate[50], borderRadius: radius.medium, padding: spacing.md },
  stars: { flexDirection: 'row', gap: 6 },
});
