import { useNavigate } from 'react-router-dom';
import { ChevronRight, Wrench, Clock, Check, AlertTriangle, Ban } from 'lucide-react';
import { useProviderOnboardingStatusQuery } from '../../services/api';

/**
 * Where this provider stands, on their own dashboard.
 *
 * A worker's first question every morning is "why am I not getting jobs?", and
 * for a new provider the answer is almost always this card: nothing chosen, or
 * documents still under review. Saying so here — with the next action attached
 * — is the difference between a provider who finishes onboarding and one who
 * assumes the app is broken.
 *
 * Used by both dashboards. A shop owner and an independent technician are at
 * different points in the same process, so they get the same component rather
 * than two that drift apart.
 */

const TONE = {
  none: 'bg-slate-100 text-slate-600',
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  attention: 'bg-red-50 text-red-700',
};

const STATUS_CHIP = {
  draft: { label: 'Not submitted', tone: 'none', Icon: AlertTriangle },
  pending_review: { label: 'Under review', tone: 'pending', Icon: Clock },
  approved: { label: 'Approved', tone: 'approved', Icon: Check },
  rejected: { label: 'Needs changes', tone: 'attention', Icon: AlertTriangle },
  suspended: { label: 'Paused', tone: 'attention', Icon: Ban },
};

export default function ProviderServicesCard({ className = '' }) {
  const nav = useNavigate();
  const { data, isLoading } = useProviderOnboardingStatusQuery();

  if (isLoading) {
    return <div className={`h-[76px] animate-pulse rounded-2xl bg-slate-100 ${className}`} />;
  }

  const enrolments = data?.enrolments || [];
  const next = data?.nextStep;
  const approved = enrolments.filter((e) => e.status === 'approved');

  // The headline is whichever fact the provider most needs to act on.
  const headline = !enrolments.length
    ? { title: 'Choose what you work on', body: 'Pick your services to start receiving jobs.', tone: 'none' }
    : next?.code === 'AWAITING_REVIEW'
      ? { title: "We're reviewing your documents", body: 'Usually within a day — we\'ll notify you.', tone: 'pending' }
      : next?.code === 'FIX_REJECTED'
        ? { title: 'Verification needs changes', body: next.label, tone: 'attention' }
        : next?.code === 'COMPLETE_VERIFICATION'
          ? { title: 'Finish your verification', body: next.label, tone: 'pending' }
          : {
            title: approved.length === 1
              ? `Approved for ${approved[0].line?.name || approved[0].lineCode}`
              : `Approved for ${approved.length} services`,
            body: 'Tap to add another service or update your details.',
            tone: 'approved',
          };

  return (
    <button
      onClick={() => nav('/provider/onboarding')}
      className={`flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-indigo-200 ${className}`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONE[headline.tone]}`}>
        <Wrench size={17} strokeWidth={2} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold text-[#0F172A]">{headline.title}</span>
        <span className="mt-0.5 block text-[11.5px] font-medium leading-relaxed text-slate-500">
          {headline.body}
        </span>

        {enrolments.length > 0 && (
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {enrolments.slice(0, 4).map((e) => {
              const chip = STATUS_CHIP[e.status];
              if (!chip) return null;
              const { Icon } = chip;
              return (
                <span
                  key={e._id}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${TONE[chip.tone]}`}
                >
                  <Icon size={10} />
                  {e.line?.name || e.lineCode}
                </span>
              );
            })}
          </span>
        )}
      </span>

      <ChevronRight size={18} className="shrink-0 text-slate-400" />
    </button>
  );
}
