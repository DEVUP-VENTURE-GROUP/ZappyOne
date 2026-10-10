/**
 * A shop technician's ID check (the websites' WorkerKycPage): Aadhaar, an
 * optional driving licence, and a live selfie that must carry its location.
 * Once sent: where it stands, the documents, and a request to change them.
 * When the reviewer asks for named documents again, only those open.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Clock, FileText, MessageSquare, ShieldCheck, XCircle } from 'lucide-react-native';
import { useGetKycStatusQuery, useSubmitKycMutation, useWorkerRequestDocumentChangeMutation } from '@zappy/core/api';
import { captureLive, type LiveCaptureMeta } from '@zappy/core/lib/liveCapture';
import { pickDocument } from '@zappy/core/lib/pickDocument';
import { uploadPhoto, type PickedPhoto } from '@zappy/core/lib/upload';
import { Button, LoadingState, ScreenHeader, Text } from '../../components';
import { toast } from '../../components/Toast';
import { KycDocRow } from '../../components/kyc/KycDocRow';
import { MyKycDocuments } from '../../components/kyc/MyKycDocuments';
import { errText } from '../../lib/feedback';
import { accent, colors, danger, ink, success, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

const DOCS = [
  { key: 'aadhaarUrl', label: 'Aadhaar card (front)', sublabel: 'Government-issued ID, a clear photo with all 4 corners visible', Icon: FileText, required: true, live: false },
  // Optional: a technician fixing phones at the bench need not drive.
  { key: 'licenseUrl', label: 'Driving licence', sublabel: 'Optional: add it if you ride to customers', Icon: FileText, required: false, live: false },
  { key: 'selfieUrl', label: 'Live selfie', sublabel: 'Taken live from your front camera. Gallery not allowed.', Icon: Camera, required: true, live: true },
];
const DOC_NAME: Record<string, string> = { aadhaarUrl: 'Aadhaar', licenseUrl: 'Driving licence', selfieUrl: 'Live selfie' };

function Banner({ tone, Icon, title, children }: { tone: 'amber' | 'green' | 'red' | 'blue'; Icon: typeof Clock; title?: string; children: React.ReactNode }) {
  const c = { amber: [accent[50], accent[700]], green: [success[50], success[700]], red: [danger[50], danger[600]], blue: [zappy[50], zappy[700]] }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: c[0] }]}>
      <Icon size={16} color={c[1]} />
      <View style={styles.flex}>{title ? <Text variant="bodySmall" weight="bold" color={c[1]}>{title}</Text> : null}<Text variant="caption" color={c[1]}>{children}</Text></View>
    </View>
  );
}

export function WorkerKycPage() {
  const insets = useSafeAreaInsets();
  const { data, refetch, isLoading } = useGetKycStatusQuery();
  const [submitKyc, { isLoading: submitting }] = useSubmitKycMutation();
  const [requestChange, { isLoading: requesting }] = useWorkerRequestDocumentChangeMutation();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [selfieMeta, setSelfieMeta] = useState<LiveCaptureMeta | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [changeMsg, setChangeMsg] = useState('');

  if (isLoading) return <View style={styles.page}><ScreenHeader title="ID check" safeArea /><LoadingState /></View>;

  const kyc = data?.kyc;
  const status: string = kyc?.status || 'not_submitted';
  const clarification = kyc?.clarification;
  // The reviewer asked for a fix: re-open the form even though it is still pending.
  const needsClarification = status === 'pending_review' && clarification?.active;
  const asked: Set<string> | null = needsClarification && clarification.docCodes?.length ? new Set(clarification.docCodes) : null;
  const opens = (key: string) => !asked || asked.has(key);
  const ready = asked ? [...asked].every((k) => urls[k]) : !!(urls.aadhaarUrl && urls.selfieUrl);

  async function sendChangeRequest() {
    if (changeMsg.trim().length < 10) { toast.error('Please describe why you need to change documents (at least 10 characters)'); return; }
    try { await requestChange(changeMsg.trim()).unwrap(); toast.success('Change request sent to admin for review'); setAsking(false); setChangeMsg(''); refetch(); }
    catch (err) { toast.error(errText(err, 'Could not send the request')); }
  }

  if (status === 'pending_review' && !needsClarification) {
    return (
      <View style={styles.page}>
        <ScreenHeader title="ID check" safeArea />
        <ScrollView contentContainerStyle={styles.body}>
          <Banner tone="amber" Icon={Clock} title="Under review">Your documents are being verified. We'll notify you within 24 hours.</Banner>
          <MyKycDocuments kycStatus={status} />
        </ScrollView>
      </View>
    );
  }

  if (status === 'approved') {
    const change = kyc?.changeRequest;
    return (
      <View style={styles.page}>
        <ScreenHeader title="ID check" safeArea />
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Banner tone="green" Icon={ShieldCheck} title="ID verified">Your identity is verified. Go on duty and start taking jobs.</Banner>
          <MyKycDocuments kycStatus={status} />
          {change?.status === 'pending' ? <Banner tone="amber" Icon={Clock} title="Change request pending admin review">"{change.message}" You'll be notified once reviewed.</Banner> : null}
          {change?.status === 'denied' ? <Banner tone="red" Icon={XCircle} title="Change request denied">{change.denialReason || 'Contact support if you need to change your documents.'}</Banner> : null}
          {!change && !asking ? <Button label="Request document change" variant="outline" icon={<MessageSquare size={14} color={ink[700]} />} onPress={() => setAsking(true)} fullWidth /> : null}
          {asking ? (
            <View style={styles.card}>
              <Text variant="bodySmall" weight="bold">Why do you need to change documents?</Text>
              <Text variant="caption" color={ink[400]}>Admin will review and approve before you can upload new documents.</Text>
              <TextInput value={changeMsg} onChangeText={setChangeMsg} multiline autoFocus placeholder="e.g. My Aadhaar has been renewed with a new address…" placeholderTextColor={ink[400]} style={[styles.input, styles.area]} />
              <View style={styles.row}>
                <Button label="Cancel" variant="outline" onPress={() => { setAsking(false); setChangeMsg(''); }} style={styles.flex} />
                <Button label="Send request" onPress={sendChangeRequest} loading={requesting} disabled={changeMsg.trim().length < 10} style={styles.flex} />
              </View>
            </View>
          ) : null}
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
      toast.success(meta ? 'Selfie captured' : 'Document uploaded');
    } catch { toast.error(live ? 'Selfie upload failed. Please try again.' : 'Document upload failed. Please try again.'); }
    finally { setUploading(null); }
  }

  async function submit() {
    if (!ready) { toast.error(asked ? 'Add a new copy of each document asked for' : 'Aadhaar and a live selfie are required'); return; }
    // The live selfie must carry its location.
    if (opens('selfieUrl') && (typeof selfieMeta?.lat !== 'number' || typeof selfieMeta?.lng !== 'number')) {
      toast.error('Location is required. Turn on location and take your live selfie again.'); return;
    }
    try {
      const body = asked ? Object.fromEntries([...asked].map((k) => [k, urls[k]])) : { ...urls };
      await submitKyc({ ...body, ...(opens('selfieUrl') ? { selfieMetadata: selfieMeta } : {}) }).unwrap();
      toast.success('Documents submitted for review');
      refetch();
    } catch (err) { toast.error(errText(err, 'Submission failed')); }
  }

  return (
    <View style={styles.page}>
      <ScreenHeader title="ID check" safeArea />
      <ScrollView contentContainerStyle={styles.body}>
        {needsClarification ? (
          <Banner tone="amber" Icon={MessageSquare} title="Action needed">
            {clarification.message} {asked ? `Send again: ${[...asked].map((k) => DOC_NAME[k] || k).join(', ')}. Everything else is kept.` : 'Please fix the above and upload your documents again below.'}
          </Banner>
        ) : null}
        {status === 'rejected' && kyc?.rejectionReason ? (
          <Banner tone="red" Icon={XCircle} title="Previous submission rejected">{kyc.rejectionReason} Please upload and submit your documents again.</Banner>
        ) : null}
        <Banner tone="blue" Icon={ShieldCheck}>Documents are encrypted and used only for identity verification. Submissions are reviewed within 24 hours.</Banner>
        {DOCS.map((d) => (
          <KycDocRow key={d.key} Icon={d.Icon} label={d.label} sublabel={d.sublabel} required={d.required} live={d.live}
            uploaded={!!urls[d.key]} busy={uploading === d.key} locked={!opens(d.key)} onPick={() => add(d.key, d.live)} />
        ))}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Submit for verification" icon={<ShieldCheck size={15} color="#fff" />} onPress={submit} loading={submitting} disabled={!ready} fullWidth size="large" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', gap: spacing.sm },
  body: { padding: spacing.base, gap: spacing.md, paddingBottom: 120 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.base, borderRadius: radius.large },
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  area: { minHeight: 88, paddingTop: spacing.md, textAlignVertical: 'top' },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.base, paddingTop: spacing.md },
});
