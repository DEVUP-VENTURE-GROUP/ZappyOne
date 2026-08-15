import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, ChevronRight, AlertCircle, Clock, CheckCircle, XCircle, Loader2, X, Scale, FileText, MessagesSquare, CheckCircle2, Flag } from 'lucide-react';
import toast from 'react-hot-toast';
import { useGetWorkerAppealsQuery, useCreateWorkerAppealMutation } from '../services/api';

const STATUS_CONFIG = {
  pending:      { label: 'Pending Review', color: 'amber',   Icon: Clock },
  under_review: { label: 'Under Review',   color: 'blue',    Icon: AlertCircle },
  upheld:       { label: 'Upheld (Won)',   color: 'emerald', Icon: CheckCircle },
  dismissed:    { label: 'Dismissed',      color: 'rose',    Icon: XCircle },
};

const TYPE_OPTS = ['rating', 'penalty', 'cancellation', 'order_issue'];
const TYPE_LABELS = { rating: 'Rating Dispute', penalty: 'Penalty Appeal', cancellation: 'Cancellation Reversal', order_issue: 'Order Issue' };
const TYPE_ICONS = { rating: StarIcon, penalty: AlertCircle, cancellation: XCircle, order_issue: Flag };

function StarIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
}

function StatusBadge({ status }) {
  const c = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border bg-${c.color}-50 text-${c.color}-700 border-${c.color}-200/50`}>
      <c.Icon size={12} strokeWidth={2.5} /> {c.label}
    </span>
  );
}

function NewAppealSheet({ onClose }) {
  const [form, setForm] = useState({ type: 'rating', subject: '', description: '', orderId: '' });
  const [create, { isLoading }] = useCreateWorkerAppealMutation();
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (form.description.length < 30) return toast.error('Please describe the issue in at least 30 characters');
    try {
      await create(form).unwrap();
      toast.success('Appeal submitted successfully');
      onClose();
    } catch (err) {
      toast.error(err?.data?.error || 'Failed to submit appeal. Please try again.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center sm:items-center sm:p-4 bg-black/60 backdrop-blur-md transition-opacity">
      <motion.div initial={{ opacity: 0, y: '100%' }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: '100%' }} transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-white rounded-t-[2rem] sm:rounded-[2rem] w-full max-w-lg max-h-[95vh] flex flex-col overflow-hidden shadow-2xl absolute bottom-0 sm:relative" 
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 px-6 border-b border-slate-100 bg-white/80 backdrop-blur-xl z-10 sticky top-0">
          <h2 className="font-black text-slate-800 text-[16px] tracking-wide">File an Appeal</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors shrink-0"><X size={16} strokeWidth={2.5} /></button>
        </div>

        <div className="overflow-y-auto p-5 sm:p-6 custom-scrollbar">
          <form onSubmit={submit} className="space-y-6">
            
            <div>
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 pl-1">What is this regarding?</p>
              <div className="grid grid-cols-2 gap-2.5">
                {TYPE_OPTS.map(t => {
                  const Icon = TYPE_ICONS[t];
                  const isSelected = form.type === t;
                  return (
                    <button type="button" key={t} onClick={() => set('type', t)}
                      className={`flex flex-col items-start gap-2 p-3.5 rounded-[1.25rem] border-2 transition-all duration-200 ${isSelected ? 'border-indigo-500 bg-indigo-50 shadow-[0_2px_10px_rgba(99,102,241,0.1)] text-indigo-900' : 'border-slate-100 bg-white text-slate-600 hover:border-indigo-200 hover:bg-slate-50'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isSelected ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400'}`}>
                        <Icon size={14} strokeWidth={isSelected ? 2.5 : 2} />
                      </div>
                      <span className={`text-[13px] text-left leading-tight ${isSelected ? 'font-black' : 'font-bold'}`}>{TYPE_LABELS[t]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1.5 pl-1">Subject</label>
                <input
                  className="w-full bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 rounded-2xl px-4 py-3.5 text-[15px] font-bold text-slate-800 outline-none transition-all placeholder:text-slate-400 placeholder:font-medium shadow-inner"
                  placeholder="e.g. Unfair 1-star rating from customer"
                  value={form.subject} onChange={e => set('subject', e.target.value)} required
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1.5 pl-1">Order ID <span className="font-medium normal-case text-slate-300">(Optional)</span></label>
                <input
                  className="w-full bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 rounded-2xl px-4 py-3.5 text-[15px] font-mono font-bold text-slate-800 outline-none transition-all placeholder:text-slate-400 placeholder:font-sans placeholder:font-medium shadow-inner"
                  placeholder="Paste order ID if applicable"
                  value={form.orderId} onChange={e => set('orderId', e.target.value)}
                />
              </div>

              <div>
                <div className="flex justify-between items-end mb-1.5 pl-1 pr-1">
                  <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest">Detailed Explanation</label>
                  <span className={`text-[10px] font-bold ${form.description.length < 30 ? 'text-amber-500' : 'text-emerald-500'}`}>
                    {form.description.length}/30 min chars
                  </span>
                </div>
                <textarea
                  className="w-full bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 rounded-2xl px-4 py-3.5 text-[14px] font-medium text-slate-800 outline-none resize-none transition-all placeholder:text-slate-400 shadow-inner"
                  placeholder="Please describe exactly what happened and why you are appealing. Providing details helps us review faster."
                  rows={5} value={form.description} onChange={e => set('description', e.target.value)} required
                />
              </div>
            </div>

            <div className="flex items-start gap-2.5 bg-indigo-50/50 rounded-[1.25rem] p-4 border border-indigo-100/50">
              <Clock size={16} className="shrink-0 text-indigo-500 mt-0.5" strokeWidth={2.5} />
              <p className="text-xs font-semibold text-indigo-800/80 leading-relaxed">Our support team reviews appeals within 2-3 business days. We will notify you once a decision is made.</p>
            </div>

            <div className="pt-2 pb-4">
              <button type="submit" disabled={isLoading || form.description.length < 30}
                className="w-full py-4 rounded-[1.25rem] bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[15px] shadow-lg shadow-indigo-600/20 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                {isLoading ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} strokeWidth={2.5} />} 
                {isLoading ? 'Submitting...' : 'Submit Appeal'}
              </button>
            </div>
            
          </form>
        </div>
      </motion.div>
    </div>
  );
}

export default function WorkerAppealsPage() {
  const nav = useNavigate();
  const { data, isLoading } = useGetWorkerAppealsQuery();
  const [showNew, setShowNew] = useState(false);
  const appeals = data?.appeals ?? [];

  return (
    <div className="min-h-screen bg-slate-50 md:flex md:justify-center md:bg-gradient-to-br md:from-slate-100 md:to-indigo-50/40">
      <div className="w-full max-w-lg lg:max-w-2xl bg-slate-50 min-h-screen relative shadow-[0_0_40px_rgba(0,0,0,0.05)] lg:shadow-[0_0_60px_rgba(0,0,0,0.08)] md:border-x border-slate-200/60 pb-8">
        
        {/* Cinematic Header */}
        <header className="relative pt-6 pb-28 overflow-hidden rounded-b-[2.5rem] shadow-sm z-10" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #1e3a5f 100%)' }}>
          <motion.div className="absolute top-0 left-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/3" animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }} transition={{ duration: 5, repeat: Infinity }} />
          <motion.div className="absolute bottom-0 right-0 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl translate-y-1/3 translate-x-1/4" animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 6, repeat: Infinity, delay: 1 }} />
          
          <div className="relative z-10 px-5">
            <div className="flex items-center justify-between mb-8">
              <motion.button onClick={() => nav(-1)} whileTap={{ scale: 0.9 }} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center text-white shadow-sm">
                <ArrowLeft size={20} strokeWidth={2.5} />
              </motion.button>
              <h1 className="text-white font-black tracking-wide text-lg">Appeals Center</h1>
              <motion.button onClick={() => setShowNew(true)} whileTap={{ scale: 0.9 }} className="h-10 px-4 rounded-full bg-white text-indigo-600 font-bold text-sm flex items-center justify-center gap-1.5 shadow-md">
                <Plus size={16} strokeWidth={2.5} /> File Appeal
              </motion.button>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-3 border border-white/20 shadow-inner">
                <Scale size={32} className="text-blue-300 fill-blue-400/20" strokeWidth={1.5} />
              </div>
              <p className="text-white font-bold text-lg tracking-tight mb-1">Fair & Transparent</p>
              <p className="text-white/60 text-xs font-medium px-6">Contest unfair ratings or penalties. Our dedicated team reviews every case carefully.</p>
            </div>
          </div>
        </header>

        <div className="relative z-20 px-4 -mt-10 space-y-4">
          
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 bg-white rounded-[1.5rem] shadow-sm">
              <Loader2 size={28} className="animate-spin text-indigo-400 mb-3" />
              <p className="text-sm font-semibold text-slate-400">Loading your appeals...</p>
            </div>
          ) : appeals.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-[1.5rem] border border-dashed border-slate-200 p-12 text-center shadow-sm">
              <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-5">
                <FileText size={32} className="text-slate-300" strokeWidth={1.5} />
              </div>
              <p className="font-black text-slate-700 text-lg mb-1">No Appeals Yet</p>
              <p className="text-sm text-slate-500 font-medium mb-6 px-4">If you feel a rating or penalty was unfair, you can file an appeal here.</p>
              <button onClick={() => setShowNew(true)} className="py-3 px-6 bg-indigo-600 text-white rounded-xl font-bold shadow-md hover:bg-indigo-700 transition-colors">File an Appeal</button>
            </motion.div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Your Appeal History</p>
                <span className="text-[11px] font-bold text-slate-500 bg-slate-200/50 px-2.5 py-1 rounded-full">{appeals.length} Total</span>
              </div>
              
              {appeals.map((a, i) => {
                const TypeIcon = TYPE_ICONS[a.type] || FileText;
                return (
                  <motion.div key={a._id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                    className="bg-white rounded-[1.5rem] border border-slate-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-5 relative overflow-hidden group">
                    
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-slate-100 group-hover:bg-indigo-100 transition-colors" />
                    
                    <div className="pl-2">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center flex-wrap gap-2 mb-2">
                            <span className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-black uppercase tracking-widest">
                              <TypeIcon size={10} strokeWidth={2.5} /> {TYPE_LABELS[a.type] ?? a.type}
                            </span>
                            <StatusBadge status={a.status} />
                          </div>
                          <p className="font-black text-slate-800 text-[15px] leading-tight mb-1">{a.subject}</p>
                          <p className="text-[13px] text-slate-500 font-medium leading-relaxed line-clamp-3">{a.description}</p>
                        </div>
                      </div>
                      
                      {a.adminNote && (
                        <div className="mt-4 bg-slate-50 rounded-2xl p-4 text-[13px] text-slate-700 border border-slate-100 shadow-inner flex gap-3 items-start">
                          <MessagesSquare size={16} className="text-indigo-400 shrink-0 mt-0.5" strokeWidth={2} />
                          <div>
                            <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wider mb-0.5">Admin Response</p>
                            <p className="font-medium">{a.adminNote}</p>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                        <p className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                          <Clock size={12} strokeWidth={2.5} />
                          Submitted on {new Date(a.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        {a.orderId && (
                          <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                            ID: {a.orderId.slice(-6)}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showNew && <NewAppealSheet onClose={() => setShowNew(false)} />}
      </AnimatePresence>
    </div>
  );
}
