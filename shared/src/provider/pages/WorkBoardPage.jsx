import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Loader2, MapPin, Banknote, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatPaise } from '../../utils/money';
import { useProviderJobs } from '../useProviderJobs';

/**
 * Work — everything a provider holds, and everything open near them that
 * they're verified to take, across every kind of job.
 *
 * What pays and how far is on the card before they commit; money a helper
 * would have to front is called out separately, because a job that needs
 * ₹800 of their own cash is a different decision at the same fee.
 *
 *   kinds   the job kinds this app works
 */
const when = (at) => (at ? new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null);

function MineRow({ job, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl bg-white px-4 py-3.5 text-left ring-1 ring-slate-200/80 transition hover:ring-slate-300"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold capitalize text-navy">{job.title}</span>
        <span className="block truncate text-[13px] capitalize text-slate-500">{job.subtitle}</span>
      </span>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${job.attention ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
        {job.status}
      </span>
      <ChevronRight size={16} className="shrink-0 text-slate-400" />
    </button>
  );
}

function OpenCard({ job, busy, onTake }) {
  return (
    <article className="flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200/80">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold capitalize text-zappy-700">{job.service}</p>
          <p className="mt-0.5 truncate text-[15px] font-semibold capitalize text-navy">{job.title}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[17px] font-bold tabular-nums text-emerald-700">{formatPaise(job.earningPaise)}</p>
          <p className="text-[11px] text-slate-500">you earn</p>
        </div>
      </div>

      <div className="space-y-1 text-[13px] text-slate-600">
        {job.where && (
          <p className="flex items-start gap-1.5">
            <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
            <span className="min-w-0">
              {job.where}{job.to ? <span className="text-slate-400"> → {job.to}</span> : null}
            </span>
          </p>
        )}
        <p className="text-slate-500">
          {[job.km != null ? `${job.km} km away` : null, when(job.at)].filter(Boolean).join(' · ')}
        </p>
      </div>

      {job.frontPaise > 0 && (
        <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-medium text-amber-800">
          <Banknote size={14} /> You pay {formatPaise(job.frontPaise)} at the shop; the customer repays against the receipt
        </p>
      )}

      <button
        type="button"
        onClick={onTake}
        disabled={busy}
        className="rounded-lg bg-zappy-600 py-2.5 text-[14px] font-semibold text-white transition hover:bg-zappy-700 disabled:opacity-50"
      >
        Take this job
      </button>
    </article>
  );
}

export default function WorkBoardPage({ kinds }) {
  const nav = useNavigate();
  const { mine, open, notApproved, isLoading, taking, take, refetch } = useProviderJobs({ kinds });

  async function onTake(job) {
    try {
      const to = await take(job);
      toast.success('It’s yours');
      nav(to);
    } catch (err) {
      if (err?.data?.code === 'ALREADY_CLAIMED') { toast.error('Someone else took it first'); refetch(); }
      else if (err?.data?.code === 'NOT_APPROVED_FOR_SERVICE') toast.error('Get verified for this service first');
      else toast.error(err?.data?.error || 'Could not take this job');
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F7FB]">
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button type="button" onClick={() => nav('/worker')} aria-label="Back" className="-ml-1 rounded-lg p-1.5 hover:bg-slate-100">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-[18px] font-bold text-navy">Work</h1>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-7 px-4 py-5 sm:py-7">
        {isLoading && (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-zappy-500" /></div>
        )}

        {!isLoading && (
          <section className="space-y-2.5">
            <h2 className="text-[14px] font-semibold text-slate-600">Your jobs{mine.length ? ` · ${mine.length}` : ''}</h2>
            {mine.length
              ? mine.map((j) => <MineRow key={`${j.kind}-${j.id}`} job={j} onOpen={() => nav(j.to)} />)
              : <p className="rounded-xl bg-white px-4 py-5 text-[14px] text-slate-500 ring-1 ring-slate-200/80">Nothing in hand right now.</p>}
          </section>
        )}

        {!isLoading && open !== null && (
          <section className="space-y-2.5">
            <h2 className="text-[14px] font-semibold text-slate-600">Open near you{open.length ? ` · ${open.length}` : ''}</h2>
            {open.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {open.map((j) => <OpenCard key={`${j.kind}-${j.id}`} job={j} busy={taking} onTake={() => onTake(j)} />)}
              </div>
            )}
            {!open.length && !notApproved.length && (
              <p className="rounded-xl bg-white px-4 py-5 text-[14px] text-slate-500 ring-1 ring-slate-200/80">
                No open jobs near you. New ones appear here, and you’ll get an alert.
              </p>
            )}
            {notApproved.length > 0 && (
              <button
                type="button"
                onClick={() => nav('/provider/onboarding')}
                className="flex w-full items-center gap-3 rounded-xl bg-white px-4 py-3.5 text-left ring-1 ring-slate-200/80"
              >
                <ShieldCheck size={18} className="shrink-0 text-zappy-600" />
                <span className="min-w-0 flex-1 text-[14px] text-slate-600">
                  Get verified for {notApproved.map((k) => (k === 'pet' ? 'pet care' : 'helping')).join(' and ')} to see open jobs there.
                </span>
                <ChevronRight size={16} className="shrink-0 text-slate-400" />
              </button>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
