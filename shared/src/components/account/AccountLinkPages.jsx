import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useConfirmEmailMutation, useResetPasswordMutation } from '../../services/api';
import { ZappyWordmark } from '../common/ZappyLogo';
import PasswordField, { passwordOk } from './PasswordField';

/**
 * The two pages links in our emails open. They work signed in or out and in
 * whichever app sent them (the link carries the account type).
 */
function Frame({ children }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-canvas px-4 py-10">
      <ZappyWordmark size={30} />
      <div className="mt-6 w-full max-w-md rounded-card border border-line bg-white p-6">{children}</div>
    </div>
  );
}

export function VerifyEmailPage({ homePath = '/' }) {
  const [params] = useSearchParams();
  const [confirm] = useConfirmEmailMutation();
  const [state, setState] = useState({ status: 'working' });
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const token = params.get('token');
    const role = params.get('r');
    if (!token || !role) { setState({ status: 'error', message: 'This link is incomplete.' }); return; }
    confirm({ token, role }).unwrap()
      .then((r) => setState({ status: 'ok', email: r.email }))
      .catch((e) => setState({ status: 'error', message: e?.data?.error || 'This link did not work.' }));
  }, [params, confirm]);

  return (
    <Frame>
      {state.status === 'working' && <p className="flex items-center gap-2 text-[15px] text-ink-700"><Loader2 size={18} className="animate-spin" /> Confirming your email…</p>}
      {state.status === 'ok' && (
        <>
          <CheckCircle2 size={32} className="text-green-600" />
          <h1 className="mt-3 text-[21px] font-bold text-ink-900">Email confirmed</h1>
          <p className="mt-1 text-[15px] text-ink-500">{state.email} is now on your account. You can use it to sign in and to reset your password.</p>
          <Link to={homePath} className="btn-primary mt-5 w-full">Continue</Link>
        </>
      )}
      {state.status === 'error' && (
        <>
          <XCircle size={32} className="text-red-600" />
          <h1 className="mt-3 text-[21px] font-bold text-ink-900">Link not valid</h1>
          <p className="mt-1 text-[15px] text-ink-500">{state.message} Open your account settings to send a new one.</p>
          <Link to={homePath} className="btn-outline mt-5 w-full">Go to the app</Link>
        </>
      )}
    </Frame>
  );
}

export function ResetPasswordPage({ loginPath = '/login' }) {
  const [params] = useSearchParams();
  const [reset, { isLoading }] = useResetPasswordMutation();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const token = params.get('token');
  const role = params.get('r');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await reset({ role, token, newPassword: pw }).unwrap();
      setDone(true);
    } catch (err) { setError(err?.data?.error || 'Could not change the password'); }
  }

  if (!token || !role) {
    return <Frame><p className="text-[15px] text-ink-700">This link is incomplete. Ask for a new reset from the sign-in page.</p></Frame>;
  }

  return (
    <Frame>
      {done ? (
        <>
          <CheckCircle2 size={32} className="text-green-600" />
          <h1 className="mt-3 text-[21px] font-bold text-ink-900">Password changed</h1>
          <p className="mt-1 text-[15px] text-ink-500">For your safety we signed you out everywhere. Sign in with your new password.</p>
          <Link to={loginPath} className="btn-primary mt-5 w-full">Sign in</Link>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <h1 className="text-[21px] font-bold text-ink-900">Choose a new password</h1>
          <PasswordField id="rp-1" label="New password" value={pw} onChange={setPw} showRules />
          <PasswordField id="rp-2" label="Type it again" value={pw2} onChange={setPw2} />
          {pw2 && pw !== pw2 && <p className="-mt-2 text-[12px] font-semibold text-red-700">The two passwords do not match</p>}
          {error && <p className="rounded-btn bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}
          <button type="submit" disabled={isLoading || !passwordOk(pw) || pw !== pw2} className="btn-primary w-full">
            {isLoading && <Loader2 size={16} className="animate-spin" />} Change password
          </button>
        </form>
      )}
    </Frame>
  );
}
