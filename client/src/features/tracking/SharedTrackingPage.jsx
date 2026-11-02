import { useParams } from 'react-router-dom';
import { Clock, Link2Off, Loader2, MapPin } from 'lucide-react';
import { useGetSharedJobQuery } from '@shared/services/api';
import { KINDS } from '@shared/customer/jobKinds';
import { ZappyWordmark } from '@shared/components/common/ZappyLogo';
import StartCodeCard from './StartCodeCard';
import { ActivityFeed, Row, Section, StatusBlock, WorkerRichCard, feedCopy, firstNameOf } from './redesign';

// The code is read out at the door, except for a pet the owner brings to the pro.
const codeOf = (kind, data) => (kind === 'pet'
  ? (data.booking?.serviceMode !== 'provider_location' ? data.booking?.handoverOtp : null)
  : data.task?.handoverOtp || null);

// What the person at the door sees from a shared link (jobs/share): the live job, the pro and the start code; no money, no account.
export default function SharedTrackingPage() {
  const { token } = useParams();
  const { data, error, isLoading } = useGetSharedJobQuery(token, { pollingInterval: 20000 });

  if (isLoading) return <div className="grid min-h-screen place-items-center bg-white"><Loader2 className="animate-spin text-ink-300" /></div>;
  if (error || !data?.kind || !KINDS[data.kind]) {
    return (
      <div className="grid min-h-screen place-items-center bg-white px-6 text-center">
        <div>
          <Link2Off size={36} className="mx-auto text-ink-300" />
          <h1 className="mt-4 text-[20px] font-extrabold text-ink-900">This link has ended</h1>
          <p className="mt-1 text-[14px] text-ink-500">The booking is over, or the person who shared it turned the link off.</p>
        </div>
      </div>
    );
  }

  const job = KINDS[data.kind].toJob(data.data);
  const fn = firstNameOf(job.provider?.name);
  const events = job.history
    .map((h) => ({ status: h.stage, at: h.at, text: feedCopy(h.stage, fn, job.noun) }))
    .filter((e) => e.text)
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  const when = job.scheduledAt || job.createdAt;

  return (
    <div className="min-h-screen bg-sunken">
      <div className="mx-auto min-h-screen w-full max-w-2xl bg-white pb-10">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <ZappyWordmark size={22} />
          <span className="text-[12px] font-semibold text-ink-500">Shared with you</span>
        </header>
        <p className="px-4 pt-4 text-[13px] font-semibold capitalize text-ink-500 sm:px-6">{job.service}</p>
        <StatusBlock job={job} status={job.status} eta={null}>
          <StartCodeCard jobKey={`shared:${token}`} code={codeOf(data.kind, data.data)} stage={job.status} noun={job.noun} />
        </StatusBlock>
        {job.provider && !job.terminal && (
          <WorkerRichCard job={job} onCall={job.provider.phone ? () => { window.location.href = `tel:${job.provider.phone}`; } : undefined} />
        )}
        {!job.terminal && <ActivityFeed events={events} live />}
        <Section title="Where and when">
          <div className="divide-y divide-line">
            {when && <Row Icon={Clock} title={new Date(when).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} />}
            {job.place?.address && <Row Icon={MapPin} title={job.place.address} />}
          </div>
        </Section>
        <p className="px-4 pt-2 text-center text-[12px] text-ink-400">This link stops working when the job ends.</p>
      </div>
    </div>
  );
}
