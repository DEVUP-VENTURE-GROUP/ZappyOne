/**
 * Worker KYC — identity verification.
 * ----------------------------------------------------------------------------
 * The worker cannot earn a rupee until this is approved, and a rejection costs
 * them a 24-hour lockout before they may try again. So the screen is built to
 * prevent a wasted submission rather than to merely report one.
 *
 * ── THE FORM IS NOT ALWAYS THE ANSWER ──────────────────────────────────────
 * `deriveKycView` decides whether uploading is even permitted, from the whole
 * `kyc` object rather than its status string — see `kycState.ts` for the four
 * server gates that a status-only reading walks straight into. Every state the
 * backend can be in has a screen here, including the two the old one dropped
 * on the floor: `suspended` (which used to render the upload form, so the
 * worker photographed three documents to earn a 403) and an active admin
 * clarification (which used to render "under review, nothing to do" while the
 * server was in fact waiting on a re-upload).
 *
 * ── LOCATION IS COLLECTED BEFORE THE CAMERA, NOT AFTER THE SUBMIT ──────────
 * `submitKyc` hard-requires GPS coordinates on the selfie: no fix, no
 * submission. The previous screen sent `lat: null` when permission was denied,
 * which meant three uploads and then a guaranteed 400. Here the fix is taken
 * before the front camera opens, so a location problem surfaces while it still
 * costs the worker nothing.
 *
 * ── DOCUMENTS ARE NOT LEFT ON SCREEN ───────────────────────────────────────
 * Captured IDs are never rendered as card thumbnails and never logged. The
 * only way to see one is the explicit "Check photo" viewer, which closes.
 * Documents already stored server-side are read as a boolean "on file" — this
 * screen never fetches them back from `/workers/kyc/stream/:docType`.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {
  AlertTriangle,
  Clock,
  LifeBuoy,
  MapPin,
  MessageSquare,
  ShieldCheck,
  ShieldX,
  XCircle,
} from 'lucide-react-native';
import {
  Appear,
  BottomSheet,
  Button,
  Card,
  ErrorState,
  Input,
  LoadingState,
  ScreenHeader,
  Text,
} from '../../components/ui';
import {
  DocPreview,
  DocumentCard,
  SecurityNote,
  StatusBanner,
  VerificationSteps,
} from '../../components/worker/KycUI';
import {
  DOC_KINDS,
  DOC_META,
  EMPTY_UPLOAD,
  deriveKycView,
  docState,
  formatCooldown,
  type DocKind,
  type DocUpload,
} from '../../components/worker/kycState';
import {
  useGetKycStatusQuery,
  useRequestKycDocumentChangeMutation,
  useSubmitKycMutation,
} from '../../services/api/workerApi';
import {
  usePresignUploadMutation,
  uploadToPresignedUrl,
} from '../../services/api/uploadApi';
import { getApiErrorCode, getApiErrorMessage } from '../../services/api/apiSlice';
import { accent, colors, success } from '../../theme/colors';
import { screenPadding, spacing } from '../../theme/spacing';
import type { SubmitKycRequest } from '../../types/api';

type SelfieMeta = NonNullable<SubmitKycRequest['selfieMetadata']>;

/** The server caps `userAgent` at 300 chars. Identifies the app in the audit trail. */
const CLIENT_TAG = `Zappy Worker App / ${Platform.OS} ${String(Platform.Version)}`;

export default function WorkerKycScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: kyc, isLoading, error, refetch } = useGetKycStatusQuery();
  const [presignUpload] = usePresignUploadMutation();
  const [submitKyc, { isLoading: submitting }] = useSubmitKycMutation();
  const [requestChange, { isLoading: requesting }] = useRequestKycDocumentChangeMutation();

  const [uploads, setUploads] = useState<Record<DocKind, DocUpload>>({
    aadhaar: EMPTY_UPLOAD,
    license: EMPTY_UPLOAD,
    selfie: EMPTY_UPLOAD,
  });
  const [selfieMeta, setSelfieMeta] = useState<SelfieMeta | null>(null);
  const [locationIssue, setLocationIssue] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DocKind | null>(null);

  const [changeOpen, setChangeOpen] = useState(false);
  const [changeMsg, setChangeMsg] = useState('');
  const [changeError, setChangeError] = useState<string | null>(null);

  const view = useMemo(() => deriveKycView(kyc), [kyc]);

  const allCaptured = DOC_KINDS.every((kind) => uploads[kind].key);
  const anyUploading = DOC_KINDS.some((kind) => uploads[kind].uploading);
  const hasCoords =
    typeof selfieMeta?.lat === 'number' && typeof selfieMeta?.lng === 'number';

  /**
   * A GPS fix, or null with the reason already surfaced. Taken BEFORE the
   * camera opens so a permission problem never costs the worker a capture.
   */
  const ensureLocation = useCallback(async (): Promise<Location.LocationObject | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationIssue(
          'Zappy needs your location to verify where the selfie was taken. Allow location access in Settings, then try again.',
        );
        return null;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocationIssue(null);
      return position;
    } catch {
      setLocationIssue(
        "We couldn't get a GPS fix. Step outside or near a window, make sure location is on, and try again.",
      );
      return null;
    }
  }, []);

  /** Presign, PUT to S3, keep the key. Nothing about the file is logged. */
  const uploadDoc = useCallback(
    async (kind: DocKind, uri: string) => {
      setUploads((prev) => ({
        ...prev,
        [kind]: { localUri: uri, key: null, uploading: true, failed: false },
      }));
      try {
        const { uploadUrl, key } = await presignUpload({
          folder: 'kyc',
          contentType: 'image/jpeg',
        }).unwrap();
        await uploadToPresignedUrl(uri, uploadUrl, 'image/jpeg');
        setUploads((prev) => ({
          ...prev,
          [kind]: { localUri: uri, key, uploading: false, failed: false },
        }));
        return true;
      } catch {
        setUploads((prev) => ({
          ...prev,
          [kind]: { localUri: uri, key: null, uploading: false, failed: true },
        }));
        return false;
      }
    },
    [presignUpload],
  );

  const capture = useCallback(
    async (kind: DocKind) => {
      setSubmitError(null);

      // The selfie carries the location the whole submission is judged on, so
      // the fix comes first — no point photographing a face we cannot place.
      let position: Location.LocationObject | null = null;
      if (kind === 'selfie') {
        position = await ensureLocation();
        if (!position) return;
      }

      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setSubmitError(
          'Camera access is needed to photograph your documents. Enable it in Settings and try again.',
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        // Front camera for the selfie — the server records this as a live
        // capture, and the gallery is deliberately not an option anywhere here.
        cameraType:
          kind === 'selfie' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const captured = await uploadDoc(kind, result.assets[0].uri);
      if (captured && kind === 'selfie' && position) {
        setSelfieMeta({
          capturedAt: new Date().toISOString(),
          captureMethod: 'live_camera',
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          geoStatus: 'ok',
        });
      }
    },
    [ensureLocation, uploadDoc],
  );

  const submit = useCallback(async () => {
    if (!allCaptured || !hasCoords) return;
    setSubmitError(null);
    try {
      await submitKyc({
        aadhaarUrl: uploads.aadhaar.key!,
        licenseUrl: uploads.license.key!,
        selfieUrl: uploads.selfie.key!,
        selfieMetadata: { ...selfieMeta!, userAgent: CLIENT_TAG },
      }).unwrap();
      // Clear the local captures — the server now owns this submission, and
      // the refetched status is what should drive the screen from here.
      setUploads({ aadhaar: EMPTY_UPLOAD, license: EMPTY_UPLOAD, selfie: EMPTY_UPLOAD });
      setSelfieMeta(null);
      refetch();
    } catch (err) {
      const code = getApiErrorCode(err);
      setSubmitError(
        getApiErrorMessage(err, "We couldn't submit your documents. Please try again."),
      );
      // These codes all mean the server's view of the state has moved past
      // ours — refetch so the screen re-derives into the right phase instead
      // of leaving a stale form up.
      if (
        code === 'KYC_PENDING' ||
        code === 'KYC_UPDATE_PENDING' ||
        code === 'KYC_SUSPENDED' ||
        code === 'KYC_COOLDOWN' ||
        code === 'KYC_CHANGE_REQUEST_REQUIRED'
      ) {
        refetch();
      }
    }
  }, [allCaptured, hasCoords, submitKyc, uploads, selfieMeta, refetch]);

  const sendChangeRequest = useCallback(async () => {
    const message = changeMsg.trim();
    // Mirrors the route's Joi rule so the worker is told before the round-trip.
    if (message.length < 10) {
      setChangeError('Please describe the change in at least 10 characters.');
      return;
    }
    setChangeError(null);
    try {
      await requestChange({ message }).unwrap();
      setChangeOpen(false);
      setChangeMsg('');
      refetch();
    } catch (err) {
      setChangeError(getApiErrorMessage(err, "We couldn't send that request."));
    }
  }, [changeMsg, requestChange, refetch]);

  // ── Frame ────────────────────────────────────────────────────────────────

  const header = (
    <View style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Identity verification" onBack={() => router.back()} />
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        {header}
        <LoadingState label="Checking your verification status…" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        {header}
        <View style={styles.centered}>
          <ErrorState
            message={getApiErrorMessage(error, "We couldn't load your verification status.")}
            onRetry={refetch}
          />
        </View>
      </View>
    );
  }

  // Step rail position. In the collecting phases it tracks the captures; in the
  // terminal phases it reflects where the submission itself has reached.
  const currentStep =
    view.phase === 'approved'
      ? 3
      : view.phase === 'review' || view.phase === 'cooldown' || view.phase === 'suspended'
        ? 2
        : uploads.selfie.key
          ? 2
          : uploads.aadhaar.key && uploads.license.key
            ? 1
            : 0;

  const changeRequestStatus = kyc?.changeRequest?.status ?? null;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      {header}

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: (view.canUpload ? 132 : 32) + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Appear>
          <Card variant="outline" style={styles.stepCard}>
            <VerificationSteps current={currentStep} complete={view.phase === 'approved'} />
          </Card>
        </Appear>

        {/* ── Where the submission stands ──────────────────────────────── */}
        <Appear delay={40}>
          {view.phase === 'approved' ? (
            <StatusBanner
              tone="success"
              icon={<ShieldCheck size={18} color={success[600]} />}
              title="You're verified"
              body="Your identity is confirmed. You can go online and start accepting jobs."
            />
          ) : view.phase === 'review' ? (
            <StatusBanner
              tone="warning"
              icon={<Clock size={18} color={accent[700]} />}
              title="Documents under review"
              body="Our team is checking your submission. This usually takes less than 24 hours, and you'll get a notification either way."
            />
          ) : view.phase === 'clarify' ? (
            <StatusBanner
              tone="warning"
              icon={<MessageSquare size={18} color={accent[700]} />}
              title="We need something fixed"
              body="Your submission is on hold until you re-upload. Here's what our reviewer asked for:"
              quote={view.clarificationMessage}
              // All three go up together — `submitKycSchema` requires every key
              // on every submission, so "just fix the one" would be wrong.
              footer="Retake all three photos, fixing the issue above, then submit again."
            />
          ) : view.phase === 'cooldown' ? (
            <StatusBanner
              tone="danger"
              icon={<Clock size={18} color={colors.errorDark} />}
              title="Wait before resubmitting"
              body={`Your last submission was rejected. You can try again in about ${formatCooldown(view.cooldownRemainingMs)}.`}
              quote={view.rejectionReason}
              footer="Use the time to retake clearer photos — a second rejection is harder to come back from."
            />
          ) : view.phase === 'suspended' ? (
            <StatusBanner
              tone="danger"
              icon={<ShieldX size={18} color={colors.errorDark} />}
              title="Verification is locked"
              body="Too many submissions have been rejected, so uploads are paused on this account. Our support team can review your case and reopen it."
              quote={view.rejectionReason}
            />
          ) : view.phase === 'update' ? (
            <StatusBanner
              tone="info"
              icon={<ShieldCheck size={18} color={colors.primary} />}
              title="Change approved — upload your new documents"
              body="Your request was approved. Your current documents stay active until the new ones are reviewed."
            />
          ) : view.rejectionReason ? (
            <StatusBanner
              tone="danger"
              icon={<XCircle size={18} color={colors.errorDark} />}
              title="Your last submission was rejected"
              body="Here's why, so you can fix it this time:"
              quote={view.rejectionReason}
              footer={
                view.rejectionCount > 1
                  ? `${view.rejectionCount} rejections so far. Verification locks after 5.`
                  : undefined
              }
            />
          ) : (
            <StatusBanner
              tone="info"
              icon={<ShieldCheck size={18} color={colors.primary} />}
              title="Verify your identity to start earning"
              body="Three photos, about two minutes. Reviewed within 24 hours."
            />
          )}
        </Appear>

        {/* ── Suspended: the one state support has to unlock ────────────── */}
        {view.phase === 'suspended' ? (
          <Appear delay={80}>
            <Button
              label="Contact support"
              icon={<LifeBuoy size={15} color={colors.textInverse} />}
              onPress={() => router.push('/support')}
              fullWidth
            />
          </Appear>
        ) : null}

        {/* ── Approved: request a document change ───────────────────────── */}
        {view.phase === 'approved' ? (
          <Appear delay={80}>
            <View style={styles.block}>
              {changeRequestStatus === 'pending' ? (
                <StatusBanner
                  tone="warning"
                  icon={<Clock size={16} color={accent[700]} />}
                  title="Change request awaiting approval"
                  body="An admin is reviewing your request. You'll be able to upload new documents once it's approved."
                  quote={kyc?.changeRequest?.message}
                />
              ) : changeRequestStatus === 'denied' ? (
                <StatusBanner
                  tone="danger"
                  icon={<XCircle size={16} color={colors.errorDark} />}
                  title="Change request declined"
                  body="Your documents stay as they are. You can send a new request if something has changed."
                  quote={kyc?.changeRequest?.denialReason}
                />
              ) : null}

              {changeRequestStatus !== 'pending' ? (
                <Button
                  label="Request a document change"
                  variant="secondary"
                  icon={<MessageSquare size={15} color={colors.primary} />}
                  onPress={() => {
                    setChangeError(null);
                    setChangeOpen(true);
                  }}
                  fullWidth
                />
              ) : null}

              <Text variant="caption" color={colors.textMuted} align="center">
                Verified documents can only be replaced with admin approval. This
                protects your account from someone else swapping them.
              </Text>
            </View>
          </Appear>
        ) : null}

        {/* ── The upload form ──────────────────────────────────────────── */}
        {view.canUpload ? (
          <>
            {locationIssue ? (
              <Appear delay={80}>
                <StatusBanner
                  tone="danger"
                  icon={<MapPin size={18} color={colors.errorDark} />}
                  title="Location needed for the selfie"
                  body={locationIssue}
                />
              </Appear>
            ) : null}

            <View style={styles.block}>
              {DOC_KINDS.map((kind, index) => (
                <Appear key={kind} delay={100 + index * 40}>
                  <DocumentCard
                    kind={kind}
                    state={docState(uploads[kind], kyc, kind)}
                    localUri={uploads[kind].localUri}
                    editable
                    onCapture={() => capture(kind)}
                    onPreview={() => setPreview(kind)}
                  />
                </Appear>
              ))}
            </View>

            <Appear delay={240}>
              <SecurityNote />
            </Appear>
          </>
        ) : (
          /* Read-only phases still show what is on file — as state, not as
             images. There is no reason to put an Aadhaar back on screen. */
          <View style={styles.block}>
            {DOC_KINDS.map((kind, index) => (
              <Appear key={kind} delay={100 + index * 40}>
                <DocumentCard
                  kind={kind}
                  state={docState(uploads[kind], kyc, kind)}
                  editable={false}
                  onCapture={() => {}}
                  onPreview={() => {}}
                />
              </Appear>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Submit bar ─────────────────────────────────────────────────── */}
      {view.canUpload ? (
        <View style={[styles.submitBar, { paddingBottom: insets.bottom + spacing.md }]}>
          {submitError ? (
            <View style={styles.submitError}>
              <AlertTriangle size={14} color={colors.errorDark} />
              <Text variant="caption" color={colors.errorDark} style={styles.flex}>
                {submitError}
              </Text>
            </View>
          ) : null}

          {/* Says what is still missing rather than leaving a dead button. */}
          {!allCaptured || !hasCoords ? (
            <Text variant="caption" color={colors.textMuted} align="center" style={styles.hint}>
              {!allCaptured
                ? `${DOC_KINDS.filter((k) => !uploads[k].key).length} of 3 photos still needed`
                : 'Retake your selfie so we can capture your location'}
            </Text>
          ) : null}

          <Button
            label="Submit for verification"
            icon={<ShieldCheck size={16} color={colors.textInverse} />}
            onPress={submit}
            disabled={!allCaptured || !hasCoords || anyUploading}
            loading={submitting}
            fullWidth
          />
        </View>
      ) : null}

      <DocPreview
        uri={preview ? uploads[preview].localUri : null}
        title={preview ? DOC_META[preview].title : ''}
        onClose={() => setPreview(null)}
      />

      <BottomSheet
        visible={changeOpen}
        onClose={() => setChangeOpen(false)}
        title="Request a document change"
      >
        <Text variant="bodySmall" color={colors.textSecondary}>
          Tell us what changed. An admin reviews the request, and you&apos;ll be
          able to upload replacements once it&apos;s approved.
        </Text>
        <Input
          label="Reason"
          placeholder="e.g. My licence was renewed with a new expiry date"
          value={changeMsg}
          onChangeText={setChangeMsg}
          multiline
          maxLength={500}
          containerStyle={styles.changeInput}
        />
        {changeError ? (
          <Text variant="caption" color={colors.error}>
            {changeError}
          </Text>
        ) : null}
        <Button
          label="Send request"
          onPress={sendChangeRequest}
          loading={requesting}
          disabled={changeMsg.trim().length < 10}
          fullWidth
          style={styles.sheetPrimary}
        />
        <Button
          label="Cancel"
          variant="secondary"
          onPress={() => setChangeOpen(false)}
          fullWidth
          style={styles.sheetSecondary}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', paddingHorizontal: screenPadding },
  scroll: { paddingHorizontal: screenPadding, paddingTop: spacing.sm, gap: spacing.base },
  block: { gap: spacing.md },

  stepCard: { paddingVertical: spacing.base },

  submitBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  submitError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.errorTint,
    borderRadius: spacing.md,
    padding: spacing.md,
  },
  hint: { marginBottom: spacing.xxs },

  changeInput: { marginTop: spacing.base },
  sheetPrimary: { marginTop: spacing.lg },
  sheetSecondary: { marginTop: spacing.sm },
});
