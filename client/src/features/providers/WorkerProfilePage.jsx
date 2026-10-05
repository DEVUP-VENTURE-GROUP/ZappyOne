import { useSafeBack } from '../../hooks/useBookingFlow';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Star, BadgeCheck, CalendarDays, Briefcase, MessageSquareQuote } from 'lucide-react';
import { useGetOrderQuery, useGetWorkerPublicProfileQuery } from '@shared/services/api';

/**
 * A provider's public profile: who they are, what ZappyOne has verified them
 * for, and what customers actually said. Every number on this page comes from
 * a record; where there is no record yet, the page says so ("New") instead of
 * filling the gap.
 */

function since(date) {
  if (!date) return null;
  return new Date(date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function ago(date) {
  if (!date) return '';
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days < 1) return 'Today';
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`;
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Stars({ value, size = 14 }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} className={n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-line-strong'} />
      ))}
    </span>
  );
}

function Fact({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-white p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-sunken text-ink-700"><Icon size={17} /></span>
      <span className="min-w-0">
        <span className="block text-[12px] text-ink-500">{label}</span>
        <span className="block truncate text-[15px] font-semibold text-ink-900">{value}</span>
      </span>
    </div>
  );
}

export default function WorkerProfilePage() {
  const { workerId } = useParams();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');
  const nav = useNavigate();
  // Back to the previous page, or to / when this page was opened directly.
  const goBack = useSafeBack('/');

  const { data: profileData, isLoading } = useGetWorkerPublicProfileQuery(workerId, { skip: !workerId });
  // Older bookings carry the provider's name on the order itself.
  const { data: orderData } = useGetOrderQuery(orderId, { skip: !orderId || !!profileData });

  const worker = profileData?.worker ?? null;
  const order = orderData?.order ?? null;
  const reviews = profileData?.reviews ?? [];

  const name = worker?.name ?? order?.workerName ?? 'Your pro';
  const ratingCount = worker?.ratingCount ?? 0;
  const rating = ratingCount ? worker?.rating : null;
  const completedJobs = worker?.completedJobs ?? 0;
  const verifiedServices = worker?.verifiedServices ?? [];
  const isVerified = !!worker?.verified;
  const breakdown = worker?.breakdown ?? null;
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  // Rebooking starts a flow this person is verified for, never a guess.
  const bookablePath = verifiedServices.find((s) => s.path)?.path || null;
  const rebook = () => (bookablePath ? nav(`${bookablePath}?preferredWorker=${workerId}`) : nav('/services'));

  return (
    <div className="min-h-screen bg-canvas pb-32">
      <header className="sticky top-0 z-20 border-b border-line bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-2.5">
          <button type="button" onClick={() => goBack()} aria-label="Back" className="back-btn -ml-1.5"><ArrowLeft size={19} /></button>
          <p className="text-[17px] font-bold text-ink-900">Profile</p>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-5">
        {/* Who */}
        <section className="flex items-center gap-4 rounded-card border border-line bg-white p-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-zappy-50 text-[22px] font-bold text-zappy-700">
            {initials}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[21px] font-bold text-ink-900">{isLoading ? '…' : name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {isVerified && <span className="chip bg-green-50 text-green-700"><ShieldCheck size={12} /> ID verified</span>}
              {rating != null
                ? <span className="chip bg-amber-50 text-amber-800"><Star size={12} className="fill-amber-400 text-amber-400" /> {Number(rating).toFixed(1)} · {ratingCount} rating{ratingCount === 1 ? '' : 's'}</span>
                : <span className="chip bg-sunken text-ink-700">New on ZappyOne</span>}
            </div>
          </div>
        </section>

        {/* Facts, all from records */}
        <section className="grid grid-cols-2 gap-3">
          <Fact icon={Briefcase} label="Jobs completed" value={completedJobs ? completedJobs.toLocaleString('en-IN') : 'None yet'} />
          <Fact icon={CalendarDays} label="On ZappyOne since" value={since(worker?.memberSince) || '—'} />
        </section>

        {/* Verified for */}
        <section className="rounded-card border border-line bg-white p-4">
          <h2 className="text-[15px] font-bold text-ink-900">Verified for</h2>
          <p className="mt-0.5 text-[13px] text-ink-500">ZappyOne checked their documents for each of these.</p>
          {verifiedServices.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {verifiedServices.map((s) => (
                <span key={s.code} className="chip bg-zappy-50 text-zappy-700"><BadgeCheck size={13} /> {s.name}</span>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-[14px] text-ink-500">No services verified yet.</p>
          )}
        </section>

        {/* Rating spread */}
        {ratingCount > 0 && breakdown && (
          <section className="rounded-card border border-line bg-white p-4">
            <div className="flex items-center gap-3">
              <span className="text-[32px] font-bold leading-none tabular-nums text-ink-900">{Number(rating).toFixed(1)}</span>
              <div>
                <Stars value={rating} />
                <p className="mt-0.5 text-[13px] text-ink-500">{ratingCount} rating{ratingCount === 1 ? '' : 's'}</p>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              {[5, 4, 3, 2, 1].map((n) => {
                const c = breakdown[n] || 0;
                return (
                  <div key={n} className="flex items-center gap-2 text-[12px] tabular-nums text-ink-500">
                    <span className="w-3">{n}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                      <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(c / ratingCount) * 100}%` }} />
                    </span>
                    <span className="w-6 text-right">{c}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* What customers said */}
        <section className="rounded-card border border-line bg-white p-4">
          <h2 className="text-[15px] font-bold text-ink-900">What customers said</h2>
          {reviews.length ? (
            <ul className="mt-3 divide-y divide-line">
              {reviews.map((r, i) => (
                <li key={r.id || i} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold text-ink-900">{r.by || 'Customer'}</span>
                    <span className="text-[12px] text-ink-400">{ago(r.at)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Stars value={r.rating} size={12} />
                    {r.service && <span className="text-[12px] capitalize text-ink-500">{r.service}</span>}
                  </div>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-ink-700">{r.text}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 flex items-center gap-3 rounded-btn bg-sunken p-3 text-[14px] text-ink-500">
              <MessageSquareQuote size={18} className="shrink-0" />
              No written reviews yet. Reviews appear here after customers rate a finished job.
            </div>
          )}
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white p-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
        <div className="mx-auto max-w-2xl">
          <button type="button" onClick={rebook} className="btn-primary w-full">
            {bookablePath ? `Book ${name.split(' ')[0]} again` : 'See services'}
          </button>
        </div>
      </div>
    </div>
  );
}
