import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAdminHubsQuery, useAdminFleetStockQuery, useAdminAddStockItemMutation, useAdminStockActionMutation, useAdminStaffQuery } from '@shared/services/api';
import { Card, PageLoader, EmptyState, Th, Td, Input, Select } from '../../ui/kit';
import { Panel, rupees } from '../insights/charts';

/**
 * Stock (each hub's dark-store shelves): what is there and what it is worth,
 * what is low, and every move: bought (from whom, at what cost, recorded as a
 * parts expense), issued to staff for jobs, counted and corrected.
 */
export default function FleetStock() {
  const { data: hubData } = useAdminHubsQuery();
  const hubs = hubData?.hubs || [];
  const [hubId, setHubId] = useState('');
  useEffect(() => { if (!hubId && hubs[0]) setHubId(hubs[0].id); }, [hubs, hubId]);
  const { data, isLoading } = useAdminFleetStockQuery({ hubId }, { skip: !hubId });
  const { data: staffData } = useAdminStaffQuery();
  const [addItem] = useAdminAddStockItemMutation();
  const [act] = useAdminStockActionMutation();
  const [item, setItem] = useState({ name: '', unit: 'piece', reorderAt: 2 });
  const [open, setOpen] = useState(null); // { itemId, action }
  const [move, setMove] = useState({ qty: '', unitCostRupees: '', supplier: '', workerId: '', jobRef: '', countedQty: '' });
  const staff = (staffData?.workers || []).filter((w) => String(w.employment?.hubId) === hubId);

  const run = (p, ok) => p.unwrap().then(() => { toast.success(ok); setOpen(null); setMove({ qty: '', unitCostRupees: '', supplier: '', workerId: '', jobRef: '', countedQty: '' }); }).catch((e) => toast.error(e?.data?.error || 'Could not save'));

  if (!hubs.length) return <EmptyState message="Create a hub first." />;
  const items = data?.items || [];
  const value = items.reduce((t, i) => t + i.valuePaise, 0);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-60"><Select value={hubId} onChange={(e) => setHubId(e.target.value)} aria-label="Hub">{hubs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select></div>
        <p className="text-sm text-slate-600">Stock value <b className="text-slate-900">{rupees(value, { exact: true })}</b>, {items.filter((i) => i.low).length} low</p>
      </div>

      {isLoading ? <PageLoader /> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px]">
            <thead className="bg-slate-50"><tr><Th>Item</Th><Th right>On hand</Th><Th right>Avg cost</Th><Th right>Value</Th><Th right>Reorder at</Th><Th right> </Th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i._id} className="border-t border-slate-100 align-top">
                  <Td><span className="font-semibold text-slate-900">{i.name}</span>{i.low && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">Low</span>}</Td>
                  <Td right>{i.qty} {i.unit}</Td><Td right>{rupees(i.avgCostPaise, { exact: true })}</Td><Td right>{rupees(i.valuePaise, { exact: true })}</Td><Td right>{i.reorderAt || '–'}</Td>
                  <Td right>
                    <div className="flex justify-end gap-1">
                      {['purchase', 'issue', 'adjust'].map((a) => (
                        <button key={a} type="button" onClick={() => setOpen({ itemId: i._id, action: a })} className={`rounded-md px-2 py-1 text-[12px] font-semibold ${open?.itemId === i._id && open.action === a ? 'bg-blue-600 text-white' : 'text-blue-700 hover:bg-blue-50'}`}>
                          {a === 'purchase' ? 'Bought' : a === 'issue' ? 'Issue' : 'Count'}
                        </button>
                      ))}
                    </div>
                    {open?.itemId === i._id && (
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        {open.action !== 'adjust' && <Input className="!w-20" type="number" min={1} placeholder="Qty" value={move.qty} onChange={(e) => setMove((m) => ({ ...m, qty: e.target.value }))} />}
                        {open.action === 'purchase' && <><Input className="!w-28" type="number" min={0} placeholder="₹ each" value={move.unitCostRupees} onChange={(e) => setMove((m) => ({ ...m, unitCostRupees: e.target.value }))} /><Input className="!w-36" placeholder="Supplier" value={move.supplier} onChange={(e) => setMove((m) => ({ ...m, supplier: e.target.value }))} /></>}
                        {open.action === 'issue' && <><select className="rounded-lg border border-slate-200 px-2 text-sm" value={move.workerId} onChange={(e) => setMove((m) => ({ ...m, workerId: e.target.value }))}><option value="">To…</option>{staff.map((w) => <option key={w._id} value={w._id}>{w.name || w.phone}</option>)}</select><Input className="!w-28" placeholder="Job ref" value={move.jobRef} onChange={(e) => setMove((m) => ({ ...m, jobRef: e.target.value }))} /></>}
                        {open.action === 'adjust' && <Input className="!w-28" type="number" min={0} placeholder="Counted" value={move.countedQty} onChange={(e) => setMove((m) => ({ ...m, countedQty: e.target.value }))} />}
                        <button type="button" onClick={() => run(act({ itemId: i._id, action: open.action, ...(open.action === 'adjust' ? { countedQty: Number(move.countedQty) } : { qty: Number(move.qty) }), ...(open.action === 'purchase' ? { unitCostRupees: Number(move.unitCostRupees), supplier: move.supplier } : {}), ...(open.action === 'issue' ? { workerId: move.workerId || null, jobRef: move.jobRef } : {}) }), 'Saved')}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white">Save</button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">Nothing stocked at this hub yet.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      <Panel title="Add an item to this hub">
        <div className="flex flex-wrap gap-2">
          <Input className="!w-64" placeholder="Battery 4000mAh, screen guard…" value={item.name} onChange={(e) => setItem((x) => ({ ...x, name: e.target.value }))} maxLength={80} />
          <Input className="!w-28" placeholder="Unit" value={item.unit} onChange={(e) => setItem((x) => ({ ...x, unit: e.target.value }))} maxLength={20} />
          <Input className="!w-32" type="number" min={0} placeholder="Reorder at" value={item.reorderAt} onChange={(e) => setItem((x) => ({ ...x, reorderAt: e.target.value }))} />
          <button type="button" disabled={!item.name.trim()} onClick={() => run(addItem({ hubId, name: item.name.trim(), unit: item.unit || 'piece', reorderAt: Number(item.reorderAt) || 0 }), 'Item added')}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Add</button>
        </div>
      </Panel>

      <Panel title="Moves this month">
        <div className="divide-y divide-slate-100">
          {(data?.moves || []).map((m) => (
            <div key={m._id} className="flex items-center gap-3 py-2 text-[13px]">
              <span className="w-24 text-slate-500">{m.day}</span>
              <span className={`w-20 font-semibold ${m.type === 'purchase' ? 'text-emerald-700' : m.type === 'issue' ? 'text-blue-700' : 'text-slate-600'}`}>{m.type === 'purchase' ? 'Bought' : m.type === 'issue' ? 'Issued' : 'Counted'}</span>
              <span className="min-w-0 flex-1 truncate text-slate-700">{m.qty > 0 ? '+' : ''}{m.qty} {m.itemId?.unit} {m.itemId?.name}{m.supplier ? `, from ${m.supplier}` : ''}{m.workerId?.name ? `, to ${m.workerId.name}` : ''}{m.jobRef ? ` (${m.jobRef})` : ''}</span>
              <span className="text-slate-900">{rupees(Math.abs(m.qty) * m.unitCostPaise, { exact: true })}</span>
            </div>
          ))}
          {!(data?.moves || []).length && <p className="py-6 text-center text-sm text-slate-400">No moves this month.</p>}
        </div>
      </Panel>
    </div>
  );
}
