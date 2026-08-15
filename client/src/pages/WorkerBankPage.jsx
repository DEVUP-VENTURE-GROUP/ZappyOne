import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, Trash2, Star, Building2, Smartphone, X, Check, Loader2, AlertCircle, ShieldCheck, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetWorkerBankAccountsQuery, useAddWorkerBankAccountMutation,
  useDeleteWorkerBankAccountMutation, useSetDefaultWorkerBankAccountMutation,
} from '../services/api';

function AddSheet({ onClose }) {
  const [tab, setTab] = useState('bank');
  const [form, setForm] = useState({ label: '', accountName: '', accountNumber: '', bankName: '', ifsc: '', upiId: '', upiLabel: '' });
  const [add, { isLoading }] = useAddWorkerBankAccountMutation();
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    try {
      await add({ type: tab, ...form }).unwrap();
      toast.success(tab === 'upi' ? 'UPI ID added successfully!' : 'Bank account added successfully!');
      onClose();
    } catch (err) { toast.error(err?.data?.error || 'Failed to add payment method'); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      
      <motion.div 
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-white rounded-t-[2rem] sm:rounded-[2.5rem] w-full max-w-lg p-6 relative z-10 shadow-2xl overflow-hidden" 
        onClick={e => e.stopPropagation()}
      >
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden" />
        
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-black text-slate-800 tracking-wide">Add Destination</h2>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"><X size={16} strokeWidth={2.5} /></button>
        </div>
        
        <div className="flex gap-2 bg-slate-100/80 p-1.5 rounded-2xl mb-6 shadow-inner">
          {['bank', 'upi'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 rounded-xl text-[13px] font-bold transition-all duration-200 flex justify-center items-center gap-2 ${tab === t ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}>
              {t === 'bank' ? <Building2 size={16} strokeWidth={2.5} /> : <Smartphone size={16} strokeWidth={2.5} />}
              {t === 'bank' ? 'Bank Transfer' : 'UPI ID'}
            </button>
          ))}
        </div>
        
        <form onSubmit={submit} className="space-y-4">
          <AnimatePresence mode="wait">
            {tab === 'bank' ? (
              <motion.div key="bank" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 pl-1">Account Holder</label>
                  <input className="input-field" placeholder="Name as per bank record" value={form.accountName} onChange={e => set('accountName', e.target.value)} required />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 pl-1">Account Number</label>
                  <input className="input-field font-mono" placeholder="0000 0000 0000" value={form.accountNumber} onChange={e => set('accountNumber', e.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 pl-1">IFSC Code</label>
                    <input className="input-field font-mono uppercase" placeholder="SBIN0001234" value={form.ifsc} onChange={e => set('ifsc', e.target.value.toUpperCase())} maxLength={11} required />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 pl-1">Bank Name</label>
                    <input className="input-field" placeholder="e.g. State Bank" value={form.bankName} onChange={e => set('bankName', e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 pl-1">Nickname (Optional)</label>
                  <input className="input-field" placeholder="e.g. Main Salary Account" value={form.label} onChange={e => set('label', e.target.value)} />
                </div>
              </motion.div>
            ) : (
              <motion.div key="upi" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 pl-1">UPI ID</label>
                  <input className="input-field font-mono" placeholder="username@bank" value={form.upiId} onChange={e => set('upiId', e.target.value)} required />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 pl-1">Nickname (Optional)</label>
                  <input className="input-field" placeholder="e.g. PhonePe / GPay" value={form.upiLabel} onChange={e => set('upiLabel', e.target.value)} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="pt-4">
            <button type="submit" disabled={isLoading}
              className="w-full py-4 rounded-[1.25rem] bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[15px] flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-indigo-600/20 transition-all active:scale-[0.98]">
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} strokeWidth={2.5} />}
              Save Securely
            </button>
            <p className="text-[10px] text-center text-slate-400 font-medium mt-3 flex items-center justify-center gap-1">
              <ShieldCheck size={12} className="text-emerald-500" /> Information is securely encrypted
            </p>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default function WorkerBankPage() {
  const nav = useNavigate();
  const { data, isLoading } = useGetWorkerBankAccountsQuery();
  const [deleteAcc] = useDeleteWorkerBankAccountMutation();
  const [setDefault] = useSetDefaultWorkerBankAccountMutation();
  const [showAdd, setShowAdd] = useState(false);

  const banks = data?.banks ?? [];
  const upiIds = data?.upiIds ?? [];

  async function handleDelete(id, type) {
    if (!window.confirm('Remove this payment method?')) return;
    try { await deleteAcc({ id, type }).unwrap(); toast.success('Removed successfully'); }
    catch { toast.error('Failed to remove'); }
  }

  async function handleDefault(id, type) {
    try { await setDefault({ id, type }).unwrap(); toast.success('Set as default'); }
    catch { toast.error('Failed'); }
  }

  return (
    <div className="min-h-screen bg-slate-50 md:flex md:justify-center md:bg-gradient-to-br md:from-slate-100 md:to-indigo-50/40">
      <div className="w-full max-w-lg lg:max-w-2xl bg-slate-50 min-h-screen relative shadow-[0_0_40px_rgba(0,0,0,0.05)] lg:shadow-[0_0_60px_rgba(0,0,0,0.08)] md:border-x border-slate-200/60">
        
        {/* Cinematic Header */}
        <header className="relative pt-6 pb-24 overflow-hidden rounded-b-[2.5rem] shadow-sm z-10" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #1e3a5f 100%)' }}>
          <motion.div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }} transition={{ duration: 4, repeat: Infinity }} />
          <motion.div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 5, repeat: Infinity, delay: 1 }} />
          
          <div className="relative z-10 px-5">
            <div className="flex items-center justify-between mb-8">
              <motion.button onClick={() => nav(-1)} whileTap={{ scale: 0.9 }} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center text-white">
                <ArrowLeft size={20} strokeWidth={2.5} />
              </motion.button>
              <h1 className="text-white font-black tracking-wide text-lg">Bank & UPI</h1>
              <motion.button onClick={() => setShowAdd(true)} whileTap={{ scale: 0.9 }} className="h-10 px-4 rounded-full bg-white text-indigo-600 font-bold text-sm flex items-center justify-center gap-1.5 shadow-md">
                <Plus size={16} strokeWidth={2.5} /> Add
              </motion.button>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-3 border border-white/20">
                <Building2 size={32} className="text-white" strokeWidth={1.5} />
              </div>
              <p className="text-white font-bold text-lg tracking-tight">Payment Methods</p>
              <p className="text-white/60 text-xs font-medium mt-1">Manage where you receive your earnings</p>
            </div>
          </div>
        </header>

        {/* Content Container */}
        <div className="relative z-20 px-4 -mt-10 pb-20 space-y-6">
          
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 bg-white rounded-[1.5rem] shadow-sm">
              <Loader2 size={24} className="animate-spin text-indigo-400 mb-3" />
              <p className="text-sm font-semibold text-slate-400">Loading accounts...</p>
            </div>
          ) : (
            <>
              {banks.length === 0 && upiIds.length === 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-[1.5rem] border border-dashed border-slate-200 p-10 text-center shadow-sm">
                  <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-4">
                    <ShieldCheck size={28} className="text-indigo-400" />
                  </div>
                  <p className="font-bold text-slate-700 text-[15px]">No Payment Methods</p>
                  <p className="text-[13px] text-slate-500 mt-1.5 mb-6">Add a bank account or UPI ID to withdraw your earnings securely.</p>
                  <button onClick={() => setShowAdd(true)} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-md hover:bg-indigo-700 transition-colors">
                    Add Method Now
                  </button>
                </motion.div>
              )}

              {/* Bank accounts */}
              {banks.length > 0 && (
                <section>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">Bank Accounts</p>
                  <div className="space-y-3">
                    {banks.map((b, i) => (
                      <motion.div key={b._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                        className={`bg-white rounded-[1.25rem] p-5 shadow-sm relative overflow-hidden transition-all ${b.isDefault ? 'border-2 border-indigo-500 ring-4 ring-indigo-50' : 'border border-slate-200 hover:border-indigo-200'}`}>
                        
                        {/* Decorative card background */}
                        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-slate-50 rounded-full opacity-50" />
                        <Building2 size={80} className="absolute -right-4 -bottom-4 text-slate-100 opacity-50" />

                        {b.isDefault && (
                          <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[9px] font-black px-3 py-1 rounded-bl-xl tracking-widest uppercase flex items-center gap-1">
                            <CheckCircle2 size={10} /> Default
                          </div>
                        )}

                        <div className="relative z-10 flex flex-col h-full justify-between">
                          <div className="mb-4">
                            <p className="text-xs text-slate-400 font-bold tracking-wider uppercase mb-1">{b.bankName || 'Bank Account'}</p>
                            <p className="font-black text-slate-800 text-lg tracking-tight">{b.accountName}</p>
                          </div>
                          
                          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex justify-between items-center">
                            <div>
                              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">A/C Number</p>
                              <p className="font-mono font-bold text-slate-700 mt-0.5">•••• {b.accountNumber.slice(-4)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">IFSC</p>
                              <p className="font-mono font-bold text-slate-700 mt-0.5">{b.ifsc}</p>
                            </div>
                          </div>
                        </div>

                        <div className="relative z-10 flex items-center justify-between mt-4 border-t border-slate-100 pt-3">
                          <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md">{b.label || 'Saved'}</span>
                          <div className="flex gap-2">
                            {!b.isDefault && (
                              <button onClick={() => handleDefault(b._id, 'bank')} className="px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                                Make Default
                              </button>
                            )}
                            <button onClick={() => handleDelete(b._id, 'bank')} className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </section>
              )}

              {/* UPI IDs */}
              {upiIds.length > 0 && (
                <section>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1 mt-6">UPI IDs</p>
                  <div className="space-y-3">
                    {upiIds.map((u, i) => (
                      <motion.div key={u._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (banks.length + i) * 0.1 }}
                        className={`bg-white rounded-[1.25rem] p-5 shadow-sm relative overflow-hidden transition-all flex items-center justify-between ${u.isDefault ? 'border-2 border-indigo-500 ring-4 ring-indigo-50' : 'border border-slate-200 hover:border-indigo-200'}`}>
                        
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                            <Smartphone size={20} className="text-indigo-500" />
                          </div>
                          <div>
                            <p className="font-black text-slate-800 text-[15px]">{u.upiId}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wider">{u.label || 'Saved'}</span>
                              {u.isDefault && <span className="text-[10px] font-bold text-indigo-600 flex items-center gap-0.5"><CheckCircle2 size={10} /> Default</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          {!u.isDefault && (
                            <button onClick={() => handleDefault(u._id, 'upi')} className="p-2 rounded-lg text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors" title="Make Default">
                              <Star size={14} className="fill-indigo-600" />
                            </button>
                          )}
                          <button onClick={() => handleDelete(u._id, 'upi')} className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </section>
              )}

              {(banks.length > 0 || upiIds.length > 0) && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex gap-3 text-[12px] font-medium text-emerald-800 mt-6 shadow-sm">
                  <AlertCircle size={16} className="shrink-0 mt-0.5 text-emerald-600" />
                  <p>Your default account will be pre-filled when you request a withdrawal from your wallet.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showAdd && <AddSheet onClose={() => setShowAdd(false)} />}
      </AnimatePresence>

      <style>{`
        .input-field { 
          width: 100%; 
          border: 2px solid transparent; 
          background-color: #f8fafc;
          border-radius: 1rem; 
          padding: 1rem; 
          font-size: 0.9375rem; 
          font-weight: 600;
          color: #1e293b;
          outline: none; 
          transition: all 0.2s;
        } 
        .input-field::placeholder {
          color: #94a3b8;
          font-weight: 500;
        }
        .input-field:focus { 
          background-color: #ffffff;
          border-color: #6366f1; 
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.1);
        }
      `}</style>
    </div>
  );
}
