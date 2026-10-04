import { useState } from 'react';
import toast from 'react-hot-toast';
import { KeyRound, Mail, Loader2, CheckCircle2, Clock } from 'lucide-react';
import { useAccountMeQuery, useSetAccountPasswordMutation, useStartEmailVerificationMutation } from '../../services/api';
import PasswordField, { passwordOk } from './PasswordField';

/** Password and email after setup: change the password, add or change the email, resend its link. */
export default function LoginSecurityCard({ className = '' }) {
  const { data: st } = useAccountMeQuery();
  const [setPassword, { isLoading: savingPw }] = useSetAccountPasswordMutation();
  const [startEmail, { isLoading: sending }] = useStartEmailVerificationMutation();
  const [open, setOpen] = useState(null); // 'password' | 'email'
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [email, setEmail] = useState('');

  if (!st) return null;

  async function savePw(e) {
    e.preventDefault();
    try {
      await setPassword({ currentPassword: cur, newPassword: pw }).unwrap();
      toast.success(st.hasPassword ? 'Password changed' : 'Password set');
      setCur(''); setPw(''); setOpen(null);
    } catch (err) { toast.error(err?.data?.error || 'Could not save'); }
  }

  async function sendEmail(e) {
    e?.preventDefault();
    try {
      const r = await startEmail({ email: (email || st.pendingEmail || st.email || '').trim() }).unwrap();
      toast.success(r.emailSent ? 'Confirmation link sent. Check your inbox.' : 'Saved. The confirmation email could not be sent right now.');
      setEmail(''); setOpen(null);
    } catch (err) { toast.error(err?.data?.error || 'Could not send'); }
  }

  const emailLine = st.pendingEmail || (!st.emailVerified && st.email)
    ? { Icon: Clock, tone: 'text-amber-700', text: `${st.pendingEmail || st.email}: waiting for confirmation` }
    : st.email ? { Icon: CheckCircle2, tone: 'text-green-700', text: `${st.email}: confirmed` } : { Icon: Mail, tone: 'text-ink-500', text: 'No email added' };

  return (
    <section className={`rounded-card border border-line bg-white ${className}`}>
      <p className="border-b border-line px-4 py-3 text-[15px] font-bold text-ink-900">Login & security</p>

      <div className="border-b border-line p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-btn bg-sunken text-ink-700"><KeyRound size={16} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-ink-900">Password</span>
            <span className="block text-[12px] text-ink-500">{st.hasPassword ? `Set${st.passwordSetAt ? ` on ${new Date(st.passwordSetAt).toLocaleDateString('en-IN')}` : ''}` : 'Not set: you sign in with an OTP each time'}</span>
          </span>
          <button type="button" onClick={() => setOpen(open === 'password' ? null : 'password')} className="btn-outline min-h-[36px] px-3 text-[13px]">{st.hasPassword ? 'Change' : 'Set'}</button>
        </div>
        {open === 'password' && (
          <form onSubmit={savePw} className="mt-3 space-y-3">
            {st.hasPassword && <PasswordField id="ls-cur" label="Current password" value={cur} onChange={setCur} autoComplete="current-password" />}
            <PasswordField id="ls-new" label="New password" value={pw} onChange={setPw} showRules phone={st.phone} />
            <button type="submit" disabled={savingPw || !passwordOk(pw, st.phone) || (st.hasPassword && !cur)} className="btn-primary w-full">
              {savingPw && <Loader2 size={16} className="animate-spin" />} Save password
            </button>
          </form>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-btn bg-sunken text-ink-700"><Mail size={16} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-ink-900">Email</span>
            <span className={`flex items-center gap-1 truncate text-[12px] ${emailLine.tone}`}><emailLine.Icon size={12} /> {emailLine.text}</span>
          </span>
          <button type="button" onClick={() => setOpen(open === 'email' ? null : 'email')} className="btn-outline min-h-[36px] px-3 text-[13px]">{st.email || st.pendingEmail ? 'Change' : 'Add'}</button>
        </div>
        {(st.pendingEmail || (st.email && !st.emailVerified)) && open !== 'email' && (
          <button type="button" onClick={() => sendEmail()} disabled={sending} className="mt-2 text-[13px] font-semibold text-zappy-600">Resend confirmation link</button>
        )}
        {open === 'email' && (
          <form onSubmit={sendEmail} className="mt-3 space-y-3">
            <input type="email" className="input w-full" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            <button type="submit" disabled={sending || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())} className="btn-primary w-full">
              {sending && <Loader2 size={16} className="animate-spin" />} Send confirmation link
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
