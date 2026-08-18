/**
 * KYC presentation — banners, document cards, the step rail, the doc viewer.
 * ----------------------------------------------------------------------------
 * Verification is the one flow where a worker is handing over their identity
 * documents to a company they have no reason to trust yet, and the outcome
 * gates their income. So the design commits to two things:
 *
 *   TELL THEM WHERE THEY STAND. Every state — required, uploaded, in review,
 *   verified, rejected — is a labelled badge, never a bare colour. The step
 *   rail shows how far along the whole submission is.
 *
 *   SHOW THE DOCUMENTS ONLY ON PURPOSE. A captured Aadhaar is not left sitting
 *   on screen as a thumbnail where anyone nearby can read it. The card shows
 *   that a file is attached; seeing it takes a deliberate tap, and it opens in
 *   a viewer that closes again. Nothing about a document is ever logged.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import {
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  FileText,
  Lock,
  RefreshCw,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react-native';
import { Button, Card, Chip, Text } from '../ui';
import { colors, slate, success, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import type { ChipTone } from '../ui';
import type { DocKind, DocState } from './kycState';
import { DOC_META } from './kycState';

// ── Status banner ───────────────────────────────────────────────────────────

export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

const BANNER: Record<BannerTone, { bg: string; fg: string; border: string }> = {
  info: { bg: colors.infoTint, fg: zappy[700], border: colors.primarySoft },
  success: { bg: colors.successTint, fg: success[700], border: success[100] },
  warning: { bg: colors.warningTint, fg: '#B45309', border: colors.warningTint },
  danger: { bg: colors.errorTint, fg: colors.errorDark, border: colors.errorTint },
};

export interface StatusBannerProps {
  tone: BannerTone;
  icon: React.ReactNode;
  title: string;
  body: string;
  /** Admin's own words — rendered quoted so it reads as a message, not our copy. */
  quote?: string;
  footer?: string;
  children?: React.ReactNode;
}

function StatusBannerBase({ tone, icon, title, body, quote, footer, children }: StatusBannerProps) {
  const palette = BANNER[tone];
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <View style={styles.bannerRow}>
        <View style={styles.bannerIcon}>{icon}</View>
        <View style={styles.flex}>
          <Text variant="bodySmall" weight="bold" color={palette.fg}>
            {title}
          </Text>
          <Text variant="caption" color={palette.fg} style={styles.bannerBody}>
            {body}
          </Text>
          {quote ? (
            <View style={[styles.quote, { borderLeftColor: palette.fg }]}>
              <Text variant="caption" color={palette.fg} style={styles.quoteText}>
                {quote}
              </Text>
            </View>
          ) : null}
          {footer ? (
            <Text variant="caption" color={palette.fg} style={styles.bannerFooter}>
              {footer}
            </Text>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
}

export const StatusBanner = memo(StatusBannerBase);

// ── Step rail ───────────────────────────────────────────────────────────────

export interface VerificationStepsProps {
  /** Index of the step in progress. Everything before it renders as done. */
  current: number;
  /** True once the whole submission is approved — the last step goes green. */
  complete?: boolean;
}

const STEPS = ['Documents', 'Selfie', 'Review', 'Verified'];

/**
 * Four dots and three connectors. This is the only place the worker can see
 * that "in review" is a stage with something after it rather than a dead end.
 */
function VerificationStepsBase({ current, complete }: VerificationStepsProps) {
  return (
    <View style={styles.steps} accessibilityRole="progressbar" accessibilityLabel={
      complete ? 'Verification complete' : `Step ${current + 1} of ${STEPS.length}: ${STEPS[current]}`
    }>
      {STEPS.map((label, index) => {
        const done = complete || index < current;
        const active = !complete && index === current;
        return (
          <React.Fragment key={label}>
            {index > 0 ? (
              <View style={[styles.connector, done ? styles.connectorDone : null]} />
            ) : null}
            <View style={styles.step}>
              <View
                style={[
                  styles.stepDot,
                  done ? styles.stepDotDone : active ? styles.stepDotActive : null,
                ]}
              >
                {done ? (
                  <Check size={11} color={colors.textInverse} strokeWidth={3} />
                ) : (
                  <Text
                    variant="caption"
                    weight="bold"
                    color={active ? colors.textInverse : colors.textMuted}
                    style={styles.stepNumber}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                variant="caption"
                color={done || active ? colors.textPrimary : colors.textMuted}
                numberOfLines={1}
                style={styles.stepLabel}
              >
                {label}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

export const VerificationSteps = memo(VerificationStepsBase);

// ── Document card ───────────────────────────────────────────────────────────

/** Badge copy and tone per state. The label always ships with the colour. */
const STATE_BADGE: Record<DocState, { label: string; tone: ChipTone }> = {
  required: { label: 'Required', tone: 'neutral' },
  uploading: { label: 'Uploading…', tone: 'blue' },
  uploaded: { label: 'Uploaded', tone: 'blue' },
  failed: { label: 'Upload failed', tone: 'red' },
  pending: { label: 'In review', tone: 'accent' },
  verified: { label: 'Verified', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'red' },
};

export interface DocumentCardProps {
  kind: DocKind;
  state: DocState;
  /** Local preview of what was just captured. Shown only inside the viewer. */
  localUri?: string | null;
  /** False in read-only phases (in review, approved, suspended, cooldown). */
  editable: boolean;
  onCapture: () => void;
  onPreview: () => void;
}

function DocumentCardBase({
  kind,
  state,
  localUri,
  editable,
  onCapture,
  onPreview,
}: DocumentCardProps) {
  const meta = DOC_META[kind];
  const badge = STATE_BADGE[state];
  const [tipsOpen, setTipsOpen] = useState(false);

  const done = state === 'uploaded' || state === 'verified';
  const bad = state === 'rejected' || state === 'failed';
  const Icon = kind === 'selfie' ? Camera : FileText;

  const actionLabel =
    state === 'uploading'
      ? 'Uploading'
      : state === 'failed'
        ? 'Try again'
        : done || state === 'pending' || state === 'rejected'
          ? kind === 'selfie'
            ? 'Retake'
            : 'Replace'
          : kind === 'selfie'
            ? 'Open camera'
            : 'Capture';

  return (
    <Card
      variant="outline"
      style={[styles.docCard, done ? styles.docCardDone : bad ? styles.docCardBad : null]}
    >
      <View style={styles.docRow}>
        <View
          style={[
            styles.docIcon,
            done ? styles.docIconDone : bad ? styles.docIconBad : null,
          ]}
        >
          {state === 'uploading' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : done ? (
            <CheckCircle2 size={19} color={success[600]} strokeWidth={2} />
          ) : (
            <Icon
              size={19}
              color={bad ? colors.error : colors.textMuted}
              strokeWidth={1.9}
            />
          )}
        </View>

        <View style={styles.flex}>
          <View style={styles.docTitleRow}>
            <Text variant="bodySmall" weight="semibold" numberOfLines={1} style={styles.flex}>
              {meta.title}
            </Text>
            {meta.liveOnly ? <Chip label="LIVE ONLY" tone="blue" /> : null}
          </View>
          <Text variant="caption" color={colors.textMuted} style={styles.docHint}>
            {meta.hint}
          </Text>
          <View style={styles.docBadgeRow}>
            <Chip label={badge.label} tone={badge.tone} />
          </View>
        </View>
      </View>

      {/* Actions. "Check photo" is the ONLY route to the image — no ambient
          thumbnail of an identity document sits on the screen. */}
      <View style={styles.docActions}>
        {editable ? (
          <Button
            label={actionLabel}
            variant={done ? 'secondary' : 'outline'}
            size="small"
            icon={
              done || state === 'rejected' || state === 'failed' ? (
                <RefreshCw size={13} color={colors.primary} />
              ) : kind === 'selfie' ? (
                <Camera size={13} color={colors.primary} />
              ) : (
                <Upload size={13} color={colors.primary} />
              )
            }
            disabled={state === 'uploading'}
            loading={state === 'uploading'}
            onPress={onCapture}
          />
        ) : null}

        {localUri ? (
          <Button
            label="Check photo"
            variant="ghost"
            size="small"
            icon={<Eye size={13} color={colors.primary} />}
            onPress={onPreview}
          />
        ) : null}

        <Pressable
          onPress={() => setTipsOpen((open) => !open)}
          style={styles.tipsToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: tipsOpen }}
          accessibilityLabel={`Photo tips for ${meta.title}`}
        >
          <Text variant="caption" color={colors.textSecondary}>
            Tips
          </Text>
          <ChevronDown
            size={13}
            color={colors.textSecondary}
            style={tipsOpen ? styles.chevronOpen : undefined}
          />
        </Pressable>
      </View>

      {tipsOpen ? (
        <View style={styles.tips}>
          {meta.tips.map((tip) => (
            <View key={tip} style={styles.tipRow}>
              <View style={styles.tipDot} />
              <Text variant="caption" color={colors.textSecondary} style={styles.flex}>
                {tip}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

export const DocumentCard = memo(DocumentCardBase);

// ── Document viewer ─────────────────────────────────────────────────────────

export interface DocPreviewProps {
  uri: string | null;
  title: string;
  onClose: () => void;
}

/**
 * Full-screen look at what was just captured, so a blurred or cropped photo is
 * caught here rather than by a reviewer 24 hours later. It is a modal on
 * purpose: the document is on screen while the worker is looking at it and
 * gone the moment they are done.
 */
function DocPreviewBase({ uri, title, onClose }: DocPreviewProps) {
  return (
    <Modal
      visible={Boolean(uri)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.viewer}>
        <View style={styles.viewerBar}>
          <Text variant="bodySmall" weight="semibold" color={colors.textInverse}>
            {title}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close preview"
          >
            <X size={22} color={colors.textInverse} />
          </Pressable>
        </View>
        {uri ? (
          <Image source={{ uri }} style={styles.viewerImage} resizeMode="contain" />
        ) : null}
        <Text variant="caption" color={slate[400]} align="center" style={styles.viewerNote}>
          Only you can see this. Close when you&apos;re done checking it.
        </Text>
      </View>
    </Modal>
  );
}

export const DocPreview = memo(DocPreviewBase);

// ── Security note ───────────────────────────────────────────────────────────

/**
 * Says what happens to the documents. A worker asked to photograph their
 * Aadhaar deserves that stated plainly, not buried in a policy page.
 */
function SecurityNoteBase() {
  return (
    <View style={styles.security}>
      <View style={styles.securityHead}>
        <Lock size={13} color={colors.textSecondary} />
        <Text variant="caption" weight="semibold" color={colors.textSecondary}>
          How your documents are handled
        </Text>
      </View>
      {[
        'Sent over an encrypted connection to private storage',
        'Used only to confirm your identity — never shown to customers',
        'Once approved, they can only be changed with admin approval',
      ].map((line) => (
        <View key={line} style={styles.securityRow}>
          <ShieldCheck size={12} color={colors.textMuted} style={styles.securityIcon} />
          <Text variant="caption" color={colors.textMuted} style={styles.flex}>
            {line}
          </Text>
        </View>
      ))}
    </View>
  );
}

export const SecurityNote = memo(SecurityNoteBase);

const styles = StyleSheet.create({
  flex: { flex: 1 },

  banner: {
    borderRadius: radius.large,
    borderWidth: 1,
    padding: spacing.base,
    gap: spacing.md,
  },
  bannerRow: { flexDirection: 'row', gap: spacing.md },
  bannerIcon: { paddingTop: 1 },
  bannerBody: { marginTop: spacing.xxs, lineHeight: 17 },
  bannerFooter: { marginTop: spacing.xs, opacity: 0.8 },
  quote: {
    borderLeftWidth: 2,
    paddingLeft: spacing.sm,
    marginTop: spacing.sm,
    opacity: 0.95,
  },
  quoteText: { fontStyle: 'italic', lineHeight: 17 },

  steps: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.xs,
  },
  step: { alignItems: 'center', width: 62, gap: spacing.xs },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: colors.primary },
  stepDotDone: { backgroundColor: success[600] },
  stepNumber: { fontSize: 10, lineHeight: 14 },
  stepLabel: { fontSize: 10, lineHeight: 13 },
  connector: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.surfaceTertiary,
    marginTop: 10,
  },
  connectorDone: { backgroundColor: success[600] },

  docCard: { gap: spacing.md },
  docCardDone: { borderColor: success[100], backgroundColor: '#F6FDF9' },
  docCardBad: { borderColor: colors.errorTint },
  docRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docIconDone: { backgroundColor: colors.successTint },
  docIconBad: { backgroundColor: colors.errorTint },
  docTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  docHint: { marginTop: spacing.xxs, lineHeight: 16 },
  docBadgeRow: { marginTop: spacing.sm, flexDirection: 'row' },

  docActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  tipsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginLeft: 'auto',
  },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  tips: {
    gap: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tipDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.textMuted,
  },

  // Fully opaque, not a scrim: nothing of the page should read through behind
  // an identity document that is open on screen.
  viewer: { flex: 1, backgroundColor: '#020617', padding: spacing.base },
  viewerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xxl,
    paddingBottom: spacing.base,
  },
  viewerImage: { flex: 1, width: '100%', borderRadius: radius.large },
  viewerNote: { paddingVertical: spacing.lg },

  security: {
    gap: spacing.sm,
    padding: spacing.base,
    borderRadius: radius.large,
    backgroundColor: colors.surfaceSecondary,
  },
  securityHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  securityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  securityIcon: { marginTop: 2 },
});
