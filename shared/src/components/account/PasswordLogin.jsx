import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, ArrowLeft, MailCheck } from 'lucide-react';
import { usePasswordLoginMutation, useForgotPasswordMutation, useResetPasswordMutation, useAccountCapabilitiesQuery } from '../../services/api';
import PasswordField, { passwordOk } from './PasswordField';

/**
 * Sign in with phone or verified email + password, and recover a forgotten
 * password: a free email link when the email is verified, otherwise an SMS
 * code entered right here with the new password.
 *
 *   role       'user' | 'worker' | 'shop' | 'event_partner'
 *   onSuccess  receives the login response ({ accessToken, user|worker|shop|partner })
 *   onUseOtp   switches the page back to OTP sign-in
 */
export default function PasswordLogin({ role, onSuccess, onUseOtp }) {
  const [mode, setMode] = useState('login'); // login | forgot | otp-reset | sent
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [newPw, setNewPw] = useState('');
  const [sentTo, setSentTo] = useState(null);
  const [login, { isLoading: signingIn }] = usePasswordLoginMutation();
  const [forgot, { isLoading: asking }] = useForgotPasswordMutation();
  const [reset, { isLoading: resetting }] = useResetPasswordMutation();
  // Email sign-in and reset links are offered only once outgoing mail is set up.
  const { data: caps } = useAccountCapabilitiesQuery();
  const email = !!caps?.email;

  async function doLogin(e) {
    e.preventDefault();
    try {
      const r = await login({ role, identifier: identifier.trim(), password }).unwrap();
      onSuccess(r);
    } catch (err) { toast.error(err?.data?.error || 'That did not go through. Check your details and try again.'); }
  }

  async function doForgot(e) {
    e.preventDefault();
    try {
      const r = await forgot({ role, identifier: identifier.trim() }).unwrap();
      setSentTo(r.to);
      setMode(r.channel === 'sms' ? 'otp-reset' : 'sent');
    } catch (err) { toast.error(err?.data?.error || 'That did not go through. Check the number and try again.'); }
  }

  async function doOtpReset(e) {
    e.preventDefault();
    try {
      await reset({ role, identifier: identifier.trim(), otp, newPassword: newPw }).unwrap();
      toast.success('Password changed. Sign in with it now.');
      setPassword(''); setOtp(''); setNewPw('');
      setMode('login');
    } catch (err) { toast.error(err?.data?.error || 'That did not go through. Check the code and try again.'); }
  }

  const idField = (
    <div>
      <label htmlFor="pl-id" className="mb-1.5 block text-[13px] font-semibold text-ink-700">{email ? 'Mobile number or email' : 'Mobile number'}</label>
      <input id="pl-id" className="input w-full" autoComplete="username" inputMode={email ? 'text' : 'tel'} value={identifier} onChange={(e) => setIdentifier(e.target.value)}
        placeholder={email ? '98765 43210 or you@example.com' : '98765 43210'} />
    </div>
  );

  if (mode === 'sent') {
    return (
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-btn bg-green-50 p-3 text-[14px] text-green-800">
          <MailCheck size={18} className="mt-0.5 shrink-0" />
          {sentTo ? `If an account matches, a reset link is on its way to ${sentTo}. It works for 30 minutes.` : 'If an account matches, a reset link is on its way to its email. It works for 30 minutes.'}
        </p>
        <button type="button" onClick={() => setMode('login')} className="btn-outline w-full"><ArrowLeft size={16} /> Back to sign in</button>
      </div>
    );
  }

  if (mode === 'otp-reset') {
    return (
      <form onSubmit={doOtpReset} className="space-y-4">
        <p className="text-[14px] text-ink-500">We sent a code to {sentTo}. Enter it and choose a new password.</p>
        <div>
          <label htmlFor="pl-otp" className="mb-1.5 block text-[13px] font-semibold text-ink-700">Code</label>
          <input id="pl-otp" className="input w-full tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} />
        </div>
        <PasswordField id="pl-new" label="New password" value={newPw} onChange={setNewPw} showRules />
        <button type="submit" disabled={resetting || otp.length < 4 || !passwordOk(newPw)} className="btn-primary w-full">
          {resetting && <Loader2 size={16} className="animate-spin" />} Change password
        </button>
        <button type="button" onClick={() => setMode('login')} className="w-full text-[13px] font-semibold text-ink-500">Back to sign in</button>
      </form>
    );
  }

  if (mode === 'forgot') {
    return (
      <form onSubmit={doForgot} className="space-y-4">
        <p className="text-[14px] text-ink-500">
          {email ? 'We send a reset link to your confirmed email, or a code to your phone if you have not confirmed an email.' : 'We send a code to your phone. Enter it with your new password.'}
        </p>
        {idField}
        <button type="submit" disabled={asking || identifier.trim().length < 5} className="btn-primary w-full">
          {asking && <Loader2 size={16} className="animate-spin" />} Send reset
        </button>
        <button type="button" onClick={() => setMode('login')} className="w-full text-[13px] font-semibold text-ink-500">Back to sign in</button>
      </form>
    );
  }

  return (
    <form onSubmit={doLogin} className="space-y-4">
      {idField}
      <PasswordField id="pl-pw" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
      <div className="flex justify-end">
        <button type="button" onClick={() => setMode('forgot')} className="text-[13px] font-semibold text-zappy-600">Forgot password?</button>
      </div>
      <button type="submit" disabled={signingIn || !identifier.trim() || !password} className="btn-primary w-full">
        {signingIn && <Loader2 size={16} className="animate-spin" />} Sign in
      </button>
      {onUseOtp && <button type="button" onClick={onUseOtp} className="w-full text-[13px] font-semibold text-ink-500">Sign in with an OTP instead</button>}
    </form>
  );
}
