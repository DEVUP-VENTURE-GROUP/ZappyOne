import { useState } from 'react';
import {
  useAdminListPromosQuery, useAdminCreatePromoMutation,
  useAdminUpdatePromoMutation, useAdminDeletePromoMutation,
} from '@shared/services/api';
import {
  SectionHeader, Card, FormRow, Input, Select, SaveBtn, PageLoader, EmptyState, Pagination,
} from '../../ui/kit';
import { Tag, Plus, Pencil, Trash2, Copy, CheckCircle2, ToggleLeft, ToggleRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { SERVICE_FILTER_OPTIONS, serviceLabel } from '@shared/constants/services';

const TYPE_OPTIONS = [
  { value: 'flat',        label: 'Flat Discount (₹)' },
  { value: 'percent',     label: 'Percent Discount (%)' },
  { value: 'first_order', label: 'First Order Only' },
  { value: 'loyalty',     label: 'Loyalty Reward' },
];

const SERVICES = SERVICE_FILTER_OPTIONS;

const EMPTY_FORM = {
  code: '', name: '', description: '', type: 'flat',
  discount: { value: '', maxDiscountPaise: '', minOrderPaise: '' },
  services: [],
  limits: { totalUses: 0, perUserUses: 1 },
  validity: { startAt: '', endAt: '' },
  isActive: true,
};

function today() { return new Date().toISOString().slice(0,10); }
function inDays(n) { const d = new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }

export default function Promos() {
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM, validity: { startAt: today(), endAt: inDays(30) } });
  const [copied, setCopied] = useState(null);

  const { data, isLoading } = useAdminListPromosQuery({ page });
  const [createPromo, { isLoading: creating }] = useAdminCreatePromoMutation();
  const [updatePromo, { isLoading: updating }] = useAdminUpdatePromoMutation();
  const [deletePromo] = useAdminDeletePromoMutation();

  const promos = data?.promos || [];
  const totalPages = data?.totalPages || 1;

  function openCreate() {
    setEditId(null);
    setForm({ ...EMPTY_FORM, validity: { startAt: today(), endAt: inDays(30) } });
    setShowForm(true);
  }

  function openEdit(p) {
    setEditId(p._id);
    setForm({
      code:        p.code,
      name:        p.name,
      description: p.description || '',
      type:        p.type,
      discount: {
        value:            p.type === 'percent' ? (p.discount?.value || 0) : Math.round((p.discount?.value || 0) / 100),
        maxDiscountPaise: Math.round((p.discount?.maxDiscountPaise || 0) / 100),
        minOrderPaise:    Math.round((p.discount?.minOrderPaise || 0) / 100),
      },
      services:  p.services || [],
      limits: { totalUses: p.limits?.totalUses || 0, perUserUses: p.limits?.perUserUses || 1 },
      validity: {
        startAt: p.validity?.startAt ? p.validity.startAt.slice(0, 10) : today(),
        endAt:   p.validity?.endAt   ? p.validity.endAt.slice(0, 10)   : inDays(30),
      },
      isActive: p.isActive !== false,
    });
    setShowForm(true);
  }

  function setDiscount(k, v) { setForm(p => ({ ...p, discount: { ...p.discount, [k]: v } })); }
  function setLimits(k, v) { setForm(p => ({ ...p, limits: { ...p.limits, [k]: v } })); }
  function setValidity(k, v) { setForm(p => ({ ...p, validity: { ...p.validity, [k]: v } })); }

  function toggleService(s) {
    if (s === 'all') { setForm(p => ({ ...p, services: [] })); return; }
    setForm(p => {
      const next = p.services.includes(s) ? p.services.filter(x => x !== s) : [...p.services, s];
      return { ...p, services: next };
    });
  }

  function copyCode(code) {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleSave() {
    if (!form.code || !form.name) { toast.error('Code and name are required'); return; }
    if (!form.discount.value) { toast.error('Discount value is required'); return; }

    // Convert display values to paise
    let discountValue;
    if (form.type === 'percent') {
      discountValue = Number(form.discount.value); // store as percent 1-100
    } else {
      discountValue = Math.round(Number(form.discount.value) * 100); // rupees → paise
    }

    const payload = {
      code: form.code.toUpperCase(),
      name: form.name,
      description: form.description,
      type: form.type,
      discount: {
        value:            discountValue,
        maxDiscountPaise: Math.round((Number(form.discount.maxDiscountPaise) || 0) * 100),
        minOrderPaise:    Math.round((Number(form.discount.minOrderPaise) || 0) * 100),
      },
      services: form.services,
      limits: { totalUses: Number(form.limits.totalUses) || 0, perUserUses: Number(form.limits.perUserUses) || 1 },
      validity: { startAt: new Date(form.validity.startAt), endAt: new Date(form.validity.endAt) },
      isActive: form.isActive,
    };

    try {
      if (editId) {
        await updatePromo({ id: editId, ...payload }).unwrap();
        toast.success('Promo updated');
      } else {
        await createPromo(payload).unwrap();
        toast.success('Promo created');
      }
      setShowForm(false);
    } catch (err) {
      toast.error(err?.data?.error || 'Save failed');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this promo code?')) return;
    try { await deletePromo(id).unwrap(); toast.success('Deleted'); }
    catch { toast.error('Delete failed'); }
  }

  async function toggleActive(promo) {
    try {
      await updatePromo({ id: promo._id, isActive: !promo.isActive }).unwrap();
      toast.success(promo.isActive ? 'Deactivated' : 'Activated');
    } catch { toast.error('Update failed'); }
  }

  function discountDisplay(p) {
    if (p.type === 'percent') return `${p.discount?.value}%`;
    return `₹${Math.round((p.discount?.value || 0) / 100)}`;
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <SectionHeader title="Promo Codes" subtitle="Create coupon codes for discounts, first-order offers, and loyalty rewards.">
        <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition">
          <Plus size={15} /> New Promo
        </button>
      </SectionHeader>

      {promos.length === 0 ? (
        <EmptyState message="No promo codes yet" icon={Tag} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100">
                <tr className="text-left">
                  {['Code', 'Type', 'Discount', 'Services', 'Uses', 'Valid Until', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {promos.map(p => (
                  <tr key={p._id} className="hover:bg-slate-50/50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="bg-slate-100 text-slate-800 font-bold px-2 py-0.5 rounded text-xs tracking-wider">{p.code}</code>
                        <button onClick={() => copyCode(p.code)} className="text-slate-400 hover:text-blue-600 transition">
                          {copied === p.code ? <CheckCircle2 size={13} className="text-green-500" /> : <Copy size={13} />}
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{p.name}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 capitalize">{p.type.replace('_', ' ')}</td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-green-700 text-sm">{discountDisplay(p)}</span>
                      {p.discount?.minOrderPaise > 0 && (
                        <p className="text-[10px] text-slate-400">Min ₹{Math.round(p.discount.minOrderPaise / 100)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {p.services?.length ? p.services.join(', ') : 'All services'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p className="font-semibold text-slate-700">{p.limits?.usedCount || 0}</p>
                      <p className="text-slate-400">/ {p.limits?.totalUses || '∞'}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(p.validity?.endAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleActive(p)} className={`flex items-center gap-1.5 text-xs font-semibold ${p.isActive ? 'text-green-600' : 'text-slate-400'}`}>
                        {p.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        {p.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600"><Pencil size={13} /></button>
                        <button onClick={() => handleDelete(p._id)} className="p-1.5 rounded hover:bg-red-50 text-red-500"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && <div className="p-4 border-t border-slate-100"><Pagination page={page} totalPages={totalPages} onChange={setPage} /></div>}
        </Card>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4 pb-8 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">{editId ? 'Edit Promo' : 'Create Promo Code'}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-xl font-light">✕</button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid sm:grid-cols-2 gap-4">
                <FormRow label="Promo Code *" hint="Uppercase letters/numbers only">
                  <Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
                    placeholder="ZAPPY50" maxLength={20} disabled={!!editId} />
                </FormRow>
                <FormRow label="Internal Name *">
                  <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Summer Discount 50" />
                </FormRow>
              </div>

              <FormRow label="Description (user-facing)">
                <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Get ₹50 off on your next booking" />
              </FormRow>

              <FormRow label="Type">
                <Select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                  {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </FormRow>

              <div className="grid sm:grid-cols-3 gap-3">
                <FormRow label={form.type === 'percent' ? 'Discount %' : 'Discount ₹'} hint="*required">
                  <Input type="number" value={form.discount.value} onChange={e => setDiscount('value', e.target.value)}
                    placeholder={form.type === 'percent' ? '20' : '50'} min="0"
                    max={form.type === 'percent' ? '100' : undefined} />
                </FormRow>
                {form.type === 'percent' && (
                  <FormRow label="Max Discount ₹" hint="0 = no cap">
                    <Input type="number" value={form.discount.maxDiscountPaise} onChange={e => setDiscount('maxDiscountPaise', e.target.value)} min="0" placeholder="200" />
                  </FormRow>
                )}
                <FormRow label="Min Order ₹" hint="0 = no min">
                  <Input type="number" value={form.discount.minOrderPaise} onChange={e => setDiscount('minOrderPaise', e.target.value)} min="0" placeholder="100" />
                </FormRow>
              </div>

              {/* Service restrictions */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">Applicable Services (select to restrict)</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => toggleService('all')}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition ${form.services.length === 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    All Services
                  </button>
                  {SERVICES.filter(s => s !== 'all').map(s => (
                    <button key={s} type="button" onClick={() => toggleService(s)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition ${form.services.includes(s) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      {serviceLabel(s)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Limits */}
              <div className="grid sm:grid-cols-2 gap-3">
                <FormRow label="Total Uses" hint="0 = unlimited">
                  <Input type="number" value={form.limits.totalUses} onChange={e => setLimits('totalUses', e.target.value)} min="0" />
                </FormRow>
                <FormRow label="Uses Per User">
                  <Input type="number" value={form.limits.perUserUses} onChange={e => setLimits('perUserUses', e.target.value)} min="1" />
                </FormRow>
              </div>

              {/* Validity */}
              <div className="grid sm:grid-cols-2 gap-3">
                <FormRow label="Valid From">
                  <Input type="date" value={form.validity.startAt} onChange={e => setValidity('startAt', e.target.value)} />
                </FormRow>
                <FormRow label="Valid Until">
                  <Input type="date" value={form.validity.endAt} onChange={e => setValidity('endAt', e.target.value)} />
                </FormRow>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
                <span className="text-sm font-semibold text-slate-700">Active (visible to users)</span>
              </label>
            </div>

            <div className="p-5 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition">Cancel</button>
              <SaveBtn loading={creating || updating} onClick={handleSave} label={editId ? 'Update Promo' : 'Create Promo'} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
