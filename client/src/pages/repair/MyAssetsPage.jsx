import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus, Trash2, Clock, MapPin, X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useMyAssetsQuery, useCreateAssetMutation, useDeleteAssetMutation,
  useRepairBrandsQuery, useRepairModelsQuery,
} from '@shared/services/api';

/**
 * "My Water Assets" from the brief (§27/§34) — built vertical-agnostic.
 *
 * The same saved-thing concept serves a tank, a phone or a car (see
 * customer-asset.model.js), so this one screen works for whichever verticals
 * are live rather than being a water-only page that a laptop or a scooter
 * owner would need duplicated.
 */
const VERTICAL_LABEL = {
  water_tank_care: 'Water & Tank Care', mobile: 'Mobile', laptop: 'Laptop',
  two_wheeler: '2-Wheeler', four_wheeler: '4-Wheeler',
};

function Shell({ children }) {
  return <div className="max-w-lg mx-auto px-4 py-4 space-y-3 pb-24">{children}</div>;
}

export default function MyAssetsPage() {
  const nav = useNavigate();
  const { data, isLoading } = useMyAssetsQuery();
  const [deleteAsset] = useDeleteAssetMutation();
  const [showAdd, setShowAdd] = useState(false);
  const assets = data?.assets || [];

  async function remove(id) {
    try {
      await deleteAsset(id).unwrap();
      toast.success('Removed');
    } catch (err) {
      toast.error(err?.data?.error || 'Could not remove');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => nav(-1)} className="p-1 -ml-1">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-black text-[#0F172A]">My things</h1>
      </div>

      <Shell>
        <p className="text-sm text-slate-500">
          Save a tank, phone or vehicle once and rebook against it without typing it in again.
        </p>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-zappy-400" />
          </div>
        )}

        {!isLoading && !assets.length && (
          <div className="text-center py-12 text-slate-400">
            <p className="text-sm">Nothing saved yet.</p>
          </div>
        )}

        <div className="space-y-2">
          {assets.map((a) => (
            <div key={a._id} className="rounded-2xl border-2 border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-zappy-500">
                    {VERTICAL_LABEL[a.vertical] || a.vertical}
                  </p>
                  <p className="font-bold text-[#0F172A] mt-0.5">
                    {a.label || `${a.brandName}${a.modelName ? ` · ${a.modelName}` : ''}`}
                  </p>
                  {a.label && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {a.brandName}{a.modelName ? ` · ${a.modelName}` : ''}
                    </p>
                  )}
                  {a.location?.address && (
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                      <MapPin size={11} /> {a.location.address}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                    <Clock size={11} />
                    {a.lastServicedAt
                      ? `Last serviced ${new Date(a.lastServicedAt).toLocaleDateString('en-IN')}`
                      : 'No service on record yet'}
                  </p>
                </div>
                <button type="button" onClick={() => remove(a._id)} className="p-1.5 text-slate-300 hover:text-red-500 shrink-0">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="w-full rounded-2xl border-2 border-dashed border-slate-300 text-slate-500 font-bold py-4 flex items-center justify-center gap-2"
        >
          <Plus size={16} /> Save something new
        </button>
      </Shell>

      {showAdd && <AddAssetSheet onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function AddAssetSheet({ onClose }) {
  const [vertical, setVertical] = useState('water_tank_care');
  const [brandCode, setBrandCode] = useState('');
  const [modelCode, setModelCode] = useState('');
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [create, { isLoading }] = useCreateAssetMutation();

  const { data: brandsData } = useRepairBrandsQuery(vertical);
  const { data: modelsData } = useRepairModelsQuery(
    { brandCode, vertical }, { skip: !brandCode },
  );
  const brands = brandsData?.brands || [];
  const models = modelsData?.models || [];

  async function save() {
    if (!brandCode) { toast.error('Pick one'); return; }
    try {
      await create({
        vertical, brandCode, modelCode: modelCode || null, label, address: address || undefined,
      }).unwrap();
      toast.success('Saved');
      onClose();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not save');
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-[#0F172A]">Save a thing</h2>
          <button type="button" onClick={onClose}><X size={20} /></button>
        </div>

        <select
          value={vertical}
          onChange={(e) => { setVertical(e.target.value); setBrandCode(''); setModelCode(''); }}
          className="w-full rounded-xl border-2 border-slate-200 p-3 font-medium"
        >
          {Object.entries(VERTICAL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>

        <select
          value={brandCode}
          onChange={(e) => { setBrandCode(e.target.value); setModelCode(''); }}
          className="w-full rounded-xl border-2 border-slate-200 p-3 font-medium"
        >
          <option value="">Choose one…</option>
          {brands.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
        </select>

        {!!brandCode && !!models.length && (
          <select
            value={modelCode}
            onChange={(e) => setModelCode(e.target.value)}
            className="w-full rounded-xl border-2 border-slate-200 p-3 font-medium"
          >
            <option value="">(optional)</option>
            {models.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
          </select>
        )}

        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="What do you call it? e.g. Terrace tank"
          className="w-full rounded-xl border-2 border-slate-200 p-3"
        />
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Where is it? (optional)"
          className="w-full rounded-xl border-2 border-slate-200 p-3"
        />

        <button
          type="button"
          onClick={save}
          disabled={isLoading || !brandCode}
          className="w-full rounded-2xl bg-[#0F172A] text-white font-bold py-4 disabled:opacity-50"
        >
          {isLoading ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
