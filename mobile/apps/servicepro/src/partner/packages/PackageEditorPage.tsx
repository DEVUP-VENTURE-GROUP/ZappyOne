/**
 * Create or edit a package (the events website's PackageEditorPage). Photos
 * are taken or picked here: a cover and up to 12 more. A video is added on the
 * website; one already there is kept. The price is what the customer pays;
 * the partner sees what they keep before saving. The rules are shared with
 * the website (shared/events/partnerBookings).
 */
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useCreateEventThemeMutation, useGetEventCategoriesQuery, usePartnerEarningsQuery, usePartnerThemesQuery, useUpdateEventThemeMutation,
} from '@zappy/core/api';
import { pickPhoto, uploadPhoto } from '@zappy/core/lib/upload';
import { EDITABLE, EMPTY_PACKAGE, packageBody, packageForm, packageProblems } from '@zappy/core/shared/partnerBookings';
import { Button, Chip, EmptyState, Input, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, danger, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { PlacePicker } from '../PlacePicker';
import { usePartner } from '../usePartner';
import { ListInput } from './ListInput';
import { MediaTile } from './MediaTile';

type Media = { key: string; url?: string };
interface Form {
  title: string; description: string; categoryId: string; price: string; setupHours: string; guestsMax: string;
  included: string[]; excluded: string[]; cities: string[]; cover: Media | null; gallery: Media[]; video: Media | null;
}

export function PackageEditorPage() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id && id !== 'new';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { partner } = usePartner();
  const { data: themes, isLoading } = usePartnerThemesQuery(undefined, { skip: !isEdit });
  const { data: cats } = useGetEventCategoriesQuery(undefined);
  const { data: earnings } = usePartnerEarningsQuery(undefined);
  const [create, { isLoading: creating }] = useCreateEventThemeMutation();
  const [update, { isLoading: updating }] = useUpdateEventThemeMutation();
  const [form, setForm] = useState<Form>(EMPTY_PACKAGE as unknown as Form);
  const [busy, setBusy] = useState('');
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const theme = isEdit ? themes?.themes?.find((t: { _id: string }) => t._id === id) : null;

  useEffect(() => { if (theme) setForm(packageForm(theme) as Form); }, [theme?._id]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new partner's areas are the sensible default for a new package.
  useEffect(() => {
    if (!isEdit && partner?.cities?.length && !form.cities.length) set('cities', partner.cities);
  }, [partner?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = isEdit ? 'Edit package' : 'New package';
  if (isEdit && isLoading) return <View style={styles.page}><ScreenHeader title={title} safeArea /><LoadingState /></View>;
  if (isEdit && !theme) return <View style={styles.page}><ScreenHeader title={title} safeArea /><EmptyState title="Package not found." /></View>;
  if (theme && !EDITABLE.includes(theme.status)) return <View style={styles.page}><ScreenHeader title={title} safeArea /><EmptyState title="This package is live" message="Contact support to change it, so bookings already made stay as sold." /></View>;

  async function addPhoto(kind: 'cover' | 'gallery') {
    let photo;
    try { photo = await pickPhoto({ camera: false }); } catch (err) { toast.error((err as Error).message); return; }
    if (!photo) return;
    setBusy(kind);
    try {
      const key = await uploadPhoto(photo, 'event-photos');
      const item = { key, url: photo.uri };
      if (kind === 'cover') set('cover', item);
      else setForm((f) => ({ ...f, gallery: [...f.gallery, item].slice(0, 12) }));
    } catch (err) { toast.error(errText(err, 'Upload failed. Try again.')); }
    finally { setBusy(''); }
  }

  const price = Number(form.price) || 0;
  // The live rate; each booking freezes the rate it is made at.
  const pct: number = earnings?.commissionPct ?? 10;
  const problems = packageProblems(form) as string[];

  async function save() {
    if (problems.length) { toast.error(`Add ${problems[0]}`); return; }
    const body = packageBody(form);
    try {
      if (isEdit) await update({ id, ...body }).unwrap(); else await create(body).unwrap();
      toast.success(isEdit ? 'Saved. It goes live after review.' : 'Package sent for review. We usually respond within a day.');
      router.back();
    } catch (err) { toast.error(errText(err, 'Could not save')); }
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={title} safeArea />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text variant="body" weight="bold">Photos</Text>
          <MediaTile label="Cover photo" required uri={form.cover?.url || null} busy={busy === 'cover'} onPick={() => addPhoto('cover')} onClear={() => set('cover', null)} />
          <Text variant="bodySmall" weight="semibold">More photos <Text variant="caption" color={ink[400]}>({form.gallery.length}/12)</Text></Text>
          <View style={styles.grid}>
            {form.gallery.map((g, i) => <MediaTile key={g.key} size="small" uri={g.url || null} onPick={() => {}} onClear={() => set('gallery', form.gallery.filter((_, j) => j !== i))} />)}
            {form.gallery.length < 12 ? <MediaTile size="small" busy={busy === 'gallery'} onPick={() => addPhoto('gallery')} onClear={() => {}} /> : null}
          </View>
          <Text variant="caption" color={ink[500]}>{form.video ? 'Your video stays on this package.' : 'A short video can be added from ServicePro on the web.'}</Text>
        </View>

        <View style={styles.card}>
          <Input label="Title" value={form.title} onChangeText={(v) => set('title', v)} maxLength={100} placeholder="Pastel birthday backdrop with balloon arch" />
          <Text variant="bodySmall" weight="semibold">Category<Text variant="bodySmall" color={danger[500]}> *</Text></Text>
          <View style={styles.chips}>
            {(cats?.categories || []).map((c: { _id: string; name: string }) => <Chip key={c._id} label={c.name} selected={form.categoryId === c._id} onPress={() => set('categoryId', c._id)} />)}
          </View>
          <Input label="Description" value={form.description} onChangeText={(v) => set('description', v)} maxLength={2000} multiline multilineHeight={88} placeholder="Colours, mood, the space it suits." />
        </View>

        <View style={styles.card}>
          <Input label="Price the customer pays (₹)" value={form.price} onChangeText={(v) => set('price', v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="4999" />
          <Text variant="caption" color={ink[500]}>{price ? `You keep about ₹${Math.round(price * (100 - pct) / 100).toLocaleString('en-IN')}.` : 'All-in: setup, materials and travel within the places you serve.'}</Text>
          <View style={styles.row}>
            <View style={styles.flex}><Input label="Setup time (hours)" value={form.setupHours} onChangeText={(v) => set('setupHours', v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" /></View>
            <View style={styles.flex}><Input label="Up to guests" value={form.guestsMax} onChangeText={(v) => set('guestsMax', v.replace(/\D/g, ''))} keyboardType="number-pad" /></View>
          </View>
        </View>

        <View style={styles.card}>
          <ListInput label="What's included" required value={form.included} onChange={(v) => set('included', v)} placeholder="e.g. 60 balloons, backdrop, name banner" />
          <ListInput label="Not included" value={form.excluded} onChange={(v) => set('excluded', v)} placeholder="e.g. Cake, photographer" />
        </View>

        <View style={styles.card}>
          <Text variant="bodySmall" weight="semibold">Where you offer it<Text variant="bodySmall" color={danger[500]}> *</Text></Text>
          <PlacePicker value={form.cities} onChange={(v) => set('cities', v)} />
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label={isEdit ? 'Save and send for review' : 'Send for review'} loading={creating || updating} disabled={!!busy} onPress={save} fullWidth size="large" />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base, paddingBottom: spacing.xxl },
  card: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  footer: { paddingHorizontal: spacing.base, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
});
