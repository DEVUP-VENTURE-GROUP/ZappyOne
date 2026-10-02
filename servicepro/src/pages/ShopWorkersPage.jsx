import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Loader2, X, Star, Briefcase, ShieldCheck, Clock, XCircle, Circle,
} from 'lucide-react';
import { useShopWorkersQuery, useAddShopWorkerMutation, useRemoveShopWorkerMutation } from '@shared/services/api';
import toast from 'react-hot-toast';

const KYC_PILL = {
  approved: { label: 'Verified', cls: 'bg-emerald-50 text-emerald-700', Icon: ShieldCheck },
  pending_review: { label: 'Pending review', cls: 'bg-amber-50 text-amber-700', Icon: Clock },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-700', Icon: XCircle },
  not_submitted: { label: 'Not verified yet', cls: 'bg-slate-100 text-slate-500', Icon: Circle },
};

export default function ShopWorkersPage() {
  const nav = useNavigate();
  const { data, isLoading } = useShopWorkersQuery();
  const [addWorker, { isLoading: adding }] = useAddShopWorkerMutation();
  const [removeWorker] = useRemoveShopWorkerMutation();

  const [showAdd, setShowAdd] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [removingId, setRemovingId] = useState(null);

  const workers = data?.workers || [];

  async function handleAdd(e) {
    e.preventDefault();
    if (phone.length < 10) return toast.error('Enter a valid phone number');
    try {
      const res = await addWorker({ phone, name: name || undefined }).unwrap();
      toast.success(res.isNew
        ? 'Added. They sign in at Shop worker login with this number and verify their ID (Aadhaar + selfie) to go on duty.'
        : 'Linked to your shop', { duration: 6000 });
      setShowAdd(false);
      setPhone(''); setName('');
    } catch (err) {
      toast.error(err?.data?.error || 'Failed to add worker');
    }
  }

  async function handleRemove(workerId) {
    setRemovingId(workerId);
    try {
      await removeWorker(workerId).unwrap();
      toast.success('Worker removed from your shop');
    } catch (err) {
      toast.error(err?.data?.error || 'Failed to remove worker');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-10">
      <header className="page-header"><div className="page-header-inner">
        <button onClick={() => nav('/shop')} className="back-btn"><ArrowLeft size={18} strokeWidth={2.5} /></button>
        <h1 className="h-card">Workers</h1>
        <button onClick={() => setShowAdd(true)} className="ml-auto btn-primary text-xs py-2 px-3 flex items-center gap-1">
          <Plus size={14} strokeWidth={2.5} /> Add
        </button>
      </div></header>

      <div className="max-w-lg lg:max-w-2xl mx-auto px-4 pt-4 space-y-3">

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-zappy-400" /></div>
        ) : workers.length === 0 ? (
          <div className="text-center py-14">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Briefcase size={28} className="text-slate-300" />
            </div>
            <p className="font-bold text-slate-700 text-sm">No workers yet</p>
            <p className="text-xs text-slate-400 mt-1">Add a worker by their phone number to get started.</p>
            <button onClick={() => setShowAdd(true)} className="btn-primary mt-4 px-6">Add Worker</button>
          </div>
        ) : (
          workers.map((w) => {
            const kyc = KYC_PILL[w.kyc?.status || 'not_submitted'];
            return (
              <div key={w._id} className="card flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-zappy-50 flex items-center justify-center shrink-0 font-bold text-zappy-600 text-sm">
                  {(w.name || w.phone || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-[#0F172A] truncate">{w.name || 'Unnamed worker'}</p>
                  <p className="text-xs text-slate-400">{w.phone}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${kyc.cls}`}>
                      <kyc.Icon size={10} /> {kyc.label}
                    </span>
                    {w.rating > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-500">
                        <Star size={10} className="text-amber-400 fill-amber-400" /> {w.rating.toFixed(1)}
                      </span>
                    )}
                    <span className={`w-1.5 h-1.5 rounded-full ${w.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className="text-[10px] font-semibold text-slate-400">{w.isOnline ? 'On duty' : 'Off duty'}</span>
                  </div>
                </div>
                <button onClick={() => handleRemove(w._id)} disabled={removingId === w._id}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition shrink-0">
                  {removingId === w._id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Add worker sheet */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowAdd(false)}>
          <form onSubmit={handleAdd} onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-6 space-y-4 safe-pb">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Add Worker</h3>
              <button type="button" onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <p className="text-xs text-slate-400 -mt-2">If this phone number already belongs to a Zappy worker, we'll just link them to your shop.</p>
            <div>
              <label className="text-[12px] font-bold text-slate-700 block mb-1.5">Phone Number <span className="text-red-500">*</span></label>
              <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile number"
                className="input text-sm w-full" />
            </div>
            <div>
              <label className="text-[12px] font-bold text-slate-700 block mb-1.5">Name <span className="text-slate-400 font-medium">(required if new)</span></label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Worker's name" className="input text-sm w-full" />
            </div>
            {/*
              * No skills picker. A technician works on whatever the SHOP is
              * approved for — that is set once, on the shop's own setup screen,
              * rather than re-answered for every person hired.
              */}
            <p className="rounded-xl bg-slate-50 p-3 text-[11.5px] leading-relaxed text-slate-500">
              They will be able to work on everything your shop is approved for.
              They still complete their own verification before taking jobs.
            </p>
            <button type="submit" disabled={adding || phone.length < 10 || !name.trim()} className="btn-primary w-full">
              {adding ? <><Loader2 size={15} className="animate-spin" /> Adding…</> : 'Add Worker'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
