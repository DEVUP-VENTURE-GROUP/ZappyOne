/**
 * The shop's identity check (the website's ShopKycPage): owner ID, shop photo
 * and a live owner selfie, plus optional business papers. When the reviewer
 * asks for named documents again, only those open; the rest are kept. Once
 * sent, the page shows where it stands and the services panel.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Clock, FileText, IdCard, ShieldCheck, Store, XCircle } from 'lucide-react-native';
import { useShopKycStatusQuery, useSubmitShopKycMutation } from '@zappy/core/api';
import { captureLive, type LiveCaptureMeta } from '@zappy/core/lib/liveCapture';
import { pickDocument } from '@zappy/core/lib/pickDocument';
import { uploadPhoto, type PickedPhoto } from '@zappy/core/lib/upload';
import { Button, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { KycDocRow } from '@zappy/ui/components/kyc/KycDocRow';
import { errText } from '@zappy/ui/lib/feedback';
import { MyVerificationPanel } from '@zappy/ui/provider/MyVerificationPanel';
import { accent, colors, danger, ink, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const DOCS = [
  { key: 'ownerIdUrl', label: "Owner's ID proof", sublabel: 'Aadhaar / PAN / Voter ID, a clear photo', Icon: IdCard, required: true },
  { key: 'shopPhotoUrl', label: 'Shop photo', sublabel: 'Photo of your shop front or signboard', Icon: Store, required: true },
  // Taken live with the front camera, with the place and time: never picked from a gallery.
  { key: 'selfieUrl', label: 'Owner selfie', sublabel: 'Taken live with your front camera; your location is recorded', Icon: Camera, required: true, live: true },
  { key: 'businessRegistrationUrl', label: 'Business registration (optional)', sublabel: 'Shop & establishment license, if you have one', Icon: FileText, required: false },
  { key: 'gstCertificateUrl', label: 'GST certificate (optional)', sublabel: 'If your shop is GST-registered', Icon: FileText, required: false },
];

const DONE: Record<string, { title: string; body: string; Icon: typeof Clock; bg: string; fg: string }> = {
  pending_review: { title: 'Under review', body: "Your shop documents are being verified. We'll notify you within 24 hours.", Icon: Clock, bg: accent[50], fg: accent[700] },
  approved: { title: 'Shop identity verified', body: 'Your documents are checked. Jobs come only for the services approved below.', Icon: ShieldCheck, bg: success[50], fg: success[700] },
  suspended: { title: 'Verification suspended', body: 'Contact support for help with your shop verification.', Icon: XCircle, bg: danger[50], fg: danger[600] },
};

export function ShopKycPage() {
  const insets = useSafeAreaInsets();
  const { data, refetch, isLoading } = useShopKycStatusQuery();
  const [submitKyc, { isLoading: submitting }] = useSubmitShopKycMutation();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [gstNumber, setGstNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);
  const [selfieMeta, setSelfieMeta] = useState<LiveCaptureMeta | null>(null);

  if (isLoading) return <View style={styles.page}><ScreenHeader title="Shop verification" safeArea /><LoadingState /></View>;

  const status: string = data?.kyc?.status || 'not_submitted';
  // The reviewer asked for named documents again: only those open, the rest are kept.
  const clar = data?.kyc?.clarification?.active ? data.kyc.clarification : null;
  const asked: Set<string> | null = clar?.docCodes?.length ? new Set(clar.docCodes) : null;
  const opens = (key: string) => !asked || asked.has(key);
  const ready = asked ? [...asked].every((k) => urls[k]) : !!(urls.ownerIdUrl && urls.shopPhotoUrl && urls.selfieUrl);

  if ((status === 'pending_review' && !clar) || status === 'approved' || status === 'suspended') {
    const m = DONE[status];
    return (
      <View style={styles.page}>
        <ScreenHeader title="Shop verification" safeArea />
        <ScrollView contentContainerStyle={styles.body}>
          <View style={[styles.banner, { backgroundColor: m.bg }]}>
            <m.Icon size={18} color={m.fg} />
            <View style={styles.flex}><Text variant="bodySmall" weight="bold" color={m.fg}>{m.title}</Text><Text variant="caption" color={m.fg}>{m.body}</Text></View>
          </View>
          {/* What the shop gave us, and where each service stands. */}
          <MyVerificationPanel isShop />
        </ScrollView>
      </View>
    );
  }

  async function add(key: string, live: boolean) {
    let photo: PickedPhoto | null = null;
    let meta: LiveCaptureMeta | null = null;
    try {
      if (live) { const r = await captureLive({ front: true }); if (r) ({ photo, meta } = r); }
      else photo = await pickDocument();
    } catch (err) { toast.error((err as Error).message); return; }
    if (!photo) return;
    setUploading(key);
    try {
      const k = await uploadPhoto(photo, 'kyc');
      setUrls((u) => ({ ...u, [key]: k }));
      if (meta) setSelfieMeta(meta);
      toast.success(meta ? 'Selfie saved' : 'Document uploaded');
    } catch { toast.error('Upload failed. Please try again.'); }
    finally { setUploading(null); }
  }

  async function submit() {
    if (!ready) { toast.error(asked ? 'Add a new copy of each document asked for' : 'Owner ID, shop photo and selfie are all required'); return; }
    if (opens('selfieUrl') && !selfieMeta) { toast.error('Take your selfie with the camera'); return; }
    try {
      const docs = asked ? Object.fromEntries([...asked].map((k) => [k, urls[k]])) : urls;
      await submitKyc({ ...docs, ...(opens('selfieUrl') ? { selfieMetadata: selfieMeta } : {}), gstNumber: gstNumber || undefined, panNumber: panNumber || undefined }).unwrap();
      toast.success('Documents submitted for review');
      refetch();
    } catch (err) { toast.error(errText(err, 'Submission failed')); }
  }

  return (
    <View style={styles.page}>
      <ScreenHeader title="Shop verification" safeArea />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {clar ? (
          <View style={[styles.banner, { backgroundColor: accent[50] }]}>
            <View style={styles.flex}>
              <Text variant="caption" weight="bold" color={accent[700]}>PLEASE SEND AGAIN</Text>
              <Text variant="bodySmall" color={accent[700]}>{clar.message}</Text>
              <Text variant="caption" color={accent[700]}>{DOCS.filter((d) => asked?.has(d.key)).map((d) => d.label).join(', ')}. Everything else you sent is kept.</Text>
            </View>
          </View>
        ) : null}
        {status === 'rejected' && data?.kyc?.reviewNote ? (
          <View style={[styles.banner, { backgroundColor: danger[50] }]}>
            <XCircle size={16} color={danger[500]} />
            <View style={styles.flex}><Text variant="caption" weight="bold" color={danger[600]}>PREVIOUS SUBMISSION REJECTED</Text><Text variant="bodySmall" color={danger[600]}>{data.kyc.reviewNote}</Text></View>
          </View>
        ) : null}
        <View style={[styles.banner, { backgroundColor: zappy[50] }]}>
          <ShieldCheck size={16} color={zappy[600]} />
          <Text variant="caption" weight="medium" color={zappy[700]} style={styles.flex}>Verifying your shop builds customer trust and unlocks the Nearby Shops listing. Reviewed within 24 hours.</Text>
        </View>

        {DOCS.map((d) => (
          <KycDocRow key={d.key} Icon={d.Icon} label={d.label} sublabel={d.sublabel} required={d.required} live={d.live}
            uploaded={!!urls[d.key]} busy={uploading === d.key} locked={!opens(d.key)} onPick={() => add(d.key, !!d.live)} />
        ))}

        <View style={styles.card}>
          <Text variant="caption" weight="bold" color={ink[500]}>BUSINESS DETAILS (OPTIONAL)</Text>
          <TextInput value={gstNumber} onChangeText={setGstNumber} autoCapitalize="characters" placeholder="GST number" placeholderTextColor={ink[400]} style={styles.input} />
          <TextInput value={panNumber} onChangeText={(v) => setPanNumber(v.toUpperCase())} autoCapitalize="characters" placeholder="PAN number" placeholderTextColor={ink[400]} style={styles.input} />
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Submit for verification" icon={<ShieldCheck size={15} color="#fff" />} onPress={submit} loading={submitting} disabled={!ready} fullWidth size="large" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  body: { padding: spacing.base, gap: spacing.md, paddingBottom: 120 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.base, borderRadius: radius.large },
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.base, paddingTop: spacing.md },
});
