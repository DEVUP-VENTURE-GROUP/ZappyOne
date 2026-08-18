/**
 * KYC state — what the worker is actually allowed to do right now.
 * ----------------------------------------------------------------------------
 * `kyc.status` alone does not answer that question, which is why this exists.
 * `kyc.controller.js` gates `POST /workers/kyc/submit` on FOUR things beyond the
 * status string, and a screen that reads only the status will happily walk a
 * worker through three camera captures and an upload before the server rejects
 * the submission:
 *
 *   pending_review + clarification.active   admin asked for a fix — re-upload IS
 *                                           allowed, even though "under review"
 *   approved + changeRequest.approved       re-upload allowed; without an
 *                                           approved request, submit is a 409
 *   rejected + <24h since lastRejectedAt    429 KYC_COOLDOWN
 *   rejectionCount >= 5                     403 KYC_SUSPENDED, applied at submit
 *                                           time even while the status still
 *                                           reads "rejected"
 *
 * So the phase below is derived from the whole object. Everything the UI turns
 * on — can you upload, is there a form, what does the banner say — hangs off it.
 *
 * ── ON THE TWO CONSTANTS ───────────────────────────────────────────────────
 * `COOLDOWN_MS` and `SUSPENSION_THRESHOLD` mirror values in the server
 * controller. They are PREVIEWS, never authority: they exist so the worker is
 * told "you can resubmit in 6 hours" up front instead of after re-photographing
 * three documents. The server decides. If a preview is ever wrong, the submit
 * call still fails and the server's own message is what gets shown.
 * ----------------------------------------------------------------------------
 */

import type { KycStatus, WorkerKyc } from '../../types/api';

/** Mirrors RESUBMIT_COOLDOWN_MS in kyc.controller.js. Preview only. */
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** Mirrors SUSPENSION_THRESHOLD in kyc.controller.js. Preview only. */
const SUSPENSION_THRESHOLD = 5;

export type KycPhase =
  /** Upload form open — first submission, or resubmitting after a rejection. */
  | 'collect'
  /** Admin asked a question; re-upload allowed while still "under review". */
  | 'clarify'
  /** Approved, and an approved change request re-opens the form. */
  | 'update'
  /** Submitted, nothing for the worker to do. */
  | 'review'
  | 'approved'
  /** Rejected, still inside the 24h resubmission window. */
  | 'cooldown'
  /** Locked out after repeated rejections; only support can move this. */
  | 'suspended';

export interface KycView {
  phase: KycPhase;
  /** Whether the upload form should be rendered at all. */
  canUpload: boolean;
  /** Milliseconds left on the resubmission cooldown; 0 when not waiting. */
  cooldownRemainingMs: number;
  /** Admin's rejection reason, when there is one to show. */
  rejectionReason?: string;
  /** Admin's clarification question, when one is open. */
  clarificationMessage?: string;
  /** Rejections so far, only when the server is actually counting them. */
  rejectionCount: number;
}

export function deriveKycView(kyc: WorkerKyc | undefined, now = Date.now()): KycView {
  const status: KycStatus = kyc?.status ?? 'not_submitted';
  const rejectionCount = kyc?.rejectionCount ?? 0;
  const clarificationActive = kyc?.clarification?.active === true;
  const changeRequestStatus = kyc?.changeRequest?.status ?? null;

  const base = {
    cooldownRemainingMs: 0,
    rejectionReason: kyc?.rejectionReason ?? undefined,
    clarificationMessage: kyc?.clarification?.message ?? undefined,
    rejectionCount,
  };

  // Suspension outranks everything — the server checks it before any other
  // gate, and it is the one state the worker cannot resolve inside the app.
  if (status === 'suspended' || rejectionCount >= SUSPENSION_THRESHOLD) {
    return { ...base, phase: 'suspended', canUpload: false };
  }

  if (status === 'approved') {
    // An approved change request is the only thing that re-opens the form for
    // a verified worker; the server 409s on a direct resubmission otherwise.
    if (changeRequestStatus === 'approved') {
      return { ...base, phase: 'update', canUpload: true };
    }
    return { ...base, phase: 'approved', canUpload: false };
  }

  if (status === 'pending_review') {
    return clarificationActive
      ? { ...base, phase: 'clarify', canUpload: true }
      : { ...base, phase: 'review', canUpload: false };
  }

  if (status === 'rejected') {
    const rejectedAt = kyc?.lastRejectedAt ? Date.parse(kyc.lastRejectedAt) : NaN;
    // A missing or unparseable timestamp must not invent a lockout — fall
    // through to the form and let the server rule on it.
    if (Number.isFinite(rejectedAt)) {
      const remaining = rejectedAt + COOLDOWN_MS - now;
      if (remaining > 0) {
        return { ...base, phase: 'cooldown', canUpload: false, cooldownRemainingMs: remaining };
      }
    }
    return { ...base, phase: 'collect', canUpload: true };
  }

  return { ...base, phase: 'collect', canUpload: true };
}

/** "6 hours" / "45 minutes" — for the cooldown copy. */
export function formatCooldown(ms: number): string {
  if (ms <= 0) return 'a moment';
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

// ── Documents ───────────────────────────────────────────────────────────────

export type DocKind = 'aadhaar' | 'license' | 'selfie';

/**
 * The three documents `submitKycSchema` requires. All three are mandatory —
 * the Joi schema marks every one `.required()`, so there is no optional tier
 * to represent here.
 */
export const DOC_KINDS: DocKind[] = ['aadhaar', 'license', 'selfie'];

/** Which `WorkerKyc` key holds the stored S3 key for each document. */
export const DOC_STORED_KEY: Record<DocKind, keyof WorkerKyc> = {
  aadhaar: 'aadhaarUrl',
  license: 'licenseUrl',
  selfie: 'selfieUrl',
};

/**
 * Per-document display state.
 *
 * ── AN HONEST LIMIT ────────────────────────────────────────────────────────
 * `required`, `uploading`, `uploaded` and `failed` are genuinely per-document:
 * they describe this session's capture-and-upload of that one file.
 *
 * `pending`, `verified` and `rejected` are NOT. The backend reviews a
 * SUBMISSION, not a document — there is one `kyc.status`, one `rejectionReason`
 * and no per-document verdict field anywhere in `worker.model.js`. So those
 * three states are the submission's verdict shown against each document that
 * is part of it. Rendering a green "Verified" on one card and a red one on
 * another would be an invention; every card moves together, which is what
 * actually happened.
 */
export type DocState =
  | 'required'
  | 'uploading'
  | 'uploaded'
  | 'failed'
  | 'pending'
  | 'verified'
  | 'rejected';

/** This session's capture of one document. */
export interface DocUpload {
  /** Local `file://` preview URI. Never leaves the device. */
  localUri: string | null;
  /** S3 object key from the presign flow — what gets submitted. */
  key: string | null;
  uploading: boolean;
  failed: boolean;
}

export const EMPTY_UPLOAD: DocUpload = {
  localUri: null,
  key: null,
  uploading: false,
  failed: false,
};

/**
 * A fresh capture always wins: once the worker replaces a document in this
 * session, its card must reflect the new file, not the verdict on the old one.
 */
export function docState(
  upload: DocUpload,
  kyc: WorkerKyc | undefined,
  kind: DocKind,
): DocState {
  if (upload.uploading) return 'uploading';
  if (upload.failed) return 'failed';
  if (upload.key) return 'uploaded';

  // Presence of the stored key is all that is read here — never its value.
  const onFile = Boolean(kyc?.[DOC_STORED_KEY[kind]]);
  if (!onFile) return 'required';

  switch (kyc?.status) {
    case 'approved':
      return 'verified';
    case 'pending_review':
      return 'pending';
    case 'rejected':
    case 'suspended':
      return 'rejected';
    default:
      return 'required';
  }
}

/** Copy for each document card. Instructions are the point of this screen. */
export const DOC_META: Record<
  DocKind,
  { title: string; hint: string; tips: string[]; liveOnly?: boolean }
> = {
  aadhaar: {
    title: 'Aadhaar card',
    hint: 'Front side — the photo, name and number must all be readable',
    tips: [
      'Lay it flat on a plain surface',
      'Fit all four corners in the frame',
      'Avoid glare from direct light',
    ],
  },
  license: {
    title: 'Driving licence',
    hint: 'Your government-issued licence, front side',
    tips: [
      'Make sure the expiry date is visible',
      'Fit all four corners in the frame',
      'Hold steady until the photo is sharp',
    ],
  },
  selfie: {
    title: 'Live selfie',
    hint: 'Taken right now on the front camera — a saved photo will not do',
    liveOnly: true,
    tips: [
      'Face the light, not a window behind you',
      'Remove sunglasses, cap or mask',
      'Keep your whole face inside the frame',
    ],
  },
};
