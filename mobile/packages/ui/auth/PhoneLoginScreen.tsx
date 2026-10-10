/**
 * Phone sign-in, for every ZappyOne app: the app's title over the shared
 * phone form (PhoneOtpForm).
 */
import type { ReactNode } from 'react';
import { AuthShell } from './AuthShell';
import { PhoneOtpForm, type PhoneOtpFormProps } from './PhoneOtpForm';

export interface PhoneLoginScreenProps extends PhoneOtpFormProps {
  title: string;
  subtitle: string;
  /** Shown under the form, e.g. a switch between owner and technician. */
  footer?: ReactNode;
  /** Shown above the phone field. */
  header?: ReactNode;
}

export function PhoneLoginScreen({ title, subtitle, role, otpPath, params, footer, header }: PhoneLoginScreenProps) {
  return (
    <AuthShell title={title} subtitle={subtitle} footer={footer}>
      {header}
      <PhoneOtpForm role={role} otpPath={otpPath} params={params} />
    </AuthShell>
  );
}
