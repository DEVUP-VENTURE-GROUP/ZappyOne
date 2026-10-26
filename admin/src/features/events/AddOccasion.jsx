import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { useAdminUpsertEventCategoryMutation } from '@shared/services/api';

// A new occasion: name and emoji; it goes last, and its photo is added on its card.
export default function AddOccasion({ existing }) {
  const [save, { isLoading }] = useAdminUpsertEventCategoryMutation();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🎉');
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const taken = existing.some((c) => c.slug === slug);

  async function add(e) {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error('Give the occasion a name');
    if (taken) return toast.error('That occasion already exists');
    try {
      await save({ name: name.trim(), emoji, isActive: true }).unwrap();
      toast.success(`${name.trim()} added`);
      setName('');
      setEmoji('🎉');
    } catch (err) { toast.error(err?.data?.error || 'Could not add'); }
  }

  return (
    <form onSubmit={add} className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
      <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} aria-label="Emoji" className="w-12 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-lg" />
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="New occasion, e.g. Naming Ceremony" aria-label="Occasion name"
        className="min-w-[200px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm" />
      <button type="submit" disabled={isLoading || name.trim().length < 2 || taken}
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"><Plus size={15} /> Add occasion</button>
    </form>
  );
}
