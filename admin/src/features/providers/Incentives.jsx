import { useState, useEffect } from 'react';
import { useAdminGetIncentivesQuery, useAdminSetMilestonesMutation, useAdminRatingSweepMutation } from '@shared/services/api';
import { SectionHeader, Card, FormRow, Input, SaveBtn, PageLoader } from '../../ui/kit';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

const DEFAULT_MILESTONE = { jobs: 50, bonusPaise: 50, label: '' };

export default function Incentives() {
  const { data, isLoading, refetch } = useAdminGetIncentivesQuery();
  const [setMilestones, { isLoading: saving }] = useAdminSetMilestonesMutation();
  const [ratingSweep, { isLoading: sweeping }] = useAdminRatingSweepMutation();

  const [milestones, setMilestonesState] = useState([]);

  useEffect(() => {
    if (data?.milestones?.length) {
      setMilestonesState(data.milestones.map(m => ({ ...m, bonusPaise: Math.round((m.bonusPaise || 0) / 100) })));
    }
  }, [data]);

  function addMilestone() {
    setMilestonesState(p => [...p, { ...DEFAULT_MILESTONE }]);
  }

  function removeMilestone(i) {
    setMilestonesState(p => p.filter((_, idx) => idx !== i));
  }

  function updateMilestone(i, key, val) {
    setMilestonesState(p => p.map((m, idx) => idx === i ? { ...m, [key]: val } : m));
  }

  async function saveMilestones() {
    const parsed = milestones.map(m => ({
      jobs: Number(m.jobs),
      bonusPaise: Math.round(Number(m.bonusPaise) * 100),
      label: (m.label || '').trim(),
    }));
    if (parsed.some(m => !m.jobs || m.jobs < 1 || !m.bonusPaise || m.bonusPaise < 1)) {
      toast.error('Each milestone needs valid jobs count and bonus amount');
      return;
    }
    if (parsed.some(m => !m.label)) {
      toast.error('Each milestone needs a label (e.g. Silver Achiever)');
      return;
    }
    try {
      await setMilestones(parsed).unwrap();
      toast.success('Milestones saved');
      refetch();
    } catch (err) {
      toast.error(err.data?.error || 'Save failed');
    }
  }

  async function runSweep() {
    try {
      const result = await ratingSweep().unwrap();
      toast.success(`Rating sweep complete — ${result.updated ?? 0} workers updated`);
    } catch (err) {
      toast.error(err.data?.error || 'Sweep failed');
    }
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <SectionHeader title="Incentives & Ratings" subtitle="Configure job completion milestones and run rating recalculations." />

      {/* Milestone editor */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-700">Job Completion Milestones</h3>
          <button onClick={addMilestone}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition">
            <Plus size={13} /> Add Milestone
          </button>
        </div>

        {milestones.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No milestones configured. Add one to get started.</p>
        ) : (
          <div className="space-y-3">
            {milestones.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1.5fr_auto] gap-3 items-end">
                <FormRow label={i === 0 ? 'Jobs Required' : ''}>
                  <Input
                    type="number" min="1" value={m.jobs}
                    onChange={e => updateMilestone(i, 'jobs', e.target.value)}
                    placeholder="e.g. 50"
                  />
                </FormRow>
                <FormRow label={i === 0 ? 'Bonus (₹)' : ''}>
                  <Input
                    type="number" min="1" value={m.bonusPaise}
                    onChange={e => updateMilestone(i, 'bonusPaise', e.target.value)}
                    placeholder="e.g. 50"
                  />
                </FormRow>
                <FormRow label={i === 0 ? 'Label' : ''}>
                  <Input
                    value={m.label || ''}
                    onChange={e => updateMilestone(i, 'label', e.target.value)}
                    placeholder="e.g. Silver Achiever"
                  />
                </FormRow>
                <div className={i === 0 ? 'pb-0.5' : ''}>
                  <button onClick={() => removeMilestone(i)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {milestones.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="flex gap-2 flex-wrap text-xs text-slate-400">
              {milestones
                .filter(m => m.jobs && m.bonusPaise)
                .sort((a, b) => Number(a.jobs) - Number(b.jobs))
                .map((m, i) => (
                  <span key={i} className="bg-slate-100 px-2.5 py-1 rounded-full">
                    {m.jobs} jobs → ₹{Number(m.bonusPaise)}{m.label ? ` (${m.label})` : ''}
                  </span>
                ))}
            </div>
          </div>
        )}

        <div className="mt-5">
          <SaveBtn loading={saving} onClick={saveMilestones} />
        </div>
      </Card>

      {/* Rating sweep */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-slate-700 mb-1">Rating Recalculation Sweep</h3>
        <p className="text-xs text-slate-400 mb-5">
          Recomputes lifetime average ratings for all workers from their completed order reviews.
          Safe to run at any time — idempotent operation.
        </p>
        <button
          onClick={runSweep}
          disabled={sweeping}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zappy-600 hover:bg-zappy-700 text-white text-sm font-semibold disabled:opacity-50 transition">
          <RefreshCw size={14} className={sweeping ? 'animate-spin' : ''} />
          {sweeping ? 'Running sweep…' : 'Run Rating Sweep'}
        </button>
        {data?.lastSweepAt && (
          <p className="text-xs text-slate-400 mt-3">
            Last run: {new Date(data.lastSweepAt).toLocaleString('en-IN')}
          </p>
        )}
      </Card>
    </div>
  );
}
