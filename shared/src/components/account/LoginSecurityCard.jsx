import { useState } from 'react';
import toast from 'react-hot-toast';
import { KeyRound, Mail, Loader2, CheckCircle2, Clock } from 'lucide-react';
import { useAccountMeQuery, useSetAccountPasswordMutation, useStartEmailVerificationMutation } from '../../services/api';
import PasswordField, { passwordOk } from './PasswordField';
import { useServiceProT } from '../../i18n/I18nProvider';

/** Password and email after setup: change the password, add or change the email, resend its link. */
export default function LoginSecurityCard({ className = '' }) {
  const { data: st } = useAccountMeQuery();
  const [setPassword, { isLoading: savingPw }] = useSetAccountPasswordMutation();
  const [startEmail, { isLoading: sending }] = useStartEmailVerificationMutation();
  const [open, setOpen] = useState(null); // 'password' | 'email'
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [email, setEmail] = useState('');
  const t = useServiceProT();

  if (!st) return null;

  async function savePw(e) {
    e.preventDefault();
    try {
      await setPassword({ currentPassword: cur, newPassword: pw }).unwrap();
      toast.success(st.hasPassword ? t('sp.sec.pwChanged', 'Password changed') : t('sp.sec.pwSet', 'Password set'));
      setCur(''); setPw(''); setOpen(null);
    } catch (err) { toast.error(t(`sp.err.${err?.data?.code}`, err?.data?.error || t('sp.sec.saveFail', 'Could not save'))); }
  }

  async function sendEmail(e) {
    e?.preventDefault();
    try {
      const r = await startEmail({ email: (email || st.pendingEmail || st.email || '').trim() }).unwrap();
      toast.success(r.emailSent ? t('sp.sec.linkSent', 'Confirmation link sent. Check your inbox.') : t('sp.sec.linkNotSent', 'Saved. The confirmation email could not be sent right now.'));
      setEmail(''); setOpen(null);
    } catch (err) { toast.error(err?.data?.error || t('sp.sec.sendFail', 'Could not send')); }
  }

  const emailLine = st.pendingEmail || (!st.emailVerified && st.email)
    ? { Icon: Clock, tone: 'text-amber-700', text: t('sp.sec.waiting', '{email}: waiting for confirmation').replace('{email}', st.pendingEmail || st.email) }
    : st.email ? { Icon: CheckCircle2, tone: 'text-green-700', text: t('sp.sec.confirmed', '{email}: confirmed').replace('{email}', st.email) } : { Icon: Mail, tone: 'text-ink-500', text: t('sp.sec.noEmail', 'No email added') };

  return (
    <section className={`rounded-card border border-line bg-white ${className}`}>
      <p className="border-b border-line px-4 py-3 text-[15px] font-bold text-ink-900">{t('sp.sec.title', 'Login & security')}</p>

      <div className={`p-4 ${st.mailConfigured ? 'border-b border-line' : ''}`}>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-btn bg-sunken text-ink-700"><KeyRound size={16} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-ink-900">{t('sp.sec.password', 'Password')}</span>
            <span className="block text-[12px] text-ink-500">{st.hasPassword ? (st.passwordSetAt ? t('sp.sec.setOn', 'Set on {date}').replace('{date}', new Date(st.passwordSetAt).toLocaleDateString('en-IN')) : t('sp.set', 'Set')) : t('sp.sec.notSet', 'Not set: you sign in with an OTP each time')}</span>
          </span>
          <button type="button" onClick={() => setOpen(open === 'password' ? null : 'password')} className="btn-outline min-h-[36px] px-3 text-[13px]">{st.hasPassword ? t('sp.change', 'Change') : t('sp.set', 'Set')}</button>
        </div>
        {open === 'password' && (
          <form onSubmit={savePw} className="mt-3 space-y-3">
            {st.hasPassword && <PasswordField id="ls-cur" label={t('sp.sec.current', 'Current password')} value={cur} onChange={setCur} autoComplete="current-password" />}
            <PasswordField id="ls-new" label={t('sp.sec.new', 'New password')} value={pw} onChange={setPw} showRules phone={st.phone} />
            <button type="submit" disabled={savingPw || !passwordOk(pw, st.phone) || (st.hasPassword && !cur)} className="btn-primary w-full">
              {savingPw && <Loader2 size={16} className="animate-spin" />} {t('sp.sec.savePw', 'Save password')}
            </button>
          </form>
        )}
      </div>

      {/* The email row appears once outgoing mail is set up; until then it could not be confirmed. */}
      {st.mailConfigured && <div className="p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-btn bg-sunken text-ink-700"><Mail size={16} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-ink-900">{t('sp.sec.email', 'Email')}</span>
            <span className={`flex items-center gap-1 truncate text-[12px] ${emailLine.tone}`}><emailLine.Icon size={12} /> {emailLine.text}</span>
          </span>
          <button type="button" onClick={() => setOpen(open === 'email' ? null : 'email')} className="btn-outline min-h-[36px] px-3 text-[13px]">{st.email || st.pendingEmail ? t('sp.change', 'Change') : t('sp.add', 'Add')}</button>
        </div>
        {(st.pendingEmail || (st.email && !st.emailVerified)) && open !== 'email' && (
          <button type="button" onClick={() => sendEmail()} disabled={sending} className="mt-2 text-[13px] font-semibold text-zappy-600">{t('sp.sec.resend', 'Resend confirmation link')}</button>
        )}
        {open === 'email' && (
          <form onSubmit={sendEmail} className="mt-3 space-y-3">
            <input type="email" className="input w-full" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            <button type="submit" disabled={sending || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())} className="btn-primary w-full">
              {sending && <Loader2 size={16} className="animate-spin" />} {t('sp.sec.send', 'Send confirmation link')}
            </button>
          </form>
        )}
      </div>}
    </section>
  );
}
