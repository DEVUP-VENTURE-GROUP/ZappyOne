import { useSafeBack } from '../../hooks/useBookingFlow';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, MessageSquareQuote, ShieldCheck, Star, UserRound } from 'lucide-react';
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

  const levels = [[5, 'Excellent', 'bg-green-600'], [4, 'Good', 'bg-lime-500'], [3, 'Average', 'bg-yellow-400'], [2, 'Bad', 'bg-orange-400'], [1, 'Very bad', 'bg-red-500']];

  return (
    <div className="min-h-screen bg-sunken">
      <div className="mx-auto min-h-screen max-w-2xl bg-white pb-28">
        <header className="sticky top-0 z-20 bg-white px-2 py-2">
          <button type="button" onClick={() => goBack()} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full text-ink-900 hover:bg-sunken"><ArrowLeft size={21} /></button>
        </header>

        <section className="border-b-8 border-sunken px-4 pb-6 text-center">
          <span className="mx-auto flex h-24 w-24 items-center justify-center rounded-2xl bg-zappy-50 text-[30px] font-extrabold text-zappy-700">{initials}</span>
          <h1 className="mt-4 text-[24px] font-bold text-ink-900">{isLoading ? '…' : name}</h1>
          {verifiedServices.length > 0 && <p className="mt-1 text-[14px] text-ink-500">{verifiedServices.slice(0, 2).map((s) => s.name).join(', ')}</p>}
          <dl className="mx-auto mt-6 grid max-w-xs grid-cols-2">
            <div>
              <dt className="sr-only">Rating</dt>
              <dd className="flex items-center justify-center gap-1 text-[24px] font-semibold tabular-nums text-ink-900">
                {rating != null ? <><Star size={20} className="fill-ink-900 text-ink-900" />{Number(rating).toFixed(2)}</> : 'New'}
              </dd>
              <p className="mt-0.5 text-[13px] text-ink-500">Rating</p>
            </div>
            <div>
              <dt className="sr-only">Bookings</dt>
              <dd className="text-[24px] font-semibold tabular-nums text-ink-900">{completedJobs.toLocaleString('en-IN')}</dd>
              <p className="mt-0.5 text-[13px] text-ink-500">Bookings</p>
            </div>
          </dl>
        </section>

        <section className="border-b-8 border-sunken px-4 py-1">
          <div className="flex items-center gap-4 py-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-green-50 text-green-700"><ShieldCheck size={24} /></span>
            <p className="flex-1 text-[15px] text-ink-900">{isVerified ? 'ID and documents checked by ZappyOne' : 'Verification in progress'}</p>
          </div>
          {verifiedServices.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-line py-4">
              {verifiedServices.map((s) => <span key={s.code} className="chip bg-sunken text-ink-700"><BadgeCheck size={13} className="text-green-700" /> {s.name}</span>)}
            </div>
          )}
          {worker?.memberSince && <p className="border-t border-line py-3.5 text-[13px] text-ink-500">On ZappyOne since {since(worker.memberSince)}</p>}
        </section>

        <section className="px-4 py-5">
          <h2 className="text-[17px] font-semibold text-ink-900">Customer reviews</h2>
          {ratingCount > 0 && breakdown && (
            <div className="mt-4 flex items-start gap-6 border-b border-line pb-6">
              <div className="shrink-0 text-right">
                <p className="text-[44px] font-medium leading-none tabular-nums text-green-700">{Number(rating).toFixed(2)}</p>
                <div className="mt-2 space-y-1 text-[13px] text-ink-500">
                  {levels.map(([n, label]) => <p key={n} className="h-[18px] tabular-nums">{label} ({breakdown[n] || 0})</p>)}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <span className="flex gap-0.5 text-green-700" aria-label={`${Number(rating).toFixed(1)} out of 5`}>
                  {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={20} className={n <= Math.round(rating) ? 'fill-current' : 'text-line-strong'} />)}
                </span>
                <p className="text-[13px] text-ink-500">{ratingCount} rating{ratingCount === 1 ? '' : 's'}</p>
                <div className="mt-2 space-y-1">
                  {levels.map(([n, , color]) => (
                    <div key={n} className="flex h-[18px] items-center">
                      <span className={`block h-2 rounded-full ${color}`} style={{ width: `${Math.max(3, ((breakdown[n] || 0) / ratingCount) * 100)}%` }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {reviews.length ? (
            <>
              <h3 className="mt-5 text-[16px] font-semibold text-ink-900">Most helpful reviews</h3>
              <ul className="mt-2 divide-y divide-line">
                {reviews.map((r, i) => (
                  <li key={r.id || i} className="flex gap-3.5 py-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-ink-400"><UserRound size={22} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[15px] text-ink-900">{r.by || 'Customer'}</p>
                          <p className="text-[13px] text-ink-500">{ago(r.at)}{r.service ? <span className="capitalize">, {r.service}</span> : null}</p>
                        </div>
                        <span className="flex items-center gap-0.5 text-[15px] tabular-nums text-green-700"><Star size={15} className="fill-current" />{r.rating}</span>
                      </div>
                      {r.text && <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-ink-500">{r.text}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-4 flex items-center gap-3 text-[14px] text-ink-500">
              <MessageSquareQuote size={18} className="shrink-0" /> No written reviews yet. They appear here after customers rate a finished job.
            </p>
          )}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-4 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
        <div className="mx-auto max-w-2xl">
          <button type="button" onClick={rebook} className="btn-primary w-full">
            {bookablePath ? 'Book again' : 'See services'}
          </button>
        </div>
      </div>
    </div>
  );
}
