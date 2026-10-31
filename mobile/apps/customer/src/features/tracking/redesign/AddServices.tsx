import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, Plus } from 'lucide-react-native';
import { useAddJobExtraMutation } from '@zappy/core/api';
import { rupeesOf } from '@zappy/core/shared/trackingSteps';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import { Section } from './Section';

type Item = { code: string; name: string; pricePaise: number; petIndex?: number | null; petName?: string | null };
type Added = { name: string; pricePaise: number };

// "Add to this booking" (the website's AddServices): the pro's own prices; anything added is paid in cash at the end.
export function AddServices({ jobId, extras, added = [], onAdded }: { jobId: string; extras?: { allowed?: boolean; items?: Item[] }; added?: Added[]; onAdded: () => void }) {
  const [asking, setAsking] = useState<string | null>(null);
  const [add, { isLoading }] = useAddJobExtraMutation();
  const items = extras?.allowed ? extras.items || [] : [];
  if (!items.length && !added.length) return null;
  const keyOf = (i: Item) => `${i.code}:${i.petIndex ?? ''}`;

  async function confirm(item: Item) {
    try {
      const r = await add({ id: jobId, code: item.code, petIndex: item.petIndex ?? null }).unwrap();
      toast.success(r.message);
      setAsking(null);
      onAdded();
    } catch (err) { toast.error(errText(err, 'Could not add that. Try again.')); }
  }

  return (
    <Section title="Add to this booking">
      <Text variant="bodySmall" color={ink[500]}>Your pro&apos;s price. Pay for anything you add in cash when the job is done.</Text>
      {added.map((a, i) => (
        <View key={`added-${i}`} style={[styles.row, styles.line]}>
          <View style={styles.done}><Check size={16} color={success[700]} /></View>
          <View style={styles.flex}>
            <Text variant="body">{a.name}</Text>
            <Text variant="caption" color={ink[500]}>Added. Pay in cash</Text>
          </View>
          <Text variant="bodySmall" weight="semibold">{rupeesOf(a.pricePaise)}</Text>
        </View>
      ))}
      {items.map((item) => {
        const open = asking === keyOf(item);
        return (
          <View key={keyOf(item)} style={styles.line}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text variant="body">{item.name}</Text>
                {item.petName ? <Text variant="caption" color={ink[500]}>For {item.petName}</Text> : null}
              </View>
              <Text variant="bodySmall" weight="semibold">{rupeesOf(item.pricePaise)}</Text>
              {!open ? (
                <Pressable onPress={() => setAsking(keyOf(item))} accessibilityRole="button" accessibilityLabel={`Add ${item.name}`} style={styles.add}>
                  <Plus size={15} color={zappy[700]} />
                  <Text variant="bodySmall" weight="bold" color={zappy[700]}>Add</Text>
                </Pressable>
              ) : null}
            </View>
            {open ? (
              <View style={styles.confirm}>
                <Text variant="bodySmall" color={ink[700]}>Add {item.name}? Any tax is added on top. You pay in cash at the end.</Text>
                <View style={styles.actions}>
                  <View style={styles.flex}><Button label="No" variant="outline" size="small" onPress={() => setAsking(null)} fullWidth /></View>
                  <View style={styles.flex}><Button label="Add" size="small" onPress={() => confirm(item)} loading={isLoading} fullWidth /></View>
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: slate[300] },
  flex: { flex: 1, minWidth: 0 },
  done: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECFDF3' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: slate[200] },
  confirm: { gap: spacing.sm, marginTop: spacing.sm, padding: spacing.md, borderRadius: 10, backgroundColor: slate[100] },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
