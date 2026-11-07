import { useSafeBack } from '../../hooks/useBookingFlow';
import { useState } from 'react';
import { useSelector } from 'react-redux';
import { ArrowLeft, Check, Copy, Link2, MessageCircle, Share2, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { useApplyReferralMutation, useGetReferralCodeQuery, useGetReferralHistoryQuery } from '@shared/services/api';
import { cleanReferralCode } from '@shared/customer/referralCode';

const rupees = (paise) => `₹${Math.floor((paise || 0) / 100).toLocaleString('en-IN')}`;
const maskName = (name = '') => (!name || name.length <= 2 ? name || 'A friend' : `${name[0]}${'*'.repeat(Math.max(name.length - 2, 3))}${name[name.length - 1]}`);
const ago = (iso) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return days < 30 ? `${days} days ago` : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

// A friend's code typed in, for anyone who signed up without the invite link; the server decides if it still counts.
function FriendCode() {
  const [code, setCode] = useState('');
  const [apply, { isLoading }] = useApplyReferralMutation();
  const clean = cleanReferralCode(code);
  async function submit(e) {
    e.preventDefault();
    if (!clean) return;
    try { await apply(clean).unwrap(); toast.success("Your friend's code is applied"); setCode(''); }
    catch (err) { toast.error(err?.data?.error || 'This code could not be used. Check it and try again.'); }
  }
  return (
    <section className="border-b-8 border-sunken px-4 py-5 sm:px-6">
      <h2 className="text-[16px] font-extrabold text-ink-900">Have a friend&apos;s code?</h2>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <label htmlFor="friend-code" className="sr-only">Friend&apos;s code</label>
        <input id="friend-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} autoComplete="off" placeholder="Enter code"
          className="h-11 min-w-0 flex-1 rounded-btn border border-line px-3 text-[15px] font-semibold uppercase tracking-wide text-ink-900 outline-none focus:border-zappy-500" />
        <button type="submit" disabled={!clean || isLoading} className="h-11 rounded-btn bg-zappy-600 px-5 text-[14px] font-bold text-white disabled:opacity-50">
          {isLoading ? 'Applying…' : 'Apply'}
        </button>
      </form>
    </section>
  );
}

// Invite friends: the code, the server's real reward amounts, ways to share, and what each invite earned.
export default function ReferralPage() {
  const goBack = useSafeBack('/profile');
  const auth = useSelector(selectAuth);
  const { data, isLoading } = useGetReferralCodeQuery(undefined, { skip: !auth.accessToken });
  const { data: historyData } = useGetReferralHistoryQuery(undefined, { skip: !auth.accessToken });
  const [copied, setCopied] = useState(null);

  const code = data?.code;
  const link = data?.shareUrl;
  const stats = data?.stats || { totalReferrals: 0, pendingReferrals: 0, earnedPaise: 0 };
  const friend = data?.rewards?.friendPaise;
  const you = data?.rewards?.youPaise;
  const history = historyData?.referrals || [];
  const pitch = friend ? `Use my code ${code} on ZappyOne and get ${rupees(friend)} off your first booking.` : `Use my code ${code} on ZappyOne.`;

  async function copy(what, text) {
    try { await navigator.clipboard.writeText(text); setCopied(what); toast.success(what === 'code' ? 'Code copied' : 'Link copied'); setTimeout(() => setCopied(null), 2000); }
    catch { toast(`Your ${what}: ${text}`); }
  }
  function share() {
    if (navigator.share) navigator.share({ title: 'ZappyOne', text: pitch, url: link }).catch(() => {});
    else copy('link', link);
  }

  return (
    <div className="min-h-screen bg-sunken">
      <div className="mx-auto min-h-screen max-w-2xl bg-white pb-12">
        <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <button type="button" onClick={() => goBack()} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full text-ink-900 hover:bg-sunken"><ArrowLeft size={21} /></button>
          <h1 className="text-[17px] font-bold text-ink-900">Invite friends</h1>
        </header>

        <section className="border-b-8 border-sunken px-4 py-6 sm:px-6">
          <h2 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-ink-900 [text-wrap:balance]">
            {friend && you ? <>Your friend gets {rupees(friend)}. You get {rupees(you)}.</> : 'Invite friends to ZappyOne'}
          </h2>
          {friend && you && (
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink-500">
              They get {rupees(friend)} in their wallet when they sign up with your code. You get {rupees(you)} when they finish their first booking.
            </p>
          )}

          <div className="mt-5 flex items-center gap-3 rounded-card border border-dashed border-line-strong bg-canvas px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-500">Your code</p>
              {isLoading || !code
                ? <span className="mt-1 block h-7 w-32 animate-pulse rounded bg-sunken" />
                : <p className="mt-0.5 font-mono text-[24px] font-bold tracking-[0.12em] text-ink-900">{code}</p>}
            </div>
            <button type="button" onClick={() => code && copy('code', code)} disabled={!code}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-btn border border-line bg-white px-3.5 text-[13.5px] font-semibold text-ink-900 hover:bg-sunken disabled:opacity-50">
              {copied === 'code' ? <Check size={15} className="text-green-700" /> : <Copy size={15} />} {copied === 'code' ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <a href={code ? `https://wa.me/?text=${encodeURIComponent(`${pitch}\n${link}`)}` : undefined} target="_blank" rel="noopener noreferrer"
              className="btn-primary" aria-disabled={!code}><MessageCircle size={17} /> WhatsApp</a>
            <button type="button" onClick={share} disabled={!code} className="btn-outline"><Share2 size={17} /> Share</button>
          </div>
          <button type="button" onClick={() => link && copy('link', link)} disabled={!link}
            className="mt-2.5 flex w-full items-center justify-center gap-2 py-2 text-[13.5px] font-semibold text-zappy-700 disabled:opacity-50">
            {copied === 'link' ? <Check size={15} /> : <Link2 size={15} />} {copied === 'link' ? 'Link copied' : 'Copy invite link'}
          </button>
        </section>

        {auth.accessToken && <FriendCode />}

        <section className="border-b-8 border-sunken px-4 py-5 sm:px-6">
          <dl className="grid grid-cols-3 text-center">
            <div><dd className="text-[22px] font-bold tabular-nums text-ink-900">{stats.totalReferrals}</dd><dt className="text-[12.5px] text-ink-500">Signed up</dt></div>
            <div><dd className="text-[22px] font-bold tabular-nums text-ink-900">{stats.pendingReferrals}</dd><dt className="text-[12.5px] text-ink-500">Yet to book</dt></div>
            <div><dd className="text-[22px] font-bold tabular-nums text-green-700">{rupees(stats.earnedPaise)}</dd><dt className="text-[12.5px] text-ink-500">Earned</dt></div>
          </dl>
        </section>

        <section className="px-4 py-5 sm:px-6">
          <h2 className="text-[18px] font-extrabold text-ink-900">Your invites</h2>
          {history.length === 0 ? (
            <p className="mt-2 text-[14px] text-ink-500">Nobody has used your code yet. Share it with a friend who needs a repair or a hand at home.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {history.map((item, i) => (
                <li key={item._id ?? i} className="flex items-center gap-3.5 py-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sunken text-ink-400"><UserRound size={19} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] text-ink-900">{maskName(item.name)}</p>
                    <p className="text-[12.5px] text-ink-500">Joined {item.joinedAt ? ago(item.joinedAt) : 'recently'}</p>
                  </div>
                  {item.earnedPaise > 0
                    ? <span className="shrink-0 text-[14px] font-bold tabular-nums text-green-700">+{rupees(item.earnedPaise)}</span>
                    : <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-semibold text-amber-800">Yet to book</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
