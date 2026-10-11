import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { useAdminAppReleasesQuery, useAdminSetAppReleaseMutation } from '@shared/services/api';
import { VERSION_RE, isOlder } from '@shared/config/appVersion';
import { SectionHeader, Card, fmtDate } from '../../ui/kit';

/**
 * The oldest version of each phone app still allowed to run. Raising the
 * minimum shows "update to continue" in older apps on their next launch, so
 * raise it only after the new version is live on the Play Store.
 */
const NAMES = { customer: 'ZappyOne (customers)', servicepro: 'ServicePro (shops)', rakshak: 'Rakshak (professionals)' };

function Row({ release }) {
  const [form, setForm] = useState(release);
  const [save, { isLoading }] = useAdminSetAppReleaseMutation();
  useEffect(() => { setForm(release); }, [release]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value.trim() }));
  const valid = VERSION_RE.test(form.minVersion) && VERSION_RE.test(form.latestVersion) && !isOlder(form.latestVersion, form.minVersion);
  const changed = ['minVersion', 'latestVersion', 'message'].some((k) => form[k] !== release[k]);

  async function submit(e) {
    e.preventDefault();
    if (isOlder(release.minVersion, form.minVersion) && !window.confirm(`Every ${NAMES[release.app]} app older than ${form.minVersion} will be asked to update before it can be used. Continue?`)) return;
    try {
      await save({ app: release.app, minVersion: form.minVersion, latestVersion: form.latestVersion, message: form.message }).unwrap();
      toast.success(`${NAMES[release.app]} versions saved`);
    } catch (err) { toast.error(err?.data?.error || 'Could not save the versions'); }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_120px_120px_auto] sm:items-end">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{NAMES[release.app]}</p>
        <input value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} maxLength={240}
          placeholder="Message on the update screen (optional)" className="input mt-1.5 w-full text-xs" />
        {release.updatedAt && <p className="mt-1 text-[11px] text-slate-300">Changed {fmtDate(release.updatedAt)}</p>}
      </div>
      <label className="text-xs text-slate-500">Minimum<input value={form.minVersion} onChange={set('minVersion')} className="input mt-1 w-full font-mono text-sm" /></label>
      <label className="text-xs text-slate-500">Latest<input value={form.latestVersion} onChange={set('latestVersion')} className="input mt-1 w-full font-mono text-sm" /></label>
      <button type="submit" disabled={!valid || !changed || isLoading} className="btn-primary h-10 px-4 text-sm disabled:opacity-40">
        {isLoading ? <Loader2 size={15} className="animate-spin" /> : 'Save'}
      </button>
      {!valid && <p className="text-xs text-rose-600 sm:col-span-4">Use versions like 1.0.0, and keep Latest at or above Minimum.</p>}
    </form>
  );
}

export default function AppVersions() {
  const { data, isLoading, isError } = useAdminAppReleasesQuery();
  if (isLoading) return <Card className="p-5"><Loader2 size={18} className="animate-spin text-slate-400" /></Card>;
  if (isError) return <p className="text-sm text-rose-600">Could not load app versions.</p>;
  return (
    <div className="space-y-3">
      <SectionHeader title="App versions" subtitle="Apps older than the minimum must update before they can be used. Raise it only after the new version is live on the Play Store." />
      <Card className="divide-y divide-slate-50">
        {(data?.releases || []).map((r) => <Row key={r.app} release={r} />)}
      </Card>
    </div>
  );
}
