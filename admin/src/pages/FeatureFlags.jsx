import toast from 'react-hot-toast';
import { ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';
import { useAdminFeatureFlagsQuery, useAdminSetFeatureFlagMutation } from '@shared/services/api';
import { SectionHeader, Card, PageLoader, fmtDate } from './_shared';

/**
 * Platform kill switches. The list comes from the server — every flag shown
 * here is one the server actually enforces. Surge and cashback have their own
 * settings pages and are switched there.
 */
export default function FeatureFlags() {
  const { data, isLoading, isError } = useAdminFeatureFlagsQuery();
  const [setFlag, { isLoading: saving, originalArgs }] = useAdminSetFeatureFlagMutation();

  if (isLoading) return <PageLoader />;
  if (isError) return <p className="text-sm text-rose-600">Could not load feature flags.</p>;

  const flags = data?.flags || [];

  async function toggle(flag) {
    const next = !flag.enabled;
    if (!next && !window.confirm(`Switch off ${flag.label}? ${flag.description} This stops immediately for everyone.`)) return;
    try {
      await setFlag({ flag: flag.key, enabled: next }).unwrap();
      toast.success(`${flag.label} ${next ? 'on' : 'off'}`);
    } catch (err) { toast.error(err?.data?.error || 'Could not change the flag'); }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Feature flags"
        subtitle={`${flags.filter((f) => f.enabled).length} of ${flags.length} on · changes reach every server within 15 seconds`}
      />
      <Card className="divide-y divide-slate-50">
        {flags.map((f) => {
          const busy = saving && originalArgs?.flag === f.key;
          return (
            <div key={f.key} className="flex items-center justify-between px-5 py-4">
              <div className="flex-1 min-w-0 pr-4">
                <p className="text-sm font-semibold text-slate-800">{f.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{f.description}</p>
                {f.updatedAt && <p className="text-[11px] text-slate-300 mt-0.5">Changed {fmtDate(f.updatedAt)}</p>}
              </div>
              <button type="button" onClick={() => toggle(f)} disabled={saving}
                aria-pressed={f.enabled} aria-label={`${f.label}: ${f.enabled ? 'on' : 'off'}`}
                className="flex items-center gap-2 shrink-0">
                {busy
                  ? <Loader2 size={20} className="animate-spin text-slate-400" />
                  : f.enabled
                    ? <ToggleRight size={28} className="text-blue-600" />
                    : <ToggleLeft size={28} className="text-slate-300" />}
                <span className={`text-xs font-bold w-8 text-right ${f.enabled ? 'text-blue-600' : 'text-slate-400'}`}>{f.enabled ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
