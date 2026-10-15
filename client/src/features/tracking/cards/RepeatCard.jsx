import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Repeat2, Loader2, ChevronRight } from 'lucide-react';
import { useMyRepeatsQuery, useRepeatJobMutation } from '@shared/services/api';

/**
 * "Repeat this" — the same booking every week / 2 weeks / month / 3 months
 * (server jobs/recurring). Each repeat becomes a real booking a few days
 * before, with the same provider asked first. Managed from Your schedule.
 */
const EVERY = [['week', 'Every week'], ['2weeks', 'Every 2 weeks'], ['month', 'Every month'], ['3months', 'Every 3 months']];

export default function RepeatCard({ jobId, noun = 'booking' }) {
  const nav = useNavigate();
  const { data } = useMyRepeatsQuery();
  const [repeat, { isLoading }] = useRepeatJobMutation();
  const [every, setEvery] = useState(null);
  const existing = (data?.plans || []).find((p) => String(p.sourceId) === String(jobId));

  if (existing) {
    return (
      <button type="button" onClick={() => nav('/scheduled')}
        className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-slate-100">
        <Repeat2 size={18} className="text-zappy-600" />
        <span className="min-w-0 flex-1 text-[13px] text-slate-700">
          Repeats {existing.everyLabel}{existing.nextLabel ? `, next ${existing.nextLabel}` : ', paused'}
        </span>
        <ChevronRight size={16} className="text-slate-300" />
      </button>
    );
  }

  async function save() {
    try {
      const r = await repeat({ id: jobId, every }).unwrap();
      toast.success(r.message, { duration: 6000 });
    } catch (err) { toast.error(err?.data?.error || 'Could not set the repeat'); }
  }

  return (
    <div className="rounded-2xl bg-white px-4 py-3.5 ring-1 ring-slate-100">
      <p className="flex items-center gap-2 text-[13.5px] font-semibold text-navy"><Repeat2 size={16} className="text-zappy-600" /> Need this again?</p>
      <p className="mt-0.5 text-[12.5px] text-slate-500">Repeat this {noun} on a schedule. We book each one a few days ahead, with the same pro when they are free.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {EVERY.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setEvery(k)}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${every === k ? 'border-zappy-600 bg-zappy-50 text-zappy-700' : 'border-slate-200 text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>
      {every && (
        <button type="button" onClick={save} disabled={isLoading}
          className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-zappy-600 text-[13px] font-semibold text-white disabled:opacity-50">
          {isLoading && <Loader2 size={14} className="animate-spin" />} Repeat {EVERY.find(([k]) => k === every)[1].toLowerCase()}
        </button>
      )}
    </div>
  );
}
