import { useState } from 'react';
import { shiftHours } from '@shared/utils/clock';
import { Plus, Warehouse } from 'lucide-react';
import { useAdminHubsQuery } from '@shared/services/api';
import { Card, PageLoader, EmptyState } from '@admin/ui/kit';
import HubEditor from './HubEditor';
import HubsMap from './HubsMap';

/** Hubs (dark stores): where the fleet is based, its shifts, and how many staff each has. */
export default function FleetHubs() {
  const { data, isLoading, isError } = useAdminHubsQuery();
  const [editing, setEditing] = useState(null);
  if (editing) return <HubEditor hub={editing === 'new' ? null : editing} others={(data?.hubs || []).filter((h) => h.id !== editing.id)} search={!!data?.search} travel={data?.travel || null} onDone={() => setEditing(null)} />;
  if (isError) return <EmptyState message="Could not load the hubs." />;
  if (isLoading) return <PageLoader />;
  const hubs = data?.hubs || [];
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={() => setEditing('new')} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Plus size={15} /> New hub</button>
      </div>
      {hubs.length > 0 && <HubsMap hubs={hubs} onOpen={setEditing} />}
      {!hubs.length ? <EmptyState icon={Warehouse} message="No hubs yet. Create the first one where your staff will meet." /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {hubs.map((h) => (
            <button key={h.id} type="button" onClick={() => setEditing(h)} className="text-left">
              <Card className="p-4 transition hover:shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[15px] font-bold text-slate-900">{h.name}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${h.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{h.isActive ? 'Open' : 'Closed'}</span>
                </div>
                <p className="mt-0.5 truncate text-[12.5px] text-slate-500">{h.meetingPoint?.address || h.city}</p>
                <p className="mt-2 text-[12.5px] text-slate-600">{h.staff} staff, {[h.area?.coordinates && 'drawn area', h.places?.length && `${h.places.length} pincode${h.places.length === 1 ? '' : 's'}/area${h.places.length === 1 ? '' : 's'}`].filter(Boolean).join(' + ') || `serves ${h.serviceKm} km`}, {h.shifts.length} shift{h.shifts.length === 1 ? '' : 's'}</p>
                <p className="mt-1 text-[12px] text-slate-400">{h.shifts.map((s) => `${s.label} ${shiftHours(s)} (${s.need})`).join(', ')}</p>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
