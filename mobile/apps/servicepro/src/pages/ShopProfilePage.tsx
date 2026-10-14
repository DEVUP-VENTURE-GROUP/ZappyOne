/**
 * The shop as customers see it (the website's ShopProfilePage): cover photo,
 * name, category, about, years in business, the address pinned on the map, and
 * opening hours. Services are set by verification, not here, so customers can
 * rely on them meaning something.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ImageIcon, MapPin } from 'lucide-react-native';
import { useShopMeQuery, useUpdateShopMeMutation } from '@zappy/core/api';
import { pickPhoto, uploadPhoto } from '@zappy/core/lib/upload';
import { incompleteDay } from '@zappy/core/shared/weeklyHoursRules';
import { Button, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { LoginSecurityCard } from '@zappy/ui/components/account/LoginSecurityCard';
import { AutoAcceptCard } from '@zappy/ui/components/provider/AutoAcceptCard';
import { LocationPicker } from '@zappy/ui/components/common/LocationPicker';
import { WeeklyHours, type DayHours } from '@zappy/ui/components/provider/WeeklyHours';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

interface Form {
  businessName: string; category: string; bio: string; yearsActive: string; hours: DayHours[];
  address: string; landmark: string; lat: number | null; lng: number | null; coverImageUrl: string;
}

export function ShopProfilePage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useShopMeQuery();
  const [updateShop, { isLoading: saving }] = useUpdateShopMeMutation();
  const [form, setForm] = useState<Form | null>(null);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  // The just-taken photo shows at once; the saved key is private until the next load signs it.
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  useEffect(() => {
    const s = data?.shop;
    if (!s || form) return;
    setForm({
      businessName: s.businessName || '', category: s.category || '', bio: s.bio || '', yearsActive: s.yearsActive != null ? String(s.yearsActive) : '',
      hours: s.hours || [], address: s.address?.text || '', landmark: s.address?.landmark || '',
      lat: s.address?.location?.coordinates?.[1] ?? null, lng: s.address?.location?.coordinates?.[0] ?? null, coverImageUrl: s.coverImageUrl || '',
    });
  }, [data, form]);

  if (isLoading || !form) return <View style={styles.page}><ScreenHeader title="Shop & hours" safeArea /><LoadingState /></View>;
  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));

  async function pickCover() {
    let photo;
    try { photo = await pickPhoto({ camera: false }); } catch (err) { toast.error((err as Error).message); return; }
    if (!photo) return;
    setUploading(true);
    try { const key = await uploadPhoto(photo, 'shop'); set({ coverImageUrl: key }); setCoverPreview(photo.uri); toast.success('Cover photo uploaded'); }
    catch { toast.error('Upload failed. Please try again.'); }
    finally { setUploading(false); }
  }

  async function save() {
    const f = form!;
    if (!f.businessName.trim()) { toast.error('Business name is required'); return; }
    // An open day with no times is a promise nobody can keep.
    const badDay = incompleteDay(f.hours);
    if (badDay) { toast.error(`Set opening and closing times for ${badDay}`); return; }
    try {
      await updateShop({
        businessName: f.businessName.trim(), category: f.category.trim(), hours: f.hours,
        // Only a new upload (a storage key) is sent; the loaded photo is a short-lived link, never saved back.
        coverImageUrl: f.coverImageUrl && !/^https?:/i.test(f.coverImageUrl) ? f.coverImageUrl : undefined,
        bio: f.bio || undefined, yearsActive: f.yearsActive === '' ? undefined : Number(f.yearsActive),
        ...(f.lat != null && f.lng != null && f.address ? { address: { text: f.address, landmark: f.landmark || undefined, location: { coordinates: [f.lng, f.lat] } } } : {}),
      }).unwrap();
      toast.success('Profile updated');
    } catch (err) { toast.error(errText(err, 'Failed to update profile')); }
  }

  const cover = coverPreview || (form.coverImageUrl.startsWith('http') ? form.coverImageUrl : null);
  return (
    <View style={styles.page}>
      <ScreenHeader title="Shop & hours" safeArea />
      {picking ? (
        <LocationPicker title="Your shop address" initial={form.lat != null && form.lng != null ? { lat: form.lat, lng: form.lng, address: form.address } : null}
          onCancel={() => setPicking(false)} onConfirm={({ address, lat, lng }) => { set({ address, lat, lng }); setPicking(false); }} />
      ) : null}
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <AutoAcceptCard who="shops" />
        <LoginSecurityCard />

        <View style={styles.card}>
          <Text variant="caption" weight="bold" color={ink[500]}>COVER PHOTO</Text>
          <Pressable onPress={pickCover} disabled={uploading} accessibilityRole="button" accessibilityLabel="Upload a photo of your shop" style={[styles.cover, uploading && styles.dim]}>
            {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : (
              <View style={styles.coverEmpty}>
                {uploading ? <ActivityIndicator color={ink[400]} /> : <ImageIcon size={22} color={ink[400]} />}
                <Text variant="caption" weight="semibold" color={ink[400]}>{uploading ? 'Uploading…' : 'Upload a photo of your shop'}</Text>
              </View>
            )}
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text variant="caption" weight="bold" color={ink[700]}>Business name *</Text>
          <TextInput value={form.businessName} onChangeText={(v) => set({ businessName: v })} placeholder="e.g. Sharma Mobile Repair" placeholderTextColor={ink[400]} style={styles.input} />
          <Text variant="caption" weight="bold" color={ink[700]}>Category</Text>
          <TextInput value={form.category} onChangeText={(v) => set({ category: v })} placeholder="e.g. Mobile & Laptop Repair" placeholderTextColor={ink[400]} style={styles.input} />
          <Text variant="caption" weight="bold" color={ink[700]}>About your shop</Text>
          <TextInput value={form.bio} onChangeText={(v) => set({ bio: v })} multiline placeholder="Tell customers what makes your shop trustworthy…" placeholderTextColor={ink[400]} style={[styles.input, styles.area]} />
          <Text variant="caption" weight="bold" color={ink[700]}>Years in business</Text>
          <TextInput value={form.yearsActive} onChangeText={(v) => set({ yearsActive: v.replace(/\D/g, '') })} keyboardType="number-pad" placeholder="e.g. 5" placeholderTextColor={ink[400]} style={styles.input} />
        </View>

        <View style={styles.card}>
          <Text variant="caption" weight="bold" color={ink[500]}>SHOP ADDRESS</Text>
          <Text variant="caption" color={ink[400]}>Customers are matched against this pin, so put it on the shop door.</Text>
          <Pressable onPress={() => setPicking(true)} accessibilityRole="button" style={[styles.pin, !form.address && styles.pinEmpty]}>
            <MapPin size={15} color={form.address ? success[600] : zappy[600]} />
            <View style={styles.flex}>
              <Text variant="caption" weight="semibold">{form.address || 'Set your shop address on the map'}</Text>
              {form.lat != null && form.lng != null ? <View style={styles.pinned}><Check size={11} color={success[600]} /><Text variant="caption" weight="semibold" color={success[600]}>Pinned</Text></View> : null}
            </View>
            <Text variant="caption" weight="bold" color={zappy[600]}>{form.address ? 'Change' : 'Set'}</Text>
          </Pressable>
          <TextInput value={form.landmark} onChangeText={(v) => set({ landmark: v })} placeholder="Landmark (optional)" placeholderTextColor={ink[400]} style={styles.input} />
        </View>

        <View style={styles.card}>
          <Text variant="caption" weight="bold" color={ink[500]}>OPENING HOURS</Text>
          <Text variant="caption" color={ink[400]}>Customers see these before booking. A day left closed takes no bookings.</Text>
          <WeeklyHours hours={form.hours} onChange={(hours) => set({ hours })} />
        </View>

        {/* Services are read-only on purpose: set by verification, not by this form. */}
        <View style={styles.card}>
          <Text variant="caption" weight="bold" color={ink[500]}>SERVICES YOU OFFER</Text>
          <Text variant="caption" color={ink[400]}>Set by verification, not by this form. Customers rely on it meaning something.</Text>
          <Button label="Manage services & verification" variant="outline" onPress={() => router.push('/provider/onboarding' as never)} fullWidth />
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label={saving ? 'Saving…' : 'Save profile'} onPress={save} loading={saving} fullWidth size="large" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  dim: { opacity: 0.6 },
  body: { padding: spacing.base, gap: spacing.md, paddingBottom: 120 },
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cover: { aspectRatio: 16 / 9, borderRadius: radius.medium, overflow: 'hidden', borderWidth: 2, borderStyle: 'dashed', borderColor: slate[200], backgroundColor: slate[100] },
  coverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  area: { minHeight: 88, paddingTop: spacing.md, textAlignVertical: 'top' },
  pin: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.medium, borderWidth: 1, borderColor: slate[200] },
  pinEmpty: { borderColor: zappy[300], backgroundColor: zappy[50] },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.base, paddingTop: spacing.md },
});
