/**
 * Build and send a repair quote: the repair, parts and labour in rupees,
 * and options for the customer to choose from (the website's QuoteBuilder).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Plus, Trash2, X } from 'lucide-react-native';
import { useSubmitRepairQuoteMutation, useRepairWorkCatalogQuery } from '@zappy/core/api';
import {
  repairAgreedPaise,
  quoteTotalPaise,
  quotePayload,
  quoteRepairOptions,
  QUOTE_LINE_KINDS,
  PART_GRADES,
  rupeesInput,
} from '@zappy/core/shared/jobFlows';
import { formatPaise } from '@zappy/core/shared/money';
import { Button, Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { JobCard } from '../../../components/jobs/JobCard';
import { errText } from '../../../lib/feedback';
import { colors, zappy, ink, slate, accent } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import { RepairPicker } from './RepairPicker';
import { ProofPhotos, photosSettled, readyKeys, type ProofPhoto } from '../../../components/common/ProofPhotos';

export const rupees = formatPaise;

export function QuoteBuilder({ bookingId, bookedRepair, vertical, additional, snapshot, onSent, onCancel }: {
  bookingId: string; bookedRepair: string | null; vertical?: string; additional: boolean; snapshot: Record<string, unknown>; onSent: () => void; onCancel: () => void;
}) {
  const [repairCode, setRepairCode] = useState(bookedRepair || '');
  const agreedPaise: number = repairAgreedPaise(snapshot);
  const [replace, setReplace] = useState(false);
  const [replaceReason, setReplaceReason] = useState('');
  const [summary, setSummary] = useState('');
  const [warrantyDays, setWarrantyDays] = useState('90');
  const [items, setItems] = useState([{ kind: 'part', label: '', priceRupees: '', quantity: 1 }]);
  const [submit, { isLoading }] = useSubmitRepairQuoteMutation();
  const [photos, setPhotos] = useState<ProofPhoto[]>([]);
  // Extra or replacement work goes with a photo of what was found (server repair quotes).
  const needsPhoto = additional || agreedPaise > 0;
  const { data: catalog, isLoading: loadingCatalog } = useRepairWorkCatalogQuery({ vertical }, { skip: !!bookedRepair });
  const total: number = quoteTotalPaise(items);
  const setItem = (idx: number, patch: object) => setItems((l) => l.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  async function send() {
    const { body, error } = quotePayload({ repairCode, summary, items, warrantyDays, additional, agreedPaise, replace, replaceReason, photos: readyKeys(photos) });
    if (error) { toast.error(error); return; }
    try {
      await submit({ id: bookingId, ...body }).unwrap();
      toast.success(additional ? 'Sent - the customer decides before you carry on' : 'Quote sent - waiting for the customer to approve');
      onSent();
    } catch (err) { toast.error(errText(err, 'Could not send the quote')); }
  }

  return (
    <JobCard>
      <View style={styles.between}>
        <Text variant="body" weight="bold">{additional ? 'Extra work found' : 'Raise a quote'}</Text>
        <Pressable onPress={onCancel} hitSlop={10} accessibilityLabel="Close"><X size={18} color={ink[400]} /></Pressable>
      </View>
      {agreedPaise > 0 ? (
        <View style={styles.soft}>
          <Text variant="caption" color={ink[700]}>The customer booked this at <Text variant="caption" weight="bold">{rupees(agreedPaise)}</Text>.</Text>
          <View style={styles.row}>
            {([[false, `Add on top of ${rupees(agreedPaise)}`], [true, 'Change the whole price']] as const).map(([v, label]) => (
              <Pressable key={label} onPress={() => setReplace(v)} style={[styles.toggle, replace === v && styles.toggleOn]}>
                <Text variant="caption" weight="semibold" color={replace === v ? zappy[700] : ink[700]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {replace ? (
            <TextInput value={replaceReason} onChangeText={setReplaceReason} multiline placeholder="Why the booked price no longer fits, e.g. a different part is needed" placeholderTextColor={ink[400]} style={styles.area} />
          ) : <Text variant="caption" color={ink[500]}>Enter only the extra parts or work. The booked price stays.</Text>}
        </View>
      ) : null}
      {additional ? (
        <View style={[styles.soft, { backgroundColor: accent[50] }]}>
          <Text variant="caption" color={accent[700]}>{agreedPaise && !replace
            ? 'Enter only what is extra. Work stops until the customer answers, and the clock pauses while it does.'
            : 'Include everything the customer is paying in total, not just the new part. Work stops until they answer, and the clock pauses while it does.'}</Text>
        </View>
      ) : null}
      {!bookedRepair ? (
        <View style={styles.gap}>
          <Text variant="caption" weight="bold">What will you fix?</Text>
          <RepairPicker value={repairCode} onChange={setRepairCode} placeholder={loadingCatalog ? 'Loading…' : 'Choose the repair'}
            options={quoteRepairOptions(catalog?.groups).map((r: { code: string; name: string; selected?: boolean }) => ({ value: r.code, label: `${r.name}${r.selected ? '' : ' (not in your list)'}` }))} />
        </View>
      ) : null}
      <View style={styles.gap}>
        <Text variant="caption" weight="bold">What did you find?</Text>
        <TextInput value={summary} onChangeText={setSummary} multiline placeholder="e.g. Panel and digitizer both failed; frame is intact." placeholderTextColor={ink[400]} style={styles.area} />
        <Text variant="caption" color={ink[400]}>The customer sees this word for word.</Text>
      </View>
      <View style={styles.gap}>
        <Text variant="caption" weight="bold">Charges</Text>
        {items.map((item, idx) => (
          <React.Fragment key={idx}>
          <View style={styles.line}>
            <RepairPicker value={item.kind} onChange={(v) => setItem(idx, { kind: v })} placeholder="Kind" options={QUOTE_LINE_KINDS.map((k: string) => ({ value: k, label: k }))} />
            <TextInput value={item.label} onChangeText={(v) => setItem(idx, { label: v })} placeholder="Description" placeholderTextColor={ink[400]} style={[styles.input, styles.flex]} />
            <View style={styles.price}>
              <Text variant="bodySmall" weight="semibold" color={ink[500]}>₹</Text>
              <TextInput value={item.priceRupees} onChangeText={(v) => setItem(idx, { priceRupees: rupeesInput(v) })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={ink[400]} style={styles.priceInput} accessibilityLabel="Price in rupees" />
            </View>
            {items.length > 1 ? <Pressable onPress={() => setItems((l) => l.filter((_, i) => i !== idx))} hitSlop={8} accessibilityLabel="Remove line"><Trash2 size={16} color={ink[400]} /></Pressable> : null}
          </View>
          {item.kind === 'part' ? (
            <View style={styles.grades} accessibilityRole="radiogroup" accessibilityLabel="What this part is">
              {(PART_GRADES as { key: string; label: string; hint: string }[]).map((g) => {
                const on = (item as { partGrade?: string }).partGrade === g.key;
                return (
                  <Pressable key={g.key} onPress={() => setItem(idx, { partGrade: g.key })} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[styles.grade, on && styles.gradeOn]}>
                    <Text variant="caption" weight="bold" color={on ? zappy[700] : ink[900]}>{g.label}</Text>
                    <Text variant="caption" color={ink[500]} numberOfLines={2}>{g.hint}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          </React.Fragment>
        ))}
        <Pressable onPress={() => setItems((l) => [...l, { kind: 'part', label: '', priceRupees: '', quantity: 1 }])} style={styles.row} hitSlop={6}>
          <Plus size={14} color={zappy[600]} /><Text variant="caption" weight="semibold" color={zappy[600]}>Add line</Text>
        </Pressable>
      </View>
      <View style={styles.gap}>
        <Text variant="caption" weight="bold">Warranty (days)</Text>
        <TextInput value={warrantyDays} onChangeText={(v) => setWarrantyDays(v.replace(/\D/g, ''))} keyboardType="number-pad" style={[styles.input, { width: 120 }]} />
      </View>
      {agreedPaise > 0 && !replace ? (
        <View style={styles.gapXs}>
          <View style={styles.between}><Text variant="caption" color={ink[700]}>Booked price</Text><Text variant="caption">{rupees(agreedPaise)}</Text></View>
          <View style={styles.between}><Text variant="caption" color={ink[700]}>Extra</Text><Text variant="caption">+ {rupees(total)}</Text></View>
        </View>
      ) : null}
      <View style={[styles.between, styles.soft]}>
        <Text variant="bodySmall" weight="semibold" color={ink[700]}>{agreedPaise > 0 && !replace ? 'New subtotal (before fees)' : 'Subtotal (before tax)'}</Text>
        <Text variant="heading3" weight="black">{rupees(agreedPaise > 0 && !replace ? agreedPaise + total : total)}</Text>
      </View>
      {needsPhoto ? <ProofPhotos photos={photos} onChange={setPhotos} folder="order-proof" max={4} title="Photo of what you found" hint="The customer sees it with the price and approves before you carry on." requiredNote="At least one photo is needed for extra work" /> : null}
      <Button label="Send quote to customer" onPress={send} loading={isLoading} disabled={needsPhoto && !photosSettled(photos)} fullWidth size="large" />
    </JobCard>
  );
}

const styles = StyleSheet.create({
  grades: { flexDirection: 'row', gap: spacing.xs, marginTop: -spacing.xs },
  grade: { flex: 1, padding: spacing.sm, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border },
  gradeOn: { borderColor: zappy[500], backgroundColor: zappy[50] },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  gap: { gap: spacing.sm },
  gapXs: { gap: 4 },
  soft: { backgroundColor: slate[50], borderRadius: radius.button, padding: spacing.md, gap: spacing.sm },
  toggle: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, padding: spacing.sm, backgroundColor: colors.surface, minHeight: 40, justifyContent: 'center' },
  toggleOn: { borderColor: zappy[600] },
  area: { minHeight: 72, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, padding: spacing.md, fontSize: 14, fontFamily: 'Figtree-Regular', color: ink[900], textAlignVertical: 'top', backgroundColor: colors.surface },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 14, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  price: { flexDirection: 'row', alignItems: 'center', width: 96, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.sm },
  priceInput: { flex: 1, fontSize: 14, fontFamily: 'Figtree-Regular', color: ink[900] },
});
