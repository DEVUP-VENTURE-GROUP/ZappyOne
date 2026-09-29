import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronDown, HelpCircle, Search, Loader2, MessageCircle } from 'lucide-react';
import { useGetFaqsQuery } from '@shared/services/api';

function FaqItem({ q, a, open, onToggle }) {
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button onClick={onToggle} className="w-full flex items-center justify-between gap-3 py-4 text-left">
        <span className="text-[15px] font-semibold text-[#0F172A] leading-snug">{q}</span>
        <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="overflow-hidden"
          >
            <p className="text-sm text-slate-600 leading-relaxed pb-4 whitespace-pre-line">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FaqPage() {
  const nav = useNavigate();
  const { data, isLoading } = useGetFaqsQuery('user');
  const [openId, setOpenId] = useState(null);
  const [q, setQ] = useState('');

  const groups = data?.faqs || [];
  const term = q.trim().toLowerCase();
  const filtered = term
    ? groups
        .map((g) => ({ ...g, items: g.items.filter((i) => (i.question + ' ' + i.answer).toLowerCase().includes(term)) }))
        .filter((g) => g.items.length)
    : groups;

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <button onClick={() => nav(-1)} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
            <ChevronLeft size={18} className="text-slate-600" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-zappy-600 flex items-center justify-center"><HelpCircle size={16} className="text-white" /></div>
            <h1 className="font-extrabold text-lg text-[#0F172A]">Help & FAQs</h1>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 h-11">
          <Search size={16} className="text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search help topics…"
            className="flex-1 bg-transparent text-sm outline-none" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-zappy-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <HelpCircle size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No help topics found{term ? ` for "${q}"` : ''}.</p>
          </div>
        ) : (
          filtered.map((group) => (
            <div key={group.category} className="bg-white rounded-2xl border border-slate-100 px-4 shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-widest text-zappy-500 pt-4 pb-1">{group.category}</p>
              {group.items.map((it) => (
                <FaqItem key={it.id} q={it.question} a={it.answer}
                  open={openId === it.id} onToggle={() => setOpenId(openId === it.id ? null : it.id)} />
              ))}
            </div>
          ))
        )}

        {/* Still need help → Support */}
        <button onClick={() => nav('/support')}
          className="w-full flex items-center justify-center gap-2 bg-zappy-600 text-white font-bold py-3.5 rounded-2xl active:scale-[0.98] transition-transform">
          <MessageCircle size={17} /> Still need help? Contact support
        </button>
      </div>
    </div>
  );
}
