import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { useAdminPartnerReferralQuery, useAdminUpdatePartnerReferralMutation } from '@shared/services/api';
import { Card, PageLoader, EmptyState } from '../../../ui/kit';
import { RupeeInput, Setting, UnitInput, toRupees, toPaise } from './fields';

// A partner who brings a partner: both get the reward once the new partner finishes their first jobs. ₹0 keeps it off and hides the invite card.
export default function PartnerReferral() {
  const { data, isLoading, isError } = useAdminPartnerReferralQuery();
  const [save, { isLoading: saving }] = useAdminUpdatePartnerReferralMutation();
  const [form, setForm] = useState(null);
  const s = data?.settings;
  useEffect(() => { if (s) setForm({ reward: toRupees(s.rewardPaise), jobs: String(s.jobs) }); }, [s]);

  if (isError) return <EmptyState message="Could not load partner referral settings. Refresh to try again." />;
  if (isLoading || !form) return <PageLoader />;

  const rewardPaise = toPaise(form.reward);
  const jobs = Number(form.jobs);
  const valid = Number.isInteger(rewardPaise) && rewardPaise >= 0 && rewardPaise <= 500000 && rewardPaise % 100 === 0 && Number.isInteger(jobs) && jobs >= 1 && jobs <= 100;
  const dirty = rewardPaise !== s.rewardPaise || jobs !== s.jobs;

  async function submit() {
    try { await save({ rewardPaise, jobs }).unwrap(); toast.success(rewardPaise ? 'Partner referrals saved' : 'Partner referrals switched off'); } catch (err) { toast.error(err?.data?.error || 'Could not save. Try again.'); }
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Partner referrals</h3>
          <p className="mt-0.5 text-[12px] text-slate-500">A partner invites another partner with their code. When the new partner finishes their first jobs, both get this amount in their earnings. ₹0 keeps it off.</p>
        </div>
        <button type="button" onClick={submit} disabled={!dirty || !valid || saving}
          className="inline-flex min-w-[72px] items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400">
          {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
        </button>
      </div>
      <Setting title="Reward for each partner" hint="Whole rupees, paid once to the partner who invited and once to the new partner.">
        <RupeeInput value={form.reward} onChange={(v) => setForm((f) => ({ ...f, reward: v }))} label="Partner referral reward" max={5000} />
      </Setting>
      <Setting title="Jobs the new partner finishes first" hint="Counted across every kind of job. Paid the moment the count is reached.">
        <UnitInput value={form.jobs} onChange={(v) => setForm((f) => ({ ...f, jobs: v }))} label="Jobs before the reward" unit="jobs" min={1} max={100} />
      </Setting>
    </Card>
  );
}
