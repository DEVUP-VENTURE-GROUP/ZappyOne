import toast from 'react-hot-toast';
import { usePartnerSettingsQuery, useSavePartnerSettingsMutation } from '@shared/services/api';
import { DISPATCH_MODES, PARTNER_TYPES } from '@shared/provider/partnerBoard';

// Partner type, dispatch rule and job limit for the team (server shop/partner.service).
export default function DispatchSettingsCard() {
  const { data } = usePartnerSettingsQuery();
  const [save, { isLoading }] = useSavePartnerSettingsMutation();
  if (!data) return null;
  const change = (body) => save(body).unwrap().then(() => toast.success('Saved')).catch((e) => toast.error(e?.data?.error || 'Could not save'));

  return (
    <section className="card space-y-4">
      <div>
        <p className="text-[14px] font-bold text-slate-900">How jobs reach your team</p>
        <p className="text-[12px] text-slate-500">{data.openJobs} job{data.openJobs === 1 ? '' : 's'} open right now{data.dispatch.capacity ? ` of your limit of ${data.dispatch.capacity}` : ''}.</p>
      </div>
      <div className="space-y-2">
        {DISPATCH_MODES.map((m) => (
          <label key={m.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${data.dispatch.mode === m.key ? 'border-zappy-500 bg-zappy-50' : 'border-slate-200'}`}>
            <input type="radio" name="mode" checked={data.dispatch.mode === m.key} disabled={isLoading} onChange={() => change({ mode: m.key })} className="mt-1" />
            <span><span className="block text-[13.5px] font-semibold text-slate-900">{m.label}</span><span className="block text-[12px] text-slate-500">{m.hint}</span></span>
          </label>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[12px] font-bold text-slate-700">Most jobs at once</span>
          <input type="number" min={0} max={1000} defaultValue={data.dispatch.capacity || ''} placeholder="No limit"
            onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== data.dispatch.capacity) change({ capacity: v }); }} className="input w-full text-sm" />
          <span className="mt-1 block text-[11px] text-slate-400">When this many are open, we stop sending new ones until one finishes.</span>
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-bold text-slate-700">You are a</span>
          <select value={data.partnerType} disabled={isLoading} onChange={(e) => change({ partnerType: e.target.value })} className="input w-full text-sm">
            {PARTNER_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <span className="mt-1 block text-[11px] text-slate-400">{PARTNER_TYPES.find((t) => t.key === data.partnerType)?.hint}</span>
        </label>
      </div>
    </section>
  );
}
