import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, MailCheck, ShieldCheck, LogOut } from 'lucide-react';
import {
  useAccountMeQuery, useSetAccountNameMutation, useSetAccountPasswordMutation,
  useStartEmailVerificationMutation, useCompleteAccountSetupMutation,
} from '../../services/api';
import { ZappyLogo } from '../common/ZappyLogo';
import PasswordField, { passwordOk } from './PasswordField';

/**
 * First-time setup, right after the first OTP sign-in: the details we need
 * once so every later sign-in is free (password) and the account can be
 * recovered (email). Customers give a name and may skip email; providers give
 * an email because statements and resets go there.
 *
 * Everything is on one screen and saved in order: name, password, email (a
 * confirmation link is sent; the account works before it is opened), then
 * setup is marked complete.
 */
export default function AccountSetup({ appName = 'ZappyOne', intro, onDone, onSignOut }) {
  const { data: st, isLoading } = useAccountMeQuery();
  const [setName] = useSetAccountNameMutation();
  const [setPassword] = useSetAccountPasswordMutation();
  const [startEmail] = useStartEmailVerificationMutation();
  const [complete] = useCompleteAccountSetupMutation();

  const [name, setNameV] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [sentTo, setSentTo] = useState(null);

  useEffect(() => {
    if (!st) return;
    setNameV((v) => v || st.name || '');
    setEmail((v) => v || st.pendingEmail || st.email || '');
  }, [st?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !st) {
    return <div className="flex min-h-screen items-center justify-center bg-canvas"><Loader2 size={24} className="animate-spin text-zappy-600" /></div>;
  }

  const askName = st.needs.name;
  const askPassword = st.needs.password;
  const emailOk = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const ready = (!askName || name.trim().length >= 2)
    && (!askPassword || (passwordOk(pw, st.phone) && pw === pw2))
    && (!st.emailRequired || (email.trim() && emailOk)) && emailOk;

  async function submit(e) {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      if (askName) await setName({ name: name.trim() }).unwrap();
      if (askPassword) await setPassword({ newPassword: pw }).unwrap();
      const wantEmail = email.trim().toLowerCase();
      if (wantEmail && !(st.emailVerified && st.email === wantEmail) && st.pendingEmail !== wantEmail) {
        const r = await startEmail({ email: wantEmail }).unwrap();
        setSentTo(r.emailSent ? wantEmail : null);
      }
      await complete().unwrap();
      toast.success('All set');
      onDone?.();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not save. Try again.');
    } finally { setSaving(false); }
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-3.5">
          <ZappyLogo size={26} />
          {onSignOut && (
            <button type="button" onClick={onSignOut} className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-500 hover:text-ink-900">
              <LogOut size={15} /> Sign out
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-5 py-6">
        <span className="flex h-11 w-11 items-center justify-center rounded-btn bg-zappy-50 text-zappy-600"><ShieldCheck size={21} /></span>
        <h1 className="mt-3 text-[24px] font-bold leading-tight text-ink-900">Finish setting up your account</h1>
        <p className="mt-1 text-[15px] text-ink-500">
          {intro || `Set a password so you can sign in to ${appName} without waiting for an OTP next time.`}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-5 rounded-card border border-line bg-white p-5">
          {askName && (
            <div>
              <label htmlFor="setup-name" className="mb-1.5 block text-[13px] font-semibold text-ink-700">Your name</label>
              <input id="setup-name" className="input w-full" autoComplete="name" value={name} onChange={(e) => setNameV(e.target.value)} placeholder="e.g. Ravi Kumar" maxLength={60} />
            </div>
          )}

          <div>
            <span className="mb-1.5 block text-[13px] font-semibold text-ink-700">Mobile number</span>
            <div className="flex min-h-[44px] items-center rounded-btn border border-line bg-sunken px-3.5 text-[15px] font-semibold tabular-nums text-ink-700">{st.phone}</div>
          </div>

          {askPassword && (
            <>
              <PasswordField id="setup-pw" label="Create a password" value={pw} onChange={setPw} showRules phone={st.phone} />
              <PasswordField id="setup-pw2" label="Type it again" value={pw2} onChange={setPw2} />
              {pw2 && pw !== pw2 && <p className="-mt-3 text-[12px] font-semibold text-red-700">The two passwords do not match</p>}
            </>
          )}

          <div>
            <label htmlFor="setup-email" className="mb-1.5 block text-[13px] font-semibold text-ink-700">
              Email {st.emailRequired ? <span className="text-red-600">*</span> : <span className="font-normal text-ink-400">(optional)</span>}
            </label>
            <input id="setup-email" type="email" inputMode="email" autoComplete="email" className="input w-full" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <p className="mt-1 text-[12px] text-ink-500">
              {st.emailRequired ? 'For statements, receipts and resetting your password. We send a link to confirm it.' : 'For receipts and resetting your password for free. We send a link to confirm it.'}
            </p>
            {!emailOk && <p className="mt-1 text-[12px] font-semibold text-red-700">That email does not look right</p>}
          </div>

          <button type="submit" disabled={!ready || saving} className="btn-primary w-full">
            {saving && <Loader2 size={16} className="animate-spin" />} Continue
          </button>
          {sentTo && <p className="flex items-center gap-1.5 text-[13px] text-green-700"><MailCheck size={15} /> Link sent to {sentTo}</p>}
        </form>
      </main>
    </div>
  );
}
