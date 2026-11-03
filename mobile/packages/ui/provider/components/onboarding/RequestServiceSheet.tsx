/** A provider proposes a service we do not carry yet (the websites' RequestSheet): photos, where they work, and their own jobs and prices; on approval it becomes their menu, and several can be sent one after another. */
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useProviderRequestServiceLineMutation } from '@zappy/core/api';
import { Button, Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { FullScreenSheet } from '../../../components/common/FullScreenSheet';
import { PhotoTiles } from '../../../components/common/PhotoTiles';
import { errText } from '../../../lib/feedback';
import { colors, ink, success, zappy } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import type { Domain } from './DomainStep';

interface Job { name: string; includes: string; minutes: string; price: string; photos: string[] }
const blank = (): Job => ({ name: '', includes: '', minutes: '', price: '', photos: [] });
const MODES: [string, string][] = [['doorstep', "At the customer's place"], ['workshop', 'At my shop']];

export function RequestServiceSheet({ domain, onClose }: { domain: Domain | null; onClose: () => void }) {
  const [form, setForm] = useState({ proposedName: '', description: '', years: '', modes: ['doorstep'] });
  const [photos, setPhotos] = useState<string[]>([]);
  const [jobs, setJobs] = useState<Job[]>([blank()]);
  const [sent, setSent] = useState(0);
  const [submit, { isLoading }] = useProviderRequestServiceLineMutation();
  const filled = jobs.filter((j) => j.name.trim().length >= 2 && Number(j.minutes) >= 5 && Number(j.price) >= 1);
  const setJob = <K extends keyof Job>(i: number, k: K, v: Job[K] | ((cur: Job[K]) => Job[K])) =>
    setJobs((js) => js.map((j, n) => (n === i ? { ...j, [k]: typeof v === 'function' ? (v as (cur: Job[K]) => Job[K])(j[k]) : v } : j)));
  const toggleMode = (m: string) => setForm((f) => ({ ...f, modes: f.modes.includes(m) ? f.modes.filter((x) => x !== m) : [...f.modes, m] }));

  async function send() {
    try {
      const res: { opened?: { name: string } | null; warnings?: { message: string }[] } = await submit({
        domainCode: domain?.code || '', proposedName: form.proposedName.trim(), description: form.description.trim(),
        photos, serviceModes: form.modes, yearsExperience: form.years === '' ? null : Number(form.years),
        packages: filled.map((j) => ({
          name: j.name.trim(), minutes: Math.round(Number(j.minutes)), pricePaise: Math.round(Number(j.price) * 100),
          includes: j.includes.split(',').map((x) => x.trim()).filter((x) => x.length >= 2).slice(0, 8), photoKey: j.photos[0] || '',
        })),
      }).unwrap();
      setSent((n) => n + 1);
      // Live at once when it can be; otherwise what keeps it for ZappyOne, and anything worth fixing either way (the website's sheet).
      if (res.opened) toast.success(`${res.opened.name} is live. Customers near you can book it now.`);
      else toast.success('Sent. ZappyOne will check it and tell you.');
      for (const w of res.warnings || []) toast(w.message);
      setForm({ proposedName: '', description: '', years: '', modes: ['doorstep'] });
      setPhotos([]);
      setJobs([blank()]);
    } catch (err) { toast.error(errText(err, 'Could not send that')); }
  }

  return (
    <FullScreenSheet title="Tell us what you do" onClose={onClose}>
      <Text variant="caption" color={ink[500]}>
        Add your jobs with your prices and photos of your work. Once ZappyOne approves the service, it becomes your menu: finish verification and customers near you can book.
      </Text>
      {sent ? <Text variant="caption" weight="semibold" color={success[700]}>{sent} sent so far.</Text> : null}
      <TextInput value={form.proposedName} onChangeText={(v) => setForm((f) => ({ ...f, proposedName: v }))} maxLength={120} placeholder="Service name (e.g. Tailoring at home)"
        placeholderTextColor={ink[400]} style={styles.input} />
      <TextInput value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} multiline maxLength={1000} placeholder="What exactly do you do?"
        placeholderTextColor={ink[400]} style={[styles.input, styles.area]} />
      <Text variant="caption" weight="semibold" color={ink[700]}>Photos of your work</Text>
      <Text variant="caption" color={ink[500]}>The first photo is the cover customers see for this service.</Text>
      <PhotoTiles value={photos} onChange={setPhotos} max={6} folder="line-requests" />
      <Text variant="caption" weight="semibold" color={ink[700]}>Where you do it</Text>
      <View style={styles.wrap}>
        {MODES.map(([m, l]) => (
          <Pressable key={m} onPress={() => toggleMode(m)} accessibilityRole="checkbox" accessibilityState={{ checked: form.modes.includes(m) }} style={[styles.chip, form.modes.includes(m) && styles.chipOn]}>
            <Text variant="caption" weight="semibold" color={form.modes.includes(m) ? zappy[800] : ink[700]}>{l}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput value={form.years} onChangeText={(v) => setForm((f) => ({ ...f, years: v.replace(/\D/g, '').slice(0, 2) }))} keyboardType="number-pad" placeholder="Years doing it (e.g. 5)"
        placeholderTextColor={ink[400]} style={[styles.input, styles.half]} />
      <Text variant="caption" weight="semibold" color={ink[700]}>Your jobs and prices</Text>
      {jobs.map((j, i) => (
        <View key={i} style={styles.job}>
          <View style={styles.row}>
            <PhotoTiles value={j.photos} onChange={(v) => setJob(i, 'photos', v)} max={1} size={56} folder="line-requests" />
            {jobs.length > 1 ? <Pressable onPress={() => setJobs((js) => js.filter((_, n) => n !== i))} accessibilityRole="button" accessibilityLabel="Remove this job" hitSlop={8} style={styles.end}><X size={16} color={ink[400]} /></Pressable> : null}
          </View>
          <TextInput value={j.name} onChangeText={(v) => setJob(i, 'name', v)} maxLength={80} placeholder="Job, e.g. Hem trousers" accessibilityLabel="Job name" placeholderTextColor={ink[400]} style={styles.input} />
          <View style={styles.row}>
            <TextInput value={j.minutes} onChangeText={(v) => setJob(i, 'minutes', v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" placeholder="Minutes" accessibilityLabel="Minutes it takes" placeholderTextColor={ink[400]} style={[styles.input, styles.grow]} />
            <TextInput value={j.price} onChangeText={(v) => setJob(i, 'price', v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="Price ₹" accessibilityLabel="Your price in rupees" placeholderTextColor={ink[400]} style={[styles.input, styles.grow]} />
          </View>
          <TextInput value={j.includes} onChangeText={(v) => setJob(i, 'includes', v)} maxLength={300} placeholder="What's included, separated by commas" accessibilityLabel="What is included" placeholderTextColor={ink[400]} style={styles.input} />
        </View>
      ))}
      {jobs.length < 20 ? (
        <Pressable onPress={() => setJobs((js) => [...js, blank()])} accessibilityRole="button">
          <Text variant="caption" weight="semibold" color={zappy[600]}>+ Add another job</Text>
        </Pressable>
      ) : null}
      <Button label="Send request" onPress={send} loading={isLoading} disabled={form.proposedName.trim().length < 2 || !filled.length} fullWidth size="large" />
    </FullScreenSheet>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  area: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
  half: { width: '60%' },
  row: { flexDirection: 'row', gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  grow: { flex: 1 },
  end: { marginLeft: 'auto' },
  job: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { borderColor: zappy[500], backgroundColor: zappy[50] },
});
