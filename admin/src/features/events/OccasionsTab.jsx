import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { useAdminEventCategoriesQuery, useAdminUpsertEventCategoryMutation } from '@shared/services/api';
import OccasionCard from './OccasionCard';
import AddOccasion from './AddOccasion';

// Occasions customers browse by (Birthday, Engagement…): all of it is data, in the order shown here.
export default function OccasionsTab() {
  const { data, isLoading } = useAdminEventCategoriesQuery();
  const [save] = useAdminUpsertEventCategoryMutation();
  const cats = data?.categories || [];

  // Swap with the neighbour and renumber the list, so equal or missing orders never stick.
  async function move(i, dir) {
    const next = [...cats];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    try {
      await Promise.all(next.map((c, k) => (c.sortOrder === k + 1 ? null : save({ slug: c.slug, sortOrder: k + 1 }).unwrap())));
    } catch (e) { toast.error(e?.data?.error || 'Could not reorder'); }
  }

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Add, rename, reorder or hide occasions, and give each its own cover photo. Without a photo customers see its emoji on a coloured tile. An occasion with themes can be hidden but not removed.</p>
      <AddOccasion existing={cats} />
      <div className="grid gap-3 sm:grid-cols-2">
        {cats.map((c, i) => <OccasionCard key={c.slug} c={c} first={i === 0} last={i === cats.length - 1} onMove={(dir) => move(i, dir)} />)}
      </div>
      {!cats.length && <p className="py-8 text-center text-sm text-slate-400">No occasions yet. Add the first one above.</p>}
    </div>
  );
}
