import { useState } from 'react';
import { MapPin, BellRing, CheckCircle2 } from 'lucide-react';
import { useAdminLaunchInterestQuery } from '@shared/services/api';
import { SectionHeader, Card, Th, Td, EmptyState, PageLoader, fmtDate } from '../../../ui/kit';

const WINDOWS = [30, 90, 180, 365];

/**
 * Where customers asked ZappyOne to launch. Each row is a ~1 km area.
 * When a zone covering it goes live, everyone who asked is notified once
 * (the "Notified" column), so this is also a record of promises kept.
 */
export default function LaunchDemand() {
  const [days, setDays] = useState(90);
  const [onlyUnserved, setOnlyUnserved] = useState(true);
  const { data, isLoading, isError } = useAdminLaunchInterestQuery(days);

  if (isLoading) return <PageLoader />;
  if (isError) return <p className="p-6 text-sm text-rose-600">Could not load launch demand.</p>;

  const cells = (data?.cells || []).filter((c) => !onlyUnserved || !c.servedBy);
  const unserved = (data?.cells || []).filter((c) => !c.servedBy);
  const waiting = unserved.reduce((s, c) => s + (c.requests - c.notified), 0);

  return (
    <div className="space-y-5">
      <SectionHeader title="Launch demand" subtitle={`${data?.total || 0} "notify me" requests in the last ${days} days · ${waiting} people waiting in areas we don't serve yet`}>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5" aria-label="Window">
          {WINDOWS.map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </SectionHeader>

      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={onlyUnserved} onChange={(e) => setOnlyUnserved(e.target.checked)} />
        Only areas no active zone covers
      </label>

      <Card className="p-0 overflow-x-auto">
        {!cells.length ? (
          <EmptyState message={onlyUnserved ? 'Every requested area is already covered by a live zone' : 'No requests yet'} icon={MapPin} />
        ) : (
          <table className="w-full text-sm">
            <thead><tr><Th>Area</Th><Th right>Requests</Th><Th right>Notified</Th><Th>Last asked</Th><Th>Coverage</Th><Th>Map</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {cells.map((c) => (
                <tr key={c.cell}>
                  <Td>{c.sampleAddress || c.cell}</Td>
                  <Td right mono>{c.requests}</Td>
                  <Td right mono>{c.notified}</Td>
                  <Td muted>{fmtDate(c.lastAt)}</Td>
                  <Td>
                    {c.servedBy
                      ? <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold"><CheckCircle2 size={12} /> {c.servedBy.name}</span>
                      : <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-semibold"><BellRing size={12} /> Not served</span>}
                  </Td>
                  <Td>
                    <a className="text-xs font-semibold text-indigo-600 hover:underline" target="_blank" rel="noreferrer"
                      href={`https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`}>Open</a>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p className="text-xs text-slate-400">Draw a zone over these areas under Zones and set it active: everyone who asked there is notified automatically.</p>
    </div>
  );
}
