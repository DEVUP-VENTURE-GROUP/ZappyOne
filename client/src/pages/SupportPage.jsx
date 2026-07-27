import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HeadphonesIcon, Plus, ChevronLeft, X, Clock, Send,
  Loader2, CheckCircle2, MessageCircle, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetMyTicketsQuery, useGetTicketQuery,
  useCreateTicketMutation, useAddTicketMessageMutation,
} from '../services/api';
import PageTransition from '../components/common/PageTransition';

const CATEGORIES = [
  { value: 'payment',   label: '💳 Payment' },
  { value: 'order',     label: '📦 Order Issue' },
  { value: 'account',   label: '👤 Account' },
  { value: 'app_bug',   label: '🐛 App Bug' },
  { value: 'kyc',       label: '📋 KYC / Verification' },
  { value: 'other',     label: '💬 Other' },
];

const STATUS_META = {
  open:         { label: 'Open',          cls: 'bg-blue-50 text-blue-700',    dot: 'bg-blue-500' },
  in_progress:  { label: 'In Progress',   cls: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500' },
  waiting_user: { label: 'Awaiting You',  cls: 'bg-amber-50 text-amber-700',  dot: 'bg-amber-500' },
  resolved:     { label: 'Resolved',      cls: 'bg-green-50 text-green-700',  dot: 'bg-green-500' },
  closed:       { label: 'Closed',        cls: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
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

const PRIORITY_SLA = { urgent: 1, high: 2, normal: 4, low: 24 };

function TicketThread({ ticketId, onBack }) {
  const { data, isLoading, refetch } = useGetTicketQuery(ticketId);
  const [addMsg, { isLoading: sending }] = useAddTicketMessageMutation();
  const [text, setText] = useState('');

  const ticket = data?.ticket;

  async function handleSend() {
    const t = text.trim();
    if (!t) return;
    try {
      await addMsg({ id: ticketId, text: t }).unwrap();
      setText('');
      refetch();
    } catch {
      toast.error('Could not send message');
    }
  }

  if (isLoading || !ticket) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

  const slaHours = PRIORITY_SLA[ticket.priority] || 4;
  const slaDeadline = new Date(ticket.slaDeadline);
  const slaLeft = Math.max(0, Math.round((slaDeadline - Date.now()) / 3600000));
  const slaBreached = slaDeadline < new Date() && !['resolved','closed'].includes(ticket.status);

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={onBack} className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center">
            <ChevronLeft size={16} className="text-slate-600" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-slate-900 truncate">{ticket.subject}</p>
            <p className="text-xs text-slate-400">#{ticketId.slice(-8)}</p>
          </div>
          <StatusBadge status={ticket.status} />
        </div>
        {!['resolved','closed'].includes(ticket.status) && (
          <div className={`flex items-center gap-1.5 text-[10px] font-semibold px-3 py-1 rounded-lg ${
            slaBreached ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500'
          }`}>
            <Clock size={10} />
            {slaBreached
              ? 'Response overdue — escalated to senior team'
              : `Expected reply within ${slaLeft}h`
            }
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {(ticket.messages || []).map((msg, i) => {
          const isSupport = msg.from === 'admin';
          return (
            <div key={i} className={`flex ${isSupport ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${
                isSupport
                  ? 'bg-slate-100 text-slate-800'
                  : 'bg-[#0F172A] text-white'
              }`}>
                {isSupport && (
                  <p className="text-[10px] font-black text-slate-500 mb-0.5 uppercase tracking-wide">
                    Zappy Support
                  </p>
                )}
                <p className="text-sm leading-relaxed">{msg.text}</p>
                <p className={`text-[10px] mt-1 ${isSupport ? 'text-slate-400' : 'text-white/50'}`}>
                  {new Date(msg.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}

        {ticket.status === 'resolved' && (
          <div className="rounded-xl bg-green-50 border border-green-100 p-3 flex items-start gap-2">
            <CheckCircle2 size={16} className="text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-green-700">Ticket resolved</p>
              <p className="text-xs text-green-600 mt-0.5">
                {ticket.resolutionNote || 'Your issue has been addressed. If you have further questions, open a new ticket.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {!['resolved', 'closed'].includes(ticket.status) && (
        <div className="border-t border-slate-100 px-4 py-3 flex items-end gap-2 bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Reply to support…"
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

function NewTicketForm({ onClose, onCreated }) {
  const [createTicket, { isLoading }] = useCreateTicketMutation();
  const [form, setForm] = useState({
    category: '',
    subject: '',
    description: '',
    orderId: '',
    priority: 'normal',
  });

  function f(key) {
    return {
      value: form[key],
      onChange: (e) => setForm(p => ({ ...p, [key]: e.target.value })),
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.category || !form.subject.trim() || !form.description.trim()) {
      toast.error('Category, subject and description are required');
      return;
    }
    if (form.description.trim().length < 10) {
      toast.error('Description must be at least 10 characters');
      return;
    }
    try {
      const res = await createTicket({
        category: form.category,
        subject: form.subject.trim(),
        description: form.description.trim(),
        priority: form.priority,
        ...(form.orderId.trim() ? { orderId: form.orderId.trim() } : {}),
      }).unwrap();
      toast.success('Ticket created — we\'ll reply shortly');
      onCreated(res.ticket._id);
    } catch (err) {
      toast.error(err?.data?.error || 'Could not create ticket');
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[110] flex flex-col justify-end"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        className="relative bg-white rounded-t-[28px] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
      >
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 mb-4" />
        <div className="flex items-center justify-between px-5 mb-4">
          <p className="font-extrabold text-lg text-[#0F172A]">New Support Ticket</p>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1.5">Category *</p>
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
            <p className="text-xs font-bold text-slate-500 mb-1.5">Subject *</p>
            <input
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Brief summary of your issue"
              maxLength={200}
              {...f('subject')}
            />
          </div>

          <div>
            <p className="text-xs font-bold text-slate-500 mb-1.5">Description *</p>
            <textarea
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Explain the issue in detail…"
              rows={4}
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            />
          </div>

          <div>
            <p className="text-xs font-bold text-slate-500 mb-1.5">Order ID (optional)</p>
            <input
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Related order ID"
              {...f('orderId')}
            />
          </div>

          <div>
            <p className="text-xs font-bold text-slate-500 mb-1.5">Priority</p>
            <div className="flex gap-2">
              {['low', 'normal', 'high', 'urgent'].map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, priority: p }))}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold capitalize transition ${
                    form.priority === p
                      ? 'bg-[#0F172A] text-white'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Expected reply: {PRIORITY_SLA[form.priority] || 4}h for {form.priority} priority
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-12 rounded-2xl border border-slate-200 font-bold text-slate-700">
              Cancel
            </button>
            <button type="submit" disabled={isLoading}
              className="flex-1 h-12 rounded-2xl bg-[#0F172A] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {isLoading ? 'Sending…' : 'Submit Ticket'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default function SupportPage() {
  const nav = useNavigate();
  const { data, isLoading, refetch } = useGetMyTicketsQuery();
  const [showNew, setShowNew] = useState(false);
  const [activeId, setActiveId] = useState(null);

  const tickets = data?.tickets || [];

  if (activeId) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-white">
          <TicketThread
            ticketId={activeId}
            onBack={() => { setActiveId(null); refetch(); }}
          />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#F9FAFB] pb-40">
        <header className="sticky top-0 z-20 backdrop-blur-md" style={{ background: 'rgba(15,23,42,0.97)' }}>
          <div className="w-full max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
            <button onClick={() => nav('/profile')} className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
              <ChevronLeft size={16} className="text-white" />
            </button>
            <h1 className="font-black text-white flex-1 flex items-center gap-2">
              <HeadphonesIcon size={16} className="text-violet-400" />
              Help & Support
            </h1>
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-white/15 px-3 py-1.5 rounded-full hover:bg-white/25 transition"
            >
              <Plus size={13} /> New Ticket
            </button>
          </div>
        </header>

        <div className="w-full max-w-2xl mx-auto px-4 pt-4 space-y-4">
          <div className="bg-indigo-950/80 border border-indigo-800/50 rounded-2xl p-4 text-white flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Direct Email Support</p>
              <a href="mailto:support@zappyone.com" className="text-sm font-extrabold text-white hover:text-indigo-200 transition">
                support@zappyone.com
              </a>
              <p className="text-[11px] text-slate-400">24/7 Dedicated Customer Resolution Desk</p>
            </div>
            <a
              href="mailto:support@zappyone.com"
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition"
            >
              Email Us
            </a>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-slate-400" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <HeadphonesIcon size={24} strokeWidth={1.5} className="text-slate-400" />
              </div>
              <p className="font-bold text-slate-900">No support tickets yet</p>
              <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                Need help? Create a ticket and our team<br />will get back to you.
              </p>
              <button onClick={() => setShowNew(true)} className="mt-4 btn-primary text-sm">
                Create Support Ticket
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {tickets.map(t => {
                const slaDeadline = new Date(t.slaDeadline);
                const awaiting = t.status === 'waiting_user';
                return (
                  <motion.button
                    key={t._id}
                    onClick={() => setActiveId(t._id)}
                    className="w-full bg-white rounded-2xl ring-1 ring-slate-100 p-4 text-left hover:bg-slate-50 transition"
                    style={{ boxShadow: awaiting ? '0 4px 16px rgba(245,158,11,0.12)' : '0 2px 8px rgba(0,0,0,0.04)' }}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    {awaiting && (
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-lg mb-2 w-fit">
                        <AlertCircle size={10} /> Action required — reply to support
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-slate-900 truncate">{t.subject}</p>
                        <p className="text-xs text-slate-400 capitalize mt-0.5">{t.category?.replace(/_/g, ' ')}</p>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="flex items-center gap-4 mt-2.5">
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Clock size={9} />
                        {new Date(t.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                      {t.messages?.length > 0 && (
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <MessageCircle size={9} />
                          {t.messages.length} messages
                        </span>
                      )}
                      <span className="text-[10px] font-bold text-blue-600 ml-auto">View →</span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>

        <AnimatePresence>
          {showNew && (
            <NewTicketForm
              onClose={() => setShowNew(false)}
              onCreated={(id) => { setShowNew(false); refetch(); setActiveId(id); }}
            />
          )}
        </AnimatePresence>


      </div>
    </PageTransition>
  );
}
