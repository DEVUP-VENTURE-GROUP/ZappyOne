/**
 * The verification screen for ONE service. Every document, detail and
 * declaration comes from the requirement set the server resolved for this
 * provider kind, so a laptop shop and a phone technician see different asks
 * without this screen knowing anything about either.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Check, ShieldCheck } from 'lucide-react-native';
import {
  useProviderLineRequirementsQuery, useProviderSaveEnrolmentMutation, useProviderSubmitEnrolmentMutation,
} from '@zappy/core/api';
import { captureLive, type LiveCaptureMeta } from '@zappy/core/lib/liveCapture';
import { pickDocument } from '@zappy/core/lib/pickDocument';
import { uploadPhoto, type PickedPhoto } from '@zappy/core/lib/upload';
import { Button, LoadingState, Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { errText, type ApiErr } from '../../../lib/feedback';
import { InstantIdCheck } from '../../InstantIdCheck';
import { accent, colors, danger, ink, success, zappy } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import { RequirementDocument, type RequiredDoc } from './RequirementDocument';
import { ob } from './onboardingStyles';

interface EnrolmentDoc { code: string; url?: string; carried?: boolean; uploadedAt?: string }
interface Missing { code: string; kind?: string }

const ID_CODES = ['aadhaar', 'owner_id', 'pan'];

export function VerifyStep({ lineCode, onDone }: { lineCode: string; onDone: () => void }) {
  const { data, isLoading, refetch } = useProviderLineRequirementsQuery(lineCode);
  const [save] = useProviderSaveEnrolmentMutation();
  const [submit, { isLoading: submitting }] = useProviderSubmitEnrolmentMutation();
  const [uploading, setUploading] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [accepted, setAccepted] = useState(false);
  const [missing, setMissing] = useState<Missing[]>([]);

  const enrolment = data?.enrolment;
  const reqs = data?.requirements as { documents: RequiredDoc[]; fields: { code: string; label: string; required?: boolean; hint?: string }[]; declarations: string[] } | undefined;
  const docs: EnrolmentDoc[] = enrolment?.documents || [];
  // Documents already uploaded, so a returning provider is not asked twice.
  const have = useMemo(() => new Map(docs.map((d) => [d.code, d.url])), [docs]);
  const carried = useMemo(() => new Set(docs.filter((d) => d.carried).map((d) => d.code)), [docs]);
  const savedFields = useMemo(() => Object.fromEntries((enrolment?.fields || []).map((f: { code: string; value: string }) => [f.code, f.value])), [enrolment]);
  const missingCodes = useMemo(() => new Set(missing.map((m) => m.code)), [missing]);

  if (isLoading) return <LoadingState />;
  if (!reqs) {
    return (
      <View style={ob.shell}>
        <View style={[ob.card, styles.amber]}>
          <Text variant="bodySmall" weight="bold" color={accent[700]}>Verification isn't configured for this service yet</Text>
          <Text variant="caption" color={accent[700]}>We'll let you know as soon as it is. You don't need to do anything.</Text>
        </View>
      </View>
    );
  }

  const decided = ['approved', 'suspended'].includes(enrolment?.status);
  // The reviewer asked for named documents again: only those can change now.
  const redo: Set<string> | null = enrolment?.status === 'rejected' && enrolment?.redo?.codes?.length ? new Set(enrolment.redo.codes) : null;
  const redoSince = redo && enrolment.redo.requestedAt ? new Date(enrolment.redo.requestedAt) : null;
  const sentAgain = (code: string) => {
    const d = docs.find((x) => x.code === code);
    return !!d?.url && (!redoSince || new Date(d.uploadedAt || 0) > redoSince);
  };

  async function pickFor(doc: RequiredDoc) {
    let photo: PickedPhoto | null = null;
    let meta: LiveCaptureMeta | null = null;
    try {
      if (doc.capture) {
        // This one has to be taken now: the gallery cannot answer a question about the present moment.
        const live = await captureLive({ front: doc.capture === 'user' });
        if (live) ({ photo, meta } = live);
      } else {
        photo = await pickDocument();
      }
    } catch (err) { toast.error((err as Error).message); return; }
    if (!photo) return;

    setUploading(doc.code);
    try {
      const key = await uploadPhoto(photo, 'kyc');
      await save({ id: enrolment._id, documents: [{ code: doc.code, url: key, ...(meta ? { captureMethod: meta.captureMethod, capturedAt: meta.capturedAt, lat: meta.lat, lng: meta.lng } : {}) }] }).unwrap();
      await refetch();
      toast.success(meta ? 'Photo captured' : 'Uploaded');
    } catch { toast.error('Upload failed. Please try again.'); }
    finally { setUploading(null); }
  }

  async function send() {
    try {
      // Save what is on screen first, so a submission never races the last thing typed.
      await save({
        id: enrolment._id,
        fields: Object.entries(fields).map(([code, value]) => ({ code, value })),
        acceptedDeclarations: accepted || enrolment.acceptedDeclarations,
      }).unwrap();
      await submit(enrolment._id).unwrap();
      setMissing([]);
      toast.success('Sent for verification');
      onDone();
    } catch (err) {
      const body = (err as ApiErr & { data?: { missing?: Missing[]; fields?: Missing[] } })?.data;
      if (body?.code === 'INCOMPLETE') { setMissing(body.missing || []); toast.error('Some required items are still missing'); }
      else if (body?.code === 'BAD_FORMAT') { setMissing((body.fields || []).map((f) => ({ ...f, kind: 'field' }))); toast.error('Check the highlighted details'); }
      else toast.error(errText(err, 'Could not submit'));
    }
  }

  const pending = enrolment?.status === 'pending_review';
  const agreed = accepted || !!enrolment?.acceptedDeclarations;

  return (
    <View style={ob.shell}>
      {pending ? (
        <View style={[ob.card, styles.amber]}>
          <Text variant="bodySmall" weight="bold" color={accent[700]}>We're reviewing your documents</Text>
          <Text variant="caption" color={accent[700]}>Usually within a day. We'll notify you the moment it's decided.</Text>
        </View>
      ) : null}
      {enrolment?.status === 'approved' ? (
        <View style={[ob.card, styles.green]}>
          <Text variant="bodySmall" weight="bold" color={success[700]}>You're approved for {data.line.name}</Text>
          <Text variant="caption" color={success[700]}>Set up your services and pricing to start receiving jobs.</Text>
        </View>
      ) : null}
      {redo ? (
        <View style={[ob.card, styles.red]}>
          <Text variant="bodySmall" weight="bold" color={danger[600]}>Please send {redo.size === 1 ? 'this document' : 'these documents'} again</Text>
          {reqs.documents.filter((d) => redo.has(d.code)).map((d) => (
            <Text key={d.code} variant="caption" weight="semibold" color={danger[600]}>{d.label}{sentAgain(d.code) ? ' (done)' : ''}</Text>
          ))}
          {enrolment.reviewNote ? <Text variant="caption" color={danger[600]}>{enrolment.reviewNote}</Text> : null}
          <Text variant="caption" color={danger[500]}>Everything else you sent is fine and stays as it is.</Text>
        </View>
      ) : enrolment?.status === 'rejected' && enrolment.reviewNote ? (
        <View style={[ob.card, styles.red]}>
          <Text variant="bodySmall" weight="bold" color={danger[600]}>Needs changes</Text>
          <Text variant="caption" color={danger[600]}>{enrolment.reviewNote}</Text>
        </View>
      ) : null}

      {/* Verify identity in a minute when ZappyOne has an instant check; otherwise our team reviews the uploads. */}
      {!decided && reqs.documents.some((d) => ID_CODES.includes(d.code)) ? <InstantIdCheck /> : null}

      <Text variant="caption" weight="bold" color={ink[500]} style={ob.label}>DOCUMENTS</Text>
      {reqs.documents.map((d) => {
        const again = !!redo?.has(d.code);
        const uploaded = again ? sentAgain(d.code) : !!have.get(d.code);
        return (
          <RequirementDocument key={d.code} doc={d} uploaded={uploaded} again={again} redo={!!redo} carried={carried.has(d.code)}
            locked={decided || (!!redo && !again)} missing={missingCodes.has(d.code) || (again && !uploaded)}
            busy={uploading === d.code} onPick={() => pickFor(d)} />
        );
      })}

      {reqs.fields.length ? <Text variant="caption" weight="bold" color={ink[500]} style={ob.label}>DETAILS</Text> : null}
      {reqs.fields.map((f) => (
        <View key={f.code} style={ob.card}>
          <Text variant="caption" weight="semibold" color={ink[700]}>{f.label}{!f.required ? <Text variant="caption" color={ink[400]}>, optional</Text> : null}</Text>
          <TextInput value={fields[f.code] ?? savedFields[f.code] ?? ''} editable={!decided && !redo} onChangeText={(v) => setFields((s) => ({ ...s, [f.code]: v }))}
            accessibilityLabel={f.label} style={[styles.input, missingCodes.has(f.code) && styles.inputBad, (decided || !!redo) && styles.inputOff]} />
          {f.hint ? <Text variant="caption" color={ink[400]}>{f.hint}</Text> : null}
        </View>
      ))}

      {reqs.declarations.length ? (
        <View style={ob.card}>
          <Text variant="caption" weight="bold" color={ink[500]}>WHAT YOU'RE AGREEING TO</Text>
          {reqs.declarations.map((text) => (
            <View key={text} style={styles.declaration}><ShieldCheck size={14} color={zappy[500]} /><Text variant="caption" color={ink[700]} style={ob.flex}>{text}</Text></View>
          ))}
          {!decided ? (
            <Pressable onPress={() => setAccepted(!agreed)} accessibilityRole="checkbox" accessibilityState={{ checked: agreed }} style={styles.accept}>
              <View style={[styles.box, agreed && styles.boxOn]}>{agreed ? <Check size={13} color="#fff" strokeWidth={3} /> : null}</View>
              <Text variant="caption" weight="semibold" color={ink[700]}>I accept these conditions</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!decided ? (
        <Button label={pending ? 'Awaiting review' : redo ? 'Send for review again' : 'Submit for verification'}
          onPress={send} loading={submitting} disabled={pending} fullWidth size="large" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  amber: { backgroundColor: accent[50], borderColor: accent[100] },
  green: { backgroundColor: success[50], borderColor: success[100] },
  red: { backgroundColor: danger[50], borderColor: danger[100] },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  inputBad: { borderColor: danger[400], borderWidth: 2 },
  inputOff: { backgroundColor: colors.background, color: ink[500] },
  declaration: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  accept: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 40 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: ink[300], alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: zappy[600], borderColor: zappy[600] },
});
