import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { useAdminHubsQuery, useAdminRosterQuery, useAdminStaffQuery, useAdminAssignShiftMutation, useAdminRemoveShiftMutation } from '@shared/services/api';
import { Card, PageLoader, EmptyState, Select } from '../../ui/kit';

const STATUS = { booked: 'bg-slate-100 text-slate-700', checked_in: 'bg-emerald-50 text-emerald-700', done: 'bg-blue-50 text-blue-700', missed: 'bg-red-50 text-red-700' };
const dayLabel = (d) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

/** Roster: a hub's next 7 days, shift by shift: who is on, who is short, and putting people on or off. */
export default function FleetRoster() {
  const { data: hubData } = useAdminHubsQuery();
  const hubs = hubData?.hubs || [];
  const [hubId, setHubId] = useState('');
  useEffect(() => { if (!hubId && hubs[0]) setHubId(hubs[0].id); }, [hubs, hubId]);
  const { data, isLoading } = useAdminRosterQuery({ hubId }, { skip: !hubId });
  const { data: staffData } = useAdminStaffQuery();
  const [assign] = useAdminAssignShiftMutation();
  const [remove] = useAdminRemoveShiftMutation();
  const staff = (staffData?.workers || []).filter((w) => String(w.employment?.hubId) === hubId);

  const act = (p, ok) => p.unwrap().then(() => toast.success(ok)).catch((e) => toast.error(e?.data?.error || 'Could not do that'));

  if (!hubs.length) return <EmptyState message="Create a hub first." />;
  return (
    <div className="space-y-4">
      <div className="w-60"><Select value={hubId} onChange={(e) => setHubId(e.target.value)} aria-label="Hub">{hubs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select></div>
      {isLoading || !data ? <PageLoader /> : (
        <div className="space-y-3">
          {data.days.map((d) => (
            <Card key={d.day} className="p-4">
              <p className="mb-3 text-sm font-bold text-slate-800">{dayLabel(d.day)}</p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {d.shifts.map((s) => (
                  <div key={s.code} className={`rounded-xl border p-3 ${s.short ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200'}`}>
                    <div className="flex items-baseline justify-between">
                      <p className="text-[13.5px] font-semibold text-slate-900">{s.label} {s.start}–{s.end}</p>
                      <p className={`text-[12px] font-bold ${s.short ? 'text-amber-700' : 'text-emerald-700'}`}>{s.people.length}/{s.need}{s.short ? `, ${s.short} short` : ''}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {s.people.map((p) => (
                        <span key={p.id} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${STATUS[p.status] || STATUS.booked}`}>
                          {p.name}{p.lateMin ? ` (late ${p.lateMin}m)` : ''}
                          {p.status === 'booked' && <button type="button" aria-label={`Take ${p.name} off`} onClick={() => act(remove(p.id), `${p.name} taken off`)}><X size={11} /></button>}
                        </span>
                      ))}
                    </div>
                    <select defaultValue="" onChange={(e) => { if (e.target.value) act(assign({ workerId: e.target.value, day: d.day, code: s.code }), 'Put on the shift'); e.target.value = ''; }}
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12.5px] text-slate-600" aria-label="Add someone">
                      <option value="">+ Add someone…</option>
                      {staff.filter((w) => !s.people.some((p) => p.workerId === String(w._id))).map((w) => <option key={w._id} value={w._id}>{w.name || w.phone}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
