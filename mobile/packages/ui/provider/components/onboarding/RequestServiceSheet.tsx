/** A provider proposes a service we do not carry yet, with the jobs they do and their prices; once ZappyOne approves it, customers can book it. */
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useProviderRequestServiceLineMutation } from '@zappy/core/api';
import { Button, Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { FullScreenSheet } from '../../../components/common/FullScreenSheet';
import { errText } from '../../../lib/feedback';
import { colors, ink, zappy } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import type { Domain } from './DomainStep';

interface Job { name: string; minutes: string; price: string }
const blank = (): Job => ({ name: '', minutes: '', price: '' });

export function RequestServiceSheet({ domain, onClose }: { domain: Domain | null; onClose: () => void }) {
  const [form, setForm] = useState({ proposedName: '', description: '' });
  const [jobs, setJobs] = useState<Job[]>([blank()]);
  const [submit, { isLoading }] = useProviderRequestServiceLineMutation();
  const filled = jobs.filter((j) => j.name.trim().length >= 2 && Number(j.minutes) >= 5 && Number(j.price) >= 1);
  const setJob = (i: number, k: keyof Job, v: string) => setJobs((js) => js.map((j, n) => (n === i ? { ...j, [k]: v } : j)));

  async function send() {
    try {
      await submit({ domainCode: domain?.code || '', ...form, packages: filled.map((j) => ({ name: j.name.trim(), minutes: Math.round(Number(j.minutes)), pricePaise: Math.round(Number(j.price) * 100) })) }).unwrap();
      toast.success("Sent. We'll review it and get back to you.");
      onClose();
    } catch (err) { toast.error(errText(err, 'Could not send that')); }
  }

  return (
    <FullScreenSheet title="Tell us what you do" onClose={onClose}>
      <Text variant="caption" color={ink[500]}>
        Add the jobs you do with your price. Once ZappyOne approves the service, you get verified for it and customers near you can book these jobs.
      </Text>
      <TextInput value={form.proposedName} onChangeText={(v) => setForm((f) => ({ ...f, proposedName: v }))} placeholder="Service name (e.g. Tailoring at home)"
        placeholderTextColor={ink[400]} style={styles.input} />
      <TextInput value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} multiline placeholder="What exactly do you do, and how long have you done it?"
        placeholderTextColor={ink[400]} style={[styles.input, styles.area]} />
      <Text variant="caption" weight="semibold" color={ink[700]}>Jobs and your prices</Text>
      {jobs.map((j, i) => (
        <View key={i} style={styles.row}>
          <TextInput value={j.name} onChangeText={(v) => setJob(i, 'name', v)} maxLength={80} placeholder="Job, e.g. Hem trousers" accessibilityLabel="Job name" placeholderTextColor={ink[400]} style={[styles.input, styles.grow]} />
          <TextInput value={j.minutes} onChangeText={(v) => setJob(i, 'minutes', v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="Min" accessibilityLabel="Minutes it takes" placeholderTextColor={ink[400]} style={[styles.input, styles.small]} />
          <TextInput value={j.price} onChangeText={(v) => setJob(i, 'price', v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="₹" accessibilityLabel="Your price in rupees" placeholderTextColor={ink[400]} style={[styles.input, styles.small]} />
        </View>
      ))}
      {jobs.length < 20 ? (
        <Pressable onPress={() => setJobs((js) => [...js, blank()])} accessibilityRole="button">
          <Text variant="caption" weight="semibold" color={zappy[600]}>+ Add another job</Text>
        </Pressable>
      ) : null}
      <Button label="Send request" onPress={send} loading={isLoading} disabled={!form.proposedName.trim()} fullWidth size="large" />
    </FullScreenSheet>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  area: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
  small: { width: 72 },
});
