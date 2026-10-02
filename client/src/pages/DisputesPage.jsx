import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Scale, Plus, ChevronLeft, X, AlertCircle, CheckCircle2,
  Clock, Send, Loader2, Upload, MessageCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetMyDisputesQuery, useGetDisputeQuery,
  useOpenDisputeMutation, useAddDisputeMessageMutation,
} from '@shared/services/api';
import PageTransition from '../components/common/PageTransition';

const CATEGORIES = [
  { value: 'overcharged',      label: '💰 Overcharged' },
  { value: 'poor_quality',     label: '⭐ Poor Quality' },
  { value: 'service_not_done', label: '❌ Service Not Done' },
  { value: 'no_show',          label: '🚫 Worker No-Show' },
  { value: 'damage',           label: '🔧 Property Damage' },
  { value: 'rude_behavior',    label: '😠 Rude Behaviour' },
  { value: 'safety_concern',   label: '🛡 Safety Issue' },
  { value: 'wrong_address',    label: '📍 Wrong Address' },
  { value: 'other',            label: '💬 Other' },
];

const STATUS_META = {
  open:       { label: 'Open',       cls: 'bg-blue-50 text-blue-700',   dot: 'bg-blue-500' },
  in_review:  { label: 'In Review',  cls: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  resolved:   { label: 'Resolved',   cls: 'bg-green-50 text-green-700', dot: 'bg-green-500' },
  closed:     { label: 'Closed',     cls: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.open;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${m.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function DisputeThread({ disputeId, onBack }) {
  const { data, isLoading, refetch } = useGetDisputeQuery(disputeId);
  const [addMsg, { isLoading: sending }] = useAddDisputeMessageMutation();
  const [text, setText] = useState('');

  const dispute = data?.dispute;

  async function handleSend() {
    const t = text.trim();
    if (!t) return;
    try {
      await addMsg({ id: disputeId, text: t }).unwrap();
      setText('');
      refetch();
    } catch {
      toast.error('Could not send message');
    }
  }

  if (isLoading || !dispute) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center">
          <ChevronLeft size={16} className="text-slate-600" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-slate-900 truncate">{dispute.category?.replace(/_/g, ' ')}</p>
          <p className="text-xs text-slate-400">#{disputeId.slice(-8)}</p>
        </div>
        <StatusBadge status={dispute.status} />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Your complaint</p>
          <p className="text-sm text-slate-700 leading-relaxed">{dispute.description}</p>
          {dispute.evidenceUrls?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {dispute.evidenceUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100 transition">
                  Attachment {i + 1}
                </a>
              ))}
            </div>
          )}
        </div>

        {(dispute.messages || []).map((msg, i) => {
          const isAdmin = msg.from === 'admin';
          return (
            <div key={i} className={`flex ${isAdmin ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${
                isAdmin
                  ? 'bg-slate-100 text-slate-800'
                  : 'bg-[#0F172A] text-white'
              }`}>
                {isAdmin && <p className="text-[10px] font-black text-slate-500 mb-0.5 uppercase tracking-wide">Support Team</p>}
                <p className="text-sm leading-relaxed">{msg.text}</p>
                <p className={`text-[10px] mt-1 ${isAdmin ? 'text-slate-400' : 'text-white/50'}`}>
                  {new Date(msg.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}

        {dispute.resolution && (
          <div className="rounded-xl bg-green-50 border border-green-100 p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 size={14} className="text-green-600" />
              <p className="text-xs font-bold text-green-700 uppercase tracking-wide">Resolution</p>
            </div>
            <p className="text-sm text-green-800">{dispute.resolution.type?.replace(/_/g, ' ')}</p>
            {dispute.resolution.adminNotes && (
              <p className="text-xs text-green-700 mt-1">{dispute.resolution.adminNotes}</p>
            )}
            {dispute.resolution.refundAmountPaise > 0 && (
              <p className="text-sm font-bold text-green-700 mt-1">
                Refund: ₹{Math.round(dispute.resolution.refundAmountPaise / 100)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Message input */}
      {!['resolved', 'closed'].includes(dispute.status) && (
        <div className="border-t border-slate-100 px-4 py-3 flex items-end gap-2 bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Add more details…"
            rows={2}
            className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <button
            onClick={handleSend}
            disabled={sending || !text.trim()}
            className="w-10 h-10 rounded-xl bg-[#0F172A] text-white flex items-center justify-center disabled:opacity-40 transition"
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      )}
    </div>
  );
}

function NewDisputeForm({ onClose, onCreated }) {
  const [openDispute, { isLoading }] = useOpenDisputeMutation();
  const [form, setForm] = useState({
    orderId: '',
    category: '',
    description: '',
  });

  function f(key) {
    return {
      value: form[key],
      onChange: (e) => setForm(p => ({ ...p, [key]: e.target.value })),
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.category || !form.description.trim()) {
      toast.error('Category and description are required');
      return;
    }
    if (form.description.trim().length < 10) {
      toast.error('Description must be at least 10 characters');
      return;
    }
    try {
      const res = await openDispute({
        category: form.category,
        description: form.description.trim(),
        ...(form.orderId.trim() ? { orderId: form.orderId.trim() } : {}),
      }).unwrap();
      toast.success('Dispute raised — our team will review it shortly');
      onCreated(res.dispute._id);
    } catch (err) {
      toast.error(err?.data?.error || 'Could not raise dispute');
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[110] flex flex-col justify-end"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        className="relative bg-white rounded-t-sheet pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
      >
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 mb-4" />
        <div className="flex items-center justify-between px-5 mb-4">
          <p className="font-extrabold text-lg text-[#0F172A]">Raise a Dispute</p>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1.5">Issue Category *</p>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, category: cat.value }))}
                  className={`px-3 py-2.5 rounded-xl text-xs font-semibold text-left transition ${
                    form.category === cat.value
                      ? 'bg-[#0F172A] text-white'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-500 mb-1.5">Order ID (optional)</p>
            <input
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Paste order ID from your bookings"
              {...f('orderId')}
            />
          </div>

          <div>
            <p className="text-xs font-bold text-slate-500 mb-1.5">Describe the Issue *</p>
            <textarea
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Explain what happened in detail (min 10 characters)…"
              rows={4}
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            />
            <p className="text-[10px] text-slate-400 mt-0.5 text-right">{form.description.length} / 2000</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-12 rounded-2xl border border-slate-200 font-bold text-slate-700">
              Cancel
            </button>
            <button type="submit" disabled={isLoading}
              className="flex-1 h-12 rounded-2xl bg-[#0F172A] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Scale size={16} />}
              {isLoading ? 'Submitting…' : 'Submit Dispute'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default function DisputesPage() {
  const nav = useNavigate();
  const { data, isLoading, refetch } = useGetMyDisputesQuery();
  const [showNew, setShowNew] = useState(false);
  const [activeId, setActiveId] = useState(null);

  const disputes = data?.disputes || [];

  if (activeId) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-white">
          <DisputeThread
            disputeId={activeId}
            onBack={() => { setActiveId(null); refetch(); }}
          />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#F9FAFB] pb-40">
        <header className="sticky top-0 z-20" style={{ background: 'rgba(15,23,42,0.97)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="w-full max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
            <button onClick={() => nav('/profile')} className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
              <ChevronLeft size={16} className="text-white" />
            </button>
            <h1 className="font-black text-white flex-1 flex items-center gap-2">
              <Scale size={16} className="text-blue-400" />
              My Disputes
            </h1>
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-white/15 px-3 py-1.5 rounded-full hover:bg-white/25 transition"
            >
              <Plus size={13} /> New
            </button>
          </div>
        </header>

        <div className="w-full max-w-2xl mx-auto px-4 pt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-slate-400" />
            </div>
          ) : disputes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <Scale size={24} strokeWidth={1.5} className="text-slate-400" />
              </div>
              <p className="font-bold text-slate-900">No disputes raised</p>
              <p className="text-sm text-slate-400 mt-1">Had an issue? Raise a dispute and our team will help.</p>
              <button
                onClick={() => setShowNew(true)}
                className="mt-4 btn-primary text-sm"
              >
                Raise a Dispute
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {disputes.map(d => (
                <motion.button
                  key={d._id}
                  onClick={() => setActiveId(d._id)}
                  className="w-full bg-white rounded-2xl ring-1 ring-slate-100 p-4 text-left hover:bg-slate-50 transition"
                  style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-slate-900 capitalize">
                        {d.category?.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{d.description}</p>
                    </div>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="flex items-center gap-4 mt-2.5">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Clock size={9} />
                      {new Date(d.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    {d.messages?.length > 0 && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <MessageCircle size={9} />
                        {d.messages.length} messages
                      </span>
                    )}
                    <span className="text-[10px] font-bold text-blue-600 ml-auto">View →</span>
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>

        <AnimatePresence>
          {showNew && (
            <NewDisputeForm
              onClose={() => setShowNew(false)}
              onCreated={(id) => { setShowNew(false); refetch(); setActiveId(id); }}
            />
          )}
        </AnimatePresence>


      </div>
    </PageTransition>
  );
}
