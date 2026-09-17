import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X, Loader2, HelpCircle, FileText, Eye, EyeOff } from 'lucide-react';
import {
  useAdminListContentQuery,
  useAdminCreateContentMutation,
  useAdminUpdateContentMutation,
  useAdminToggleContentMutation,
  useAdminDeleteContentMutation,
} from '../../services/api';

const AUDIENCES = ['all', 'user', 'worker'];

/* ── Editor modal (FAQ or policy) ─────────────────────────────────────────── */
/** Shared input styling. Declared above its users so the file reads top-down. */
const inp = 'w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-400';

function Editor({ type, initial, onClose }) {
  const isFaq = type === 'faq';
  const [form, setForm] = useState(
    initial || (isFaq
      ? { type: 'faq', question: '', answer: '', category: 'General', audience: 'all', order: 0, isActive: true }
      : { type: 'policy', slug: '', title: '', body: '', audience: 'all', order: 0, isActive: true })
  );
  const [create, { isLoading: creating }] = useAdminCreateContentMutation();
  const [update, { isLoading: updating }] = useAdminUpdateContentMutation();
  const busy = creating || updating;
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    try {
      if (isFaq && (!form.question.trim() || !form.answer.trim())) return toast.error('Question and answer are required');
      if (!isFaq && (!form.slug.trim() || !form.title.trim() || !form.body.trim())) return toast.error('Slug, title and body are required');
      const payload = { ...form, order: Number(form.order) || 0 };
      if (initial?._id) await update({ id: initial._id, ...payload }).unwrap();
      else await create(payload).unwrap();
      toast.success('Saved');
      onClose();
    } catch (err) {
      toast.error(err?.data?.error || 'Save failed');
    }
  }

  return (
    <div className="fixed inset-0 z-[110] bg-black/50 flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl mt-auto sm:mt-0 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-extrabold text-lg text-slate-900">{initial ? 'Edit' : 'New'} {isFaq ? 'FAQ' : 'Page'}</p>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X size={16} /></button>
        </div>

        {isFaq ? (
          <>
            <Field label="Category"><input className={inp} value={form.category} onChange={set('category')} placeholder="e.g. Bookings" /></Field>
            <Field label="Question"><input className={inp} value={form.question} onChange={set('question')} maxLength={300} /></Field>
            <Field label="Answer"><textarea className={inp} rows={5} value={form.answer} onChange={set('answer')} maxLength={4000} /></Field>
          </>
        ) : (
          <>
            <Field label="Slug (URL)"><input className={inp} value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} placeholder="refund-policy" disabled={!!initial} /></Field>
            <Field label="Title"><input className={inp} value={form.title} onChange={set('title')} maxLength={160} /></Field>
            <Field label="Body (one point per line)"><textarea className={inp} rows={10} value={form.body} onChange={set('body')} maxLength={20000} /></Field>
          </>
        )}

        <div className="flex gap-3">
          <Field label="Audience">
            <select className={inp} value={form.audience} onChange={set('audience')}>
              {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Order"><input className={inp} type="number" value={form.order} onChange={set('order')} /></Field>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-slate-200 font-bold text-slate-700">Cancel</button>
          <button onClick={save} disabled={busy} className="flex-1 h-11 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : null} Save
          </button>
        </div>
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return <div className="flex-1"><p className="text-xs font-bold text-slate-500 mb-1">{label}</p>{children}</div>;
}

/* ── Row ───────────────────────────────────────────────────────────────────── */
function Row({ item, onEdit }) {
  const [toggle] = useAdminToggleContentMutation();
  const [del, { isLoading: deleting }] = useAdminDeleteContentMutation();
  const isFaq = item.type === 'faq';
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${item.isActive ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-70'}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900 truncate">{isFaq ? item.question : item.title}</p>
        <p className="text-xs text-slate-500 truncate mt-0.5">{isFaq ? `${item.category} · ${item.answer}` : `/${item.slug}`}</p>
      </div>
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">{item.audience}</span>
      <button onClick={() => toggle({ id: item._id, isActive: !item.isActive })} title={item.isActive ? 'Hide' : 'Show'}
        className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
        {item.isActive ? <Eye size={15} /> : <EyeOff size={15} />}
      </button>
      <button onClick={() => onEdit(item)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 shrink-0"><Pencil size={15} /></button>
      <button onClick={() => { if (confirm('Delete this item?')) del(item._id); }} disabled={deleting}
        className="w-8 h-8 rounded-lg hover:bg-rose-50 flex items-center justify-center text-rose-500 shrink-0"><Trash2 size={15} /></button>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */
export default function Content() {
  const [tab, setTab] = useState('faq');
  const { data, isLoading } = useAdminListContentQuery(tab);
  const [editing, setEditing] = useState(null); // item or 'new'
  const items = data?.items || [];

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Content & Help</h2>
          <p className="text-sm text-slate-500">FAQs and policy pages shown to customers (fully editable).</p>
        </div>
        <button onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5 bg-slate-900 text-white text-sm font-bold px-4 py-2.5 rounded-xl">
          <Plus size={16} /> New {tab === 'faq' ? 'FAQ' : 'Page'}
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {[['faq', 'FAQs', HelpCircle], ['policy', 'Policy Pages', FileText]].map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold ${tab === id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>
      ) : items.length === 0 ? (
        <p className="text-center text-slate-400 py-16 text-sm">No {tab === 'faq' ? 'FAQs' : 'pages'} yet — add one.</p>
      ) : (
        <div className="space-y-2">
          {items.map((it) => <Row key={it._id} item={it} onEdit={setEditing} />)}
        </div>
      )}

      {editing && (
        <Editor type={tab} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
