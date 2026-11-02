import React, { useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock3, Eye, ImageIcon, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react-native';
import {
  useProviderMenuQuery, useSaveProviderMenuItemMutation, useRemoveProviderMenuItemMutation,
  useAdjustProviderMenuMutation, useStartMenuFromSamplesMutation,
} from '@zappy/core/api';
import { Button, LoadingState, Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { PhotoTiles } from '../../../components/common/PhotoTiles';
import { errText } from '../../../lib/feedback';
import { colors, ink, slate, zappy } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import { StepShell } from '../setup/StepShell';

interface MenuType { code: string; name: string }
interface MenuItem {
  repairCode: string; name: string; own: boolean; offered: boolean; includes: string[]; minutes: number | null;
  photoKey: string; photoUrl: string | null; prices: Record<string, number | null>; suggested: Record<string, number | null>;
}
interface Menu { types: MenuType[]; items: MenuItem[]; tips: string[] }

const rupees = (p: number | null | undefined) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;
const toRupees = (p: number | null | undefined) => (p == null ? '' : String(Math.round(p / 100)));
const COMMON_INCLUDES = ['Tools and materials', 'Clean-up after the work', 'Before and after photos'];

// The provider's own menu for one fixed-price service (the websites' MenuEditor): keep or drop sample jobs, add their own, a price per option, live as they save.
export function MenuEditor({ vertical, onBack, onNext }: { vertical: string; onBack?: () => void; onNext: () => void }) {
  const { data, isLoading } = useProviderMenuQuery(vertical);
  const [startSamples, { isLoading: starting }] = useStartMenuFromSamplesMutation();
  const [adjust, { isLoading: adjusting }] = useAdjustProviderMenuMutation();
  const [editing, setEditing] = useState<Partial<MenuItem> | null>(null);
  const [pct, setPct] = useState('');
  const [preview, setPreview] = useState(false);
  const menu = data as Menu | undefined;
  if (isLoading || !menu) return <LoadingState />;
  const offered = menu.items.filter((i) => i.offered);
  const more = menu.items.filter((i) => !i.offered && !i.own);
  const allIncludes = [...new Set([...menu.items.flatMap((i) => i.includes), ...COMMON_INCLUDES])];

  async function useSamples() {
    try { await startSamples({ vertical }).unwrap(); toast.success('Sample jobs added at suggested prices. Change any price, or remove a job.'); } catch (e) { toast.error(errText(e, 'Could not add the samples')); }
  }
  async function applyPct() {
    try { await adjust({ vertical, pct: Number(pct) }).unwrap(); toast.success(`All prices changed by ${pct}%`); setPct(''); } catch (e) { toast.error(errText(e, 'Could not change the prices')); }
  }

  return (
    <>
      <StepShell title="Your menu" hint="Customers near you book from this. Every change is live as soon as you save." onBack={onBack} onNext={onNext} canNext={offered.length > 0}>
        {menu.tips.length ? (
          <View style={styles.wrap}>{menu.tips.map((t) => <View key={t} style={styles.tip}><Text variant="caption" weight="semibold" color="#92400E">{t}</Text></View>)}</View>
        ) : null}

        {!offered.length && more.length ? (
          <View style={styles.start}>
            <View style={styles.row}>
              <View style={styles.startIcon}><Sparkles size={18} color={zappy[700]} /></View>
              <View style={styles.flex}>
                <Text variant="bodySmall" weight="bold">Start with {more.length} ready jobs</Text>
                <Text variant="caption" color={ink[700]}>Added at suggested starting prices. Then change any price or remove what you do not do.</Text>
              </View>
            </View>
            <View style={styles.row}>
              <Button label="Use these jobs" size="small" onPress={useSamples} loading={starting} />
              <Button label="Add my own job" size="small" variant="outline" onPress={() => setEditing({})} />
            </View>
          </View>
        ) : null}

        {offered.length ? (
          <Pressable onPress={() => setPreview((p) => !p)} accessibilityRole="button" accessibilityState={{ selected: preview }} style={styles.row}>
            <Eye size={14} color={zappy[700]} /><Text variant="caption" weight="bold" color={zappy[700]}>{preview ? 'Back to editing' : 'Preview as a customer'}</Text>
          </Pressable>
        ) : null}

        {preview ? <CustomerPreview items={offered} types={menu.types} /> : null}

        {!preview && offered.map((item) => (
          <Pressable key={item.repairCode} onPress={() => setEditing(item)} accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} style={styles.card}>
            <View style={styles.thumb}>
              {item.photoUrl ? <Image source={{ uri: item.photoUrl }} style={StyleSheet.absoluteFill} /> : <ImageIcon size={20} color={slate[300]} />}
            </View>
            <View style={[styles.flex, styles.gapXs]}>
              <Text variant="bodySmall" weight="bold" numberOfLines={2}>{item.name}{item.own ? '  · Your job' : ''}</Text>
              <View style={styles.meta}>
                {item.minutes ? <View style={styles.row}><Clock3 size={12} color={ink[500]} /><Text variant="caption" color={ink[500]}>{item.minutes} min</Text></View> : null}
                <Text variant="caption" weight="semibold" color={ink[700]}>
                  {menu.types.filter((t) => item.prices[t.code] != null).map((t) => `${menu.types.length > 1 ? `${t.name} ` : ''}${rupees(item.prices[t.code])}`).join(' · ')}
                </Text>
              </View>
              {item.includes.length ? <Text variant="caption" color={ink[500]} numberOfLines={1}>Includes {item.includes.join(', ')}</Text> : null}
            </View>
            <Pencil size={16} color={ink[500]} />
          </Pressable>
        ))}

        {!preview && offered.length ? (
          <View style={styles.wrap}>
            <Button label="Add a job" size="small" variant="outline" icon={<Plus size={15} color={ink[900]} />} onPress={() => setEditing({})} />
            <View style={styles.pct}>
              <Text variant="caption" weight="semibold" color={ink[500]}>All prices</Text>
              <TextInput value={pct} onChangeText={(v) => setPct(v.replace(/[^\d-]/g, '').slice(0, 4))} placeholder="+10" keyboardType="numbers-and-punctuation" accessibilityLabel="Change all prices by percent" placeholderTextColor={ink[400]} style={styles.pctInput} />
              <Text variant="caption" weight="semibold" color={ink[500]}>%</Text>
              <Button label="Apply" size="small" onPress={applyPct} loading={adjusting} disabled={!pct || Number(pct) === 0} />
            </View>
          </View>
        ) : null}

        {!preview && offered.length && more.length ? (
          <View style={styles.gapSm}>
            <Text variant="caption" weight="bold" color={ink[400]}>MORE JOBS YOU CAN ADD</Text>
            <View style={styles.wrap}>
              {more.map((item) => (
                <Pressable key={item.repairCode} onPress={() => setEditing({ ...item, prices: item.suggested })} accessibilityRole="button" style={styles.chip}>
                  <Plus size={13} color={ink[700]} /><Text variant="caption" weight="semibold" color={ink[700]}>{item.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

      </StepShell>
      {editing ? <ItemSheet vertical={vertical} types={menu.types} item={editing} suggestions={allIncludes} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

// The menu the way a customer sees it on the storefront: photo, what is included, time and the lowest price.
function CustomerPreview({ items, types }: { items: MenuItem[]; types: MenuType[] }) {
  return (
    <View style={styles.preview}>
      {items.map((item, i) => {
        const shown = types.map((t) => item.prices[t.code]).filter((p): p is number => p != null);
        return (
          <View key={item.repairCode} style={[styles.previewRow, i > 0 && styles.previewLine]}>
            <View style={[styles.flex, styles.gapXs]}>
              <Text variant="bodySmall" weight="bold">{item.name}</Text>
              <Text variant="caption" weight="semibold">{shown.length > 1 ? 'from ' : ''}{rupees(Math.min(...shown))}{item.minutes ? `  ·  about ${item.minutes} min` : ''}</Text>
              {item.includes.length ? <Text variant="caption" color={ink[500]}>Includes {item.includes.join(' · ')}</Text> : null}
            </View>
            <View style={styles.previewPhoto}>
              {item.photoUrl ? <Image source={{ uri: item.photoUrl }} style={StyleSheet.absoluteFill} /> : null}
              <View style={styles.previewBook}><Text variant="caption" weight="bold" color={zappy[700]}>Book</Text></View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// One job: name for their own, photo, what is included, time and a price per option; the first price fills the rest in proportion.
function ItemSheet({ vertical, types, item, suggestions, onClose }: { vertical: string; types: MenuType[]; item: Partial<MenuItem>; suggestions: string[]; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const isNew = !item.repairCode;
  const named = isNew || !!item.own;
  const [name, setName] = useState(item.name || '');
  const [photos, setPhotos] = useState<string[]>(item.photoKey ? [item.photoKey] : []);
  const [includes, setIncludes] = useState<string[]>(item.includes || []);
  const [draft, setDraft] = useState('');
  const [minutes, setMinutes] = useState(item.minutes ? String(item.minutes) : '');
  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(types.map((t) => [t.code, toRupees(item.prices?.[t.code])])));
  const [save, { isLoading: saving }] = useSaveProviderMenuItemMutation();
  const [remove, { isLoading: removing }] = useRemoveProviderMenuItemMutation();
  const ratio = useMemo(() => {
    const base = item.suggested?.[types[0]?.code];
    return Object.fromEntries(types.map((t) => [t.code, base && item.suggested?.[t.code] ? (item.suggested[t.code] as number) / base : 1]));
  }, [item, types]);
  const priced = Object.values(prices).filter((v) => Number(v) >= 1).length;

  function addInclude(text: string) {
    const t = text.trim();
    if (t.length < 2 || includes.includes(t) || includes.length >= 8) return;
    setIncludes((l) => [...l, t]);
    setDraft('');
  }
  function fillFrom(code: string) {
    const first = Number(prices[code]);
    if (!(first >= 1) || code !== types[0]?.code) return;
    setPrices((p) => Object.fromEntries(types.map((t) => [t.code, p[t.code] || String(Math.round(first * ratio[t.code]))])));
  }
  async function submit() {
    try {
      await save({
        vertical, repairCode: item.repairCode || null, name: name.trim(), includes, photoKey: photos[0] || '', minutes: Number(minutes) || null,
        prices: Object.fromEntries(types.map((t) => [t.code, Number(prices[t.code]) >= 1 ? Math.round(Number(prices[t.code]) * 100) : null])),
      }).unwrap();
      toast.success(isNew ? 'Added to your menu' : 'Saved. Live now.');
      onClose();
    } catch (e) { toast.error(errText(e, 'Could not save')); }
  }
  async function drop() {
    try { await remove({ vertical, repairCode: item.repairCode }).unwrap(); toast.success('Removed from your menu'); onClose(); } catch (e) { toast.error(errText(e, 'Could not remove')); }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.sheetHead}>
          <Text variant="heading3" weight="extrabold" style={styles.flex} numberOfLines={1}>{isNew ? 'Add a job' : item.name}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}><X size={20} color={ink[500]} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          {named ? (
            <View style={styles.gapXs}>
              <Text variant="caption" weight="semibold" color={ink[700]}>Job name</Text>
              <TextInput value={name} onChangeText={setName} maxLength={80} placeholder="e.g. Fridge inside clean" placeholderTextColor={ink[400]} style={styles.input} />
            </View>
          ) : null}
          <View style={styles.gapXs}>
            <Text variant="caption" weight="semibold" color={ink[700]}>Photo of your work</Text>
            <PhotoTiles value={photos} onChange={setPhotos} previews={item.photoKey && item.photoUrl ? { [item.photoKey]: item.photoUrl } : {}} max={1} folder="menu" />
          </View>
          <View style={styles.gapXs}>
            <Text variant="caption" weight="semibold" color={ink[700]}>What's included</Text>
            <View style={styles.wrap}>
              {includes.map((t) => (
                <Pressable key={t} onPress={() => setIncludes((l) => l.filter((x) => x !== t))} accessibilityRole="button" accessibilityLabel={`Remove ${t}`} style={styles.included}>
                  <Text variant="caption" weight="semibold" color={zappy[800]}>{t}</Text><X size={12} color={zappy[800]} />
                </Pressable>
              ))}
            </View>
            <View style={styles.row}>
              <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={() => addInclude(draft)} maxLength={60} placeholder="e.g. Mopping all rooms" placeholderTextColor={ink[400]} style={[styles.input, styles.flex]} returnKeyType="done" />
              <Button label="Add" size="small" variant="outline" onPress={() => addInclude(draft)} />
            </View>
            <View style={styles.wrap}>
              {suggestions.filter((s) => !includes.includes(s)).slice(0, 8).map((s) => (
                <Pressable key={s} onPress={() => addInclude(s)} accessibilityRole="button" style={styles.chip}><Text variant="caption" color={ink[500]}>+ {s}</Text></Pressable>
              ))}
            </View>
          </View>
          <View style={styles.gapXs}>
            <Text variant="caption" weight="semibold" color={ink[700]}>Time it takes (minutes)</Text>
            <TextInput value={minutes} onChangeText={(v) => setMinutes(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" placeholder="e.g. 60" placeholderTextColor={ink[400]} style={[styles.input, styles.short]} />
          </View>
          <View style={styles.gapXs}>
            <Text variant="caption" weight="semibold" color={ink[700]}>Your price{types.length > 1 ? ' for each size' : ''}</Text>
            {types.length > 1 ? <Text variant="caption" color={ink[500]}>Type the first price and the rest fill in. Leave one empty if you do not do that size.</Text> : null}
            <View style={styles.wrap}>
              {types.map((t) => (
                <View key={t.code} style={styles.priceBox}>
                  {types.length > 1 ? <Text variant="caption" weight="semibold" color={ink[500]}>{t.name}</Text> : null}
                  <View style={styles.priceField}>
                    <Text variant="bodySmall" weight="semibold" color={ink[400]}>₹</Text>
                    <TextInput value={prices[t.code]} onChangeText={(v) => setPrices((p) => ({ ...p, [t.code]: v.replace(/\D/g, '').slice(0, 6) }))} onBlur={() => fillFrom(t.code)}
                      keyboardType="number-pad" accessibilityLabel={`Price for ${t.name}`} style={styles.priceInput} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
        <View style={styles.row}>
          {!isNew && item.offered ? <Button label="Remove" variant="dangerGhost" icon={<Trash2 size={15} color="#B42318" />} onPress={drop} loading={removing} /> : null}
          <Button label={isNew ? 'Add to my menu' : 'Save'} onPress={submit} loading={saving} disabled={!priced || (named && name.trim().length < 2)} style={styles.flex} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  gapXs: { gap: 4 },
  gapSm: { gap: spacing.sm },
  tip: { backgroundColor: '#FFFBEB', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
  start: { gap: spacing.md, padding: spacing.md, borderRadius: radius.medium, borderWidth: 1, borderColor: zappy[200], backgroundColor: zappy[50] },
  startIcon: { width: 40, height: 40, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  thumb: { width: 64, height: 64, borderRadius: radius.button, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.sm },
  pct: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingLeft: spacing.sm, paddingRight: 4, paddingVertical: 4, backgroundColor: colors.surface },
  pctInput: { width: 44, textAlign: 'center', fontFamily: 'Figtree-Bold', fontSize: 14, color: ink[900], paddingVertical: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.surface },
  included: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: zappy[50] },
  preview: { borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  previewRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  previewLine: { borderTopWidth: 1, borderTopColor: colors.border },
  previewPhoto: { width: 88, height: 88, borderRadius: radius.button, overflow: 'hidden', backgroundColor: slate[100], justifyContent: 'flex-end', padding: 6 },
  previewBook: { borderRadius: 6, paddingVertical: 3, alignItems: 'center', backgroundColor: colors.surface },
  backdrop: { flex: 1, backgroundColor: 'rgba(16,24,40,0.5)' },
  sheet: { maxHeight: '92%', gap: spacing.md, padding: spacing.lg, borderTopLeftRadius: radius.extraLarge, borderTopRightRadius: radius.extraLarge, backgroundColor: colors.surface },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sheetBody: { gap: spacing.lg, paddingBottom: spacing.md },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  short: { width: 120 },
  priceBox: { width: '47%', gap: 4 },
  priceField: { flexDirection: 'row', alignItems: 'center', height: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  priceInput: { flex: 1, minWidth: 0, paddingLeft: 4, fontSize: 15, fontFamily: 'Figtree-Bold', color: ink[900] },
});
