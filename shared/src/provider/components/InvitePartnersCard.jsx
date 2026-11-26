import { useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Gift, Loader2, Share2 } from 'lucide-react';
import { usePartnerReferralQuery, useApplyReferralMutation } from '../../services/api';
import { formatPaise } from '../../utils/money';

// Invite another partner with your code; hidden until a reward is set in Admin → Economics → Partners.
export default function InvitePartnersCard() {
  const { data } = usePartnerReferralQuery();
  const [apply, { isLoading }] = useApplyReferralMutation();
  const [code, setCode] = useState('');
  const c = data?.card;
  if (!c?.on) return null;

  async function share() {
    try {
      if (navigator.share) { await navigator.share({ text: c.shareText }); return; }
      await navigator.clipboard.writeText(c.shareText);
      toast.success('Invite copied. Paste it in WhatsApp.');
    } catch (e) { if (e?.name !== 'AbortError') toast.error('Could not share. Copy your code instead.'); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(c.code); toast.success('Code copied'); } catch { toast.error('Could not copy'); }
  }
  async function enter(e) {
    e.preventDefault();
    try { await apply(code.trim()).unwrap(); toast.success(`Code saved. Finish ${c.jobs} jobs to get your bonus.`); setCode(''); } catch (err) { toast.error(err?.data?.error || 'That code did not work'); }
  }

  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zappy-50 text-zappy-700"><Gift size={18} /></span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-slate-900">Invite partners, earn {formatPaise(c.rewardPaise)}</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">When a partner you invite finishes {c.jobs} jobs, you both get {formatPaise(c.rewardPaise)} in your earnings.</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={copy} className="flex min-h-[44px] flex-1 items-center justify-between rounded-xl border border-dashed border-slate-300 px-3 text-left" aria-label={`Copy your code ${c.code}`}>
          <span className="font-mono text-[16px] font-bold tracking-wider text-slate-900">{c.code}</span>
          <Copy size={15} className="text-slate-400" />
        </button>
        <button type="button" onClick={share} className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-zappy-600 px-4 text-sm font-bold text-white hover:bg-zappy-700">
          <Share2 size={15} /> Invite
        </button>
      </div>
      {c.invited > 0 && (
        <p className="text-[12.5px] text-slate-600 tabular-nums">{c.invited} invited, {c.rewarded} finished, {formatPaise(c.earnedPaise)} earned</p>
      )}
      {c.joinedWithCode === 'signup' && <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">You joined with a partner's code. Finish {c.jobs} jobs to get your {formatPaise(c.rewardPaise)}.</p>}
      {c.canEnterCode && (
        <form onSubmit={enter} className="flex gap-2 border-t border-slate-100 pt-3">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={16} placeholder="Got a partner's code?" aria-label="A partner's invite code"
            className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm uppercase outline-none focus:ring-2 focus:ring-zappy-100" />
          <button type="submit" disabled={isLoading || code.trim().length < 4} className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-800 disabled:opacity-40">
            {isLoading && <Loader2 size={14} className="animate-spin" />} Apply
          </button>
        </form>
      )}
    </section>
  );
}
