/**
 * Business verification (the events website's KycSection). Four documents are
 * required (Aadhaar both sides, PAN, a live selfie); GST and registration are
 * optional. Submitting them puts the partner in review; the reviewer approves
 * or asks for named documents again, and then only those open.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BadgeCheck, Camera, Clock, FileText, IdCard, ShieldCheck, XCircle, type LucideIcon } from 'lucide-react-native';
import { useUpdatePartnerMeMutation } from '@zappy/core/api';
import { captureLive, type LiveCaptureMeta } from '@zappy/core/lib/liveCapture';
import { pickDocument } from '@zappy/core/lib/pickDocument';
import { uploadPhoto, type PickedPhoto } from '@zappy/core/lib/upload';
import { Button, Input, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { KycDocRow } from '@zappy/ui/components/kyc/KycDocRow';
import { errText } from '@zappy/ui/lib/feedback';
import { accent, colors, danger, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { usePartner } from '../usePartner';

const FIELDS: { key: string; label: string; sublabel: string; Icon: LucideIcon; required?: boolean; live?: boolean }[] = [
  { key: 'aadharFront', label: 'Aadhaar card, front', sublabel: 'Clear photo, all corners visible', Icon: IdCard, required: true },
  { key: 'aadharBack', label: 'Aadhaar card, back', sublabel: 'Clear photo, all corners visible', Icon: IdCard, required: true },
  { key: 'panCard', label: 'PAN card', sublabel: 'Clear photo, all corners visible', Icon: IdCard, required: true },
  { key: 'liveSelfie', label: 'Live selfie', sublabel: 'Taken now with your front camera', Icon: Camera, required: true, live: true },
  { key: 'gstCertificate', label: 'GST certificate', sublabel: 'Optional', Icon: FileText },
  { key: 'businessRegistration', label: 'Business registration', sublabel: 'Optional: shop act, MSME or similar', Icon: FileText },
];

const STATE: Record<string, { label: string; text: string; Icon: LucideIcon; bg: string; fg: string }> = {
  approved: { label: 'Verified', text: 'You can publish packages and take bookings.', Icon: BadgeCheck, bg: success[50], fg: success[700] },
  pending: { label: 'In review', text: 'We usually respond within 24 hours.', Icon: Clock, bg: accent[50], fg: accent[700] },
  rejected: { label: 'Needs changes', text: 'Please re-upload clear documents.', Icon: XCircle, bg: danger[50], fg: danger[600] },
  not_submitted: { label: 'Not submitted', text: 'Upload the four required documents to get verified.', Icon: ShieldCheck, bg: zappy[50], fg: zappy[700] },
};

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function PartnerKycPage() {
  const insets = useSafeAreaInsets();
  const { partner, isLoading } = usePartner();
  const [updateMe, { isLoading: saving }] = useUpdatePartnerMeMutation();
  const [pending, setPending] = useState<Record<string, string>>({});
  const [selfieMeta, setSelfieMeta] = useState<LiveCaptureMeta | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [pan, setPan] = useState<string | null>(null);
  const [gst, setGst] = useState<string | null>(null);

  if (isLoading || !partner) return <View style={styles.page}><ScreenHeader title="Verification" safeArea /><LoadingState /></View>;

  const kyc = (partner.kyc || {}) as Record<string, unknown> & NonNullable<typeof partner.kyc>;
  const status = kyc.status || 'not_submitted';
  const st = STATE[status] || STATE.not_submitted;
  const clar = kyc.clarification?.active ? kyc.clarification : null;
  const asked = clar?.docCodes?.length ? new Set(clar.docCodes) : null;
  const locked = status === 'approved' || (status === 'pending' && !clar);
  const required = asked ? FIELDS.filter((f) => asked.has(f.key)) : FIELDS.filter((f) => f.required);
  const doneRequired = required.filter((f) => (asked ? pending[f.key] : kyc[f.key] || pending[f.key])).length;
  const ready = doneRequired === required.length;
  const panValue = pan ?? kyc.panNumber ?? '';
  const gstValue = gst ?? kyc.gstNumber ?? '';
  const panOk = !panValue || PAN.test(panValue);
  const note = clar
    ? `Please send again: ${FIELDS.filter((f) => asked?.has(f.key)).map((f) => f.label).join(', ')}. ${clar.message || ''} Everything else is kept.`
    : status === 'rejected' ? `Sent back: ${kyc.reviewNote || 'please re-upload clear documents.'}` : st.text;

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
      const k = await uploadPhoto(photo, 'kyc-docs');
      setPending((p) => ({ ...p, [key]: k }));
      if (meta) setSelfieMeta(meta);
    } catch { toast.error('Upload failed. Please try again.'); }
    finally { setUploading(null); }
  }

  async function submit() {
    if (!ready) { toast.error('Upload all the required documents first'); return; }
    if (!panOk) { toast.error('PAN looks wrong. It is 5 letters, 4 digits, 1 letter.'); return; }
    try {
      await updateMe({ ...pending, ...(pending.liveSelfie ? { liveSelfieMeta: selfieMeta } : {}), panNumber: panValue || undefined, gstNumber: gstValue || undefined }).unwrap();
      setPending({});
      toast.success('Submitted for review');
    } catch (err) { toast.error(errText(err, 'Could not submit')); }
  }

  return (
    <View style={styles.page}>
      <ScreenHeader title="Verification" safeArea />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={[styles.banner, { backgroundColor: st.bg }]}>
          <st.Icon size={18} color={st.fg} />
          <View style={styles.flex}><Text variant="bodySmall" weight="bold" color={st.fg}>{st.label}</Text><Text variant="caption" color={st.fg}>{note}</Text></View>
        </View>

        {!locked ? (
          <View style={styles.progress}>
            <View style={styles.between}><Text variant="caption" weight="semibold" color={ink[700]}>Required documents</Text><Text variant="caption" color={ink[500]}>{doneRequired}/{required.length}</Text></View>
            <View style={styles.track}><View style={[styles.fill, { width: `${(doneRequired / Math.max(1, required.length)) * 100}%` }]} /></View>
          </View>
        ) : null}

        {FIELDS.map((f) => (
          <KycDocRow key={f.key} Icon={f.Icon} label={f.label} sublabel={pending[f.key] ? 'Ready to submit' : f.sublabel} required={f.required} live={f.live}
            uploaded={!!(pending[f.key] || kyc[f.key])} busy={uploading === f.key} locked={locked || (!!asked && !asked.has(f.key))} onPick={() => add(f.key, !!f.live)} />
        ))}

        {locked ? (kyc.panNumber || kyc.gstNumber ? (
          <View style={styles.card}>
            {kyc.panNumber ? <Text variant="bodySmall" color={ink[700]}>PAN, {kyc.panNumber}</Text> : null}
            {kyc.gstNumber ? <Text variant="bodySmall" color={ink[700]}>GST, {kyc.gstNumber}</Text> : null}
          </View>
        ) : null) : (
          <View style={styles.card}>
            <Input label="PAN number" value={panValue} onChangeText={(v) => setPan(v.toUpperCase())} maxLength={10} autoCapitalize="characters" placeholder="ABCDE1234F"
              error={panOk ? undefined : '5 letters, 4 digits, 1 letter'} />
            <Input label="GST number (optional)" value={gstValue} onChangeText={(v) => setGst(v.toUpperCase())} maxLength={15} autoCapitalize="characters" placeholder="36ABCDE1234F1Z5" />
          </View>
        )}
      </ScrollView>
      {!locked ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button label={ready ? 'Submit for review' : `Upload ${required.length - doneRequired} more required`} icon={<ShieldCheck size={15} color="#fff" />}
            onPress={submit} loading={saving} disabled={!ready} fullWidth size="large" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base, paddingBottom: spacing.xxl },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.base, borderRadius: radius.large },
  flex: { flex: 1, gap: 2 },
  progress: { gap: 6 },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: slate[100] },
  fill: { height: '100%', backgroundColor: zappy[600] },
  card: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  footer: { paddingHorizontal: spacing.base, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
});
