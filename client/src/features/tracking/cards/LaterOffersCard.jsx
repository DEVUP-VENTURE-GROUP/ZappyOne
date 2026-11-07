import toast from 'react-hot-toast';
import { Clock3, Loader2, Star } from 'lucide-react';
import { useChooseJobOfferMutation, useJobOffersQuery } from '@shared/services/api';
import { useLivePoll } from '@shared/hooks/useSocket';
import { jobsDoneLabel } from '@shared/customer/jobsDone';

const clockOf = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

// Pros who cannot come now but can by a time (server jobs/offers): the customer says OK to one, or keeps waiting for someone sooner.
export default function LaterOffersCard({ jobId }) {
  const { data } = useJobOffersQuery(jobId, { pollingInterval: useLivePoll(20000) });
  const [choose, { isLoading, originalArgs }] = useChooseJobOfferMutation();
  const offers = data?.offers || [];
  if (!data?.waiting || !offers.length) return null;

  async function ok(o) {
    try { await choose({ id: jobId, by: o.by }).unwrap(); toast.success(`${o.name.split(' ')[0]} is coming. Be ready by ${clockOf(o.arriveBy)}.`); }
    catch (err) { toast.error(err?.data?.error || 'That offer is no longer open. Pick another.'); }
  }

  return (
    <section className="card space-y-3 p-4" aria-label="Pros who can come a little later">
      <div>
        <p className="text-[15px] font-extrabold text-ink-900">{offers.length === 1 ? 'A pro can come a little later' : `${offers.length} pros can come a little later`}</p>
        <p className="text-[12.5px] text-ink-500">We keep looking for someone sooner while you decide.</p>
      </div>
      <ul className="space-y-2">
        {offers.map((o) => (
          <li key={o.by} className="flex items-center gap-3 rounded-2xl border border-line p-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-zappy-50 text-[15px] font-bold text-zappy-700">
              {o.photoUrl ? <img src={o.photoUrl} alt="" className="h-full w-full object-cover" /> : o.name[0]?.toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold text-ink-900">{o.name}</span>
              <span className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-500">
                <span className="flex items-center gap-1 font-semibold text-ink-700"><Clock3 size={12} /> by {clockOf(o.arriveBy)} (in {Math.max(1, Math.round((new Date(o.arriveBy) - Date.now()) / 60000))} min)</span>
                {o.rating != null && <span className="flex items-center gap-0.5"><Star size={11} className="fill-amber-400 text-amber-400" />{Number(o.rating).toFixed(1)}</span>}
                <span>{jobsDoneLabel(o.completedJobs, 'jobs')}</span>
              </span>
            </span>
            <button type="button" onClick={() => ok(o)} disabled={isLoading} className="btn-primary min-h-[40px] shrink-0 px-4 text-[13.5px]">
              {isLoading && originalArgs?.by === o.by ? <Loader2 size={15} className="animate-spin" /> : 'OK'}
            </button>
          </li>
        ))}
      </ul>
      {data.decideBy && (
        <p className="text-[12px] text-ink-500">
          {data.autoTakes
            ? `If you do not answer, we book ${offers[0].name.split(' ')[0]} for you at ${clockOf(data.decideBy)}.`
            : 'Nothing is booked until you tap OK.'}
        </p>
      )}
    </section>
  );
}
