import { useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Trash2 } from 'lucide-react';
import { useAdminDeleteEventCategoryMutation, useAdminUpsertEventCategoryMutation } from '@shared/services/api';
import ImageUploadField from '@shared/components/common/ImageUploadField';

// One occasion: emoji, name and line edited in place, its cover photo, order, show or hide, and remove when no theme uses it.
export default function OccasionCard({ c, onMove, first, last }) {
  const [save] = useAdminUpsertEventCategoryMutation();
  const [remove, { isLoading: removing }] = useAdminDeleteEventCategoryMutation();
  const [draft, setDraft] = useState({ emoji: c.emoji || '', name: c.name || '', description: c.description || '' });
  const [confirm, setConfirm] = useState(false);
  const hidden = c.isActive === false;
  const dirty = draft.emoji !== (c.emoji || '') || draft.name !== c.name || draft.description !== (c.description || '');

  async function update(patch, done = 'Saved') {
    try { await save({ slug: c.slug, ...patch }).unwrap(); toast.success(done); } catch (e) { toast.error(e?.data?.error || 'Could not save'); }
  }
  async function del() {
    try { await remove(c.slug).unwrap(); toast.success(`${c.name} removed`); } catch (e) { toast.error(e?.data?.error || 'Could not remove'); setConfirm(false); }
  }

  return (
    <div className={`space-y-2.5 rounded-xl border bg-white p-3 ${hidden ? 'border-dashed border-slate-300 opacity-75' : 'border-slate-200'}`}>
      <div className="flex items-center gap-2">
        <input value={draft.emoji} onChange={(e) => setDraft((d) => ({ ...d, emoji: e.target.value }))} maxLength={8} aria-label="Emoji"
          className="w-12 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-lg" />
        <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} maxLength={60} aria-label="Name"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-semibold text-slate-900" />
        <span className={`shrink-0 text-[11px] font-bold ${hidden ? 'text-slate-400' : c.coverImage ? 'text-emerald-600' : 'text-amber-600'}`}>
          {hidden ? 'Hidden' : c.coverImage ? 'Has a photo' : 'No photo yet'}
        </span>
      </div>
      <input value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} maxLength={200} placeholder="One line customers see (optional)"
        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700" />
      {dirty && (
        <button type="button" onClick={() => update({ emoji: draft.emoji, name: draft.name.trim(), description: draft.description.trim() })} disabled={draft.name.trim().length < 2}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Save changes</button>
      )}
      <ImageUploadField value={c.coverImage || ''} onChange={(key) => update({ coverImage: key || '' })} folder="events/occasions" label="cover photo" />
      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
        <button type="button" onClick={() => onMove(-1)} disabled={first} aria-label="Move up" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={15} /></button>
        <button type="button" onClick={() => onMove(1)} disabled={last} aria-label="Move down" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={15} /></button>
        <button type="button" onClick={() => update({ isActive: hidden }, hidden ? `${c.name} is shown` : `${c.name} is hidden`)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
          {hidden ? <><Eye size={14} /> Show</> : <><EyeOff size={14} /> Hide</>}
        </button>
        <span className="text-[11px] text-slate-400">{c.themesUsing ? `${c.themesUsing} theme${c.themesUsing === 1 ? '' : 's'}` : 'No themes'}</span>
        <span className="ml-auto" />
        {confirm ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="text-slate-600">Remove {c.name}?</span>
            <button type="button" onClick={del} disabled={removing} className="rounded-lg bg-red-600 px-2 py-1 font-semibold text-white">{removing ? <Loader2 size={12} className="animate-spin" /> : 'Remove'}</button>
            <button type="button" onClick={() => setConfirm(false)} className="px-1 text-slate-500">Cancel</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} disabled={c.themesUsing > 0} title={c.themesUsing ? 'Themes use this occasion, so hide it instead' : 'Remove'}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:text-slate-300 disabled:hover:bg-transparent">
            <Trash2 size={14} /> Remove
          </button>
        )}
      </div>
    </div>
  );
}
