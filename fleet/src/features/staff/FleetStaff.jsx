import { useState } from 'react';
import toast from 'react-hot-toast';
import { Search } from 'lucide-react';
import { useAdminStaffQuery, useAdminHubsQuery, useAdminSetStaffMutation } from '@shared/services/api';
import { Card, PageLoader, Input, Select } from '@admin/ui/kit';
import { rupees } from '@admin/features/insights/charts';

/**
 * Staff: who is ZappyOne staff, at which hub, on what monthly salary. Search
 * any Rakshak by name or phone to add them; making someone a partner again
 * takes them off the fleet.
 */
export default function FleetStaff() {
  const [q, setQ] = useState('');
  const { data, isLoading } = useAdminStaffQuery(q.trim().length >= 2 ? q.trim() : undefined);
  const { data: hubData } = useAdminHubsQuery();
  const [setStaff, { isLoading: saving }] = useAdminSetStaffMutation();
  const [draft, setDraft] = useState({});
  const hubs = hubData?.hubs || [];

  async function save(w) {
    const d = { hubId: w.employment?.hubId || hubs[0]?.id || null, salary: (w.employment?.salaryPaise || 1300000) / 100, ...draft[w._id] };
    try {
      await setStaff({ workerId: w._id, type: 'staff', hubId: d.hubId, salaryRupees: Number(d.salary) }).unwrap();
      toast.success(`${w.name || 'They'} ${w.employment?.type === 'staff' ? 'updated' : 'joined the fleet'}`);
    } catch (e) { toast.error(e?.data?.error || 'Could not save'); }
  }
  async function remove(w) {
    try { await setStaff({ workerId: w._id, type: 'partner', hubId: null }).unwrap(); toast.success(`${w.name || 'They'} left the fleet`); } catch (e) { toast.error(e?.data?.error || 'Could not save'); }
  }
  const field = (w, k, v) => setDraft((d) => ({ ...d, [w._id]: { ...d[w._id], [k]: v } }));

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
        <Search size={15} className="text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a Rakshak by name or phone to add" className="w-full bg-transparent py-2.5 text-sm outline-none" />
      </label>
      {!q && <p className="text-[12.5px] text-slate-500">Showing your staff. Search to add someone who signed up on Rakshak.</p>}
      {isLoading ? <PageLoader /> : (
        <Card className="divide-y divide-slate-100 p-0">
          {(data?.workers || []).map((w) => {
            const isStaff = w.employment?.type === 'staff';
            const d = { hubId: w.employment?.hubId || '', salary: (w.employment?.salaryPaise || 0) / 100 || '', ...draft[w._id] };
            return (
              <div key={w._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-[160px] flex-1">
                  <p className="text-sm font-semibold text-slate-900">{w.name || 'Unnamed'} {isStaff && <span className="ml-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">Staff</span>}</p>
                  <p className="text-[12px] text-slate-500">{w.phone}{isStaff ? `, ${rupees(w.employment.salaryPaise, { exact: true })} a month` : ''}</p>
                </div>
                <div className="w-40"><Select value={d.hubId} onChange={(e) => field(w, 'hubId', e.target.value)} aria-label="Hub">
                  <option value="">Pick hub…</option>{hubs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </Select></div>
                <div className="w-32"><Input type="number" min={0} value={d.salary} onChange={(e) => field(w, 'salary', e.target.value)} placeholder="₹ a month" aria-label="Monthly salary in rupees" /></div>
                <button type="button" disabled={saving || !d.hubId || !d.salary} onClick={() => save(w)} className="rounded-lg bg-blue-600 px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-40">{isStaff ? 'Save' : 'Make staff'}</button>
                {isStaff && <button type="button" disabled={saving} onClick={() => remove(w)} className="rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-500 hover:bg-slate-100">Remove</button>}
              </div>
            );
          })}
          {!(data?.workers || []).length && <p className="px-4 py-8 text-center text-sm text-slate-400">{q ? 'Nobody found.' : 'No staff yet. Search for a Rakshak to add.'}</p>}
        </Card>
      )}
    </div>
  );
}
