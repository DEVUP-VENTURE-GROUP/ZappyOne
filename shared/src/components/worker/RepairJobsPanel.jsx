import { useNavigate } from 'react-router-dom';
import { Smartphone, ChevronRight, AlertTriangle, Settings, Loader2, Store } from 'lucide-react';
import { useRepairOnboardingStatusQuery, useRepairProviderJobsQuery } from '../../services/api';
import { PORTAL_URLS } from '../../config/portals';

/**
 * Phone-repair jobs + setup entry point on the worker dashboard.
 *
 * This panel exists because the repair vertical was previously unreachable: the
 * routes worked, but nothing on the dashboard linked to them, so a technician
 * had no way to set themselves up or see a repair job they had been assigned.
 *
 * It leads with the BLOCKER when setup is incomplete, because "why am I not
 * getting jobs?" is the question a half-onboarded provider is actually asking,
 * and a list of zero jobs does not answer it.
 */

const STATUS_LABEL = {
  PROVIDER_ASSIGNED: { text: 'New — accept it', tone: 'bg-amber-100 text-amber-700' },
  WORKER_ACCEPTED: { text: 'Accepted', tone: 'bg-blue-100 text-blue-700' },
  ON_THE_WAY: { text: 'On the way', tone: 'bg-zappy-100 text-zappy-700' },
  ARRIVED: { text: 'Arrived', tone: 'bg-zappy-100 text-zappy-700' },
  DIAGNOSING: { text: 'Diagnosing', tone: 'bg-amber-100 text-amber-700' },
  CUSTOMER_APPROVAL_PENDING: { text: 'Awaiting customer', tone: 'bg-amber-100 text-amber-700' },
  APPROVED: { text: 'Approved — start work', tone: 'bg-emerald-100 text-emerald-700' },
  REPAIR_IN_PROGRESS: { text: 'In progress', tone: 'bg-zappy-100 text-zappy-700' },
  QA_PENDING: { text: 'QA checks', tone: 'bg-amber-100 text-amber-700' },
  PICKUP_SCHEDULED: { text: 'Pickup due', tone: 'bg-zappy-100 text-zappy-700' },
  AT_WORKSHOP: { text: 'At workshop', tone: 'bg-zappy-100 text-zappy-700' },
  READY_FOR_RETURN: { text: 'Ready to return', tone: 'bg-emerald-100 text-emerald-700' },
  OUT_FOR_RETURN: { text: 'Out for return', tone: 'bg-zappy-100 text-zappy-700' },
};

export default function RepairJobsPanel() {
  const nav = useNavigate();
  const { data: onboarding, isLoading: loadingSetup } = useRepairOnboardingStatusQuery();
  const { data: jobsData, isLoading: loadingJobs } = useRepairProviderJobsQuery({ active: 'true' });

  const jobs = jobsData?.bookings || [];
  const setupComplete = onboarding?.complete;
  const firstBlocker = (onboarding?.steps || []).find((s) => !s.done);
  const pending = onboarding?.pending || {};

  // Nothing configured at all — this provider has not opted into repair work,
  // so pitch it rather than showing an empty jobs list.
  const neverStarted = !loadingSetup && (onboarding?.steps || []).every((s) => !s.done);

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-100 p-4" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-xl bg-zappy-50 flex items-center justify-center">
          <Smartphone size={15} className="text-zappy-600" strokeWidth={2} />
        </div>
        <p className="font-bold text-[#0F172A] text-sm flex-1">Phone Repair</p>
        <button onClick={() => nav('/worker/repair/setup')}
          className="flex items-center gap-1 text-[12px] font-bold text-zappy-600 hover:underline">
          <Settings size={12} /> Setup
        </button>
      </div>

      {loadingSetup ? (
        <div className="py-6 flex justify-center"><Loader2 size={18} className="animate-spin text-zappy-400" /></div>
      ) : neverStarted ? (
        <button onClick={() => nav('/worker/repair/setup')}
          className="w-full text-left rounded-xl p-3" style={{ background: 'linear-gradient(135deg,#EFF6FF,#DBEAFE)' }}>
          <p className="text-sm font-bold text-[#0F172A]">Start taking phone repair jobs</p>
          <p className="text-xs text-slate-600 mt-0.5">
            Add the repairs you can do, your area and your prices — takes a few minutes.
          </p>
        </button>
      ) : !setupComplete ? (
        <button onClick={() => nav('/worker/repair/setup')}
          className="w-full flex items-start gap-2.5 rounded-xl bg-amber-50 p-3 text-left">
          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-900">Setup incomplete</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {firstBlocker ? firstBlocker.label : 'Finish your setup to start receiving jobs.'}
            </p>
          </div>
          <ChevronRight size={15} className="text-amber-500 shrink-0 mt-0.5" />
        </button>
      ) : jobs.length === 0 ? (
        <div className="py-4 text-center">
          <p className="text-sm font-semibold text-slate-600">No active repair jobs</p>
          <p className="text-xs text-slate-400 mt-0.5">You are set up and visible to customers.</p>
        </div>
      ) : null}

      {(pending.skillVerifications > 0 || pending.priceApprovals > 0) && (
        <p className="text-[11px] text-slate-500 mt-2">
          {pending.skillVerifications > 0 && `${pending.skillVerifications} skill claim(s) awaiting verification. `}
          {pending.priceApprovals > 0 && `${pending.priceApprovals} price(s) awaiting approval.`}
        </p>
      )}

      {!loadingJobs && jobs.length > 0 && (
        <div className="space-y-2 mt-1">
          {jobs.slice(0, 4).map((b) => {
            const meta = STATUS_LABEL[b.status] || { text: b.status.replace(/_/g, ' ').toLowerCase(), tone: 'bg-slate-100 text-slate-600' };
            return (
              <button key={b._id} onClick={() => nav(`/worker/repair/${b._id}`)}
                className="w-full flex items-center gap-3 rounded-xl ring-1 ring-slate-100 p-2.5 text-left hover:ring-zappy-200 transition">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#0F172A] truncate">
                    {b.brandCode} {b.modelCode}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {b.repairCode ? b.repairCode.replace(/_/g, ' ') : 'Inspection'} · {b.reference}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${meta.tone}`}>
                  {meta.text}
                </span>
                <ChevronRight size={14} className="text-slate-300 shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {/*
        * Shop features live on a different account, and saying so is the whole
        * point of this card.
        *
        * A worker login is one independent technician: no opening hours, no
        * team, nobody to hand a job to. Opening hours, adding technicians and
        * assigning jobs to them belong to a SHOP account, which signs in
        * separately. Someone who owns a shop but signed up here saw none of it
        * and had nothing on screen explaining why — they just assumed the
        * features were missing.
        */}
      <button
        onClick={() => window.location.assign(`${PORTAL_URLS.servicepro}/shop/login`)}
        className="mt-3 flex w-full items-start gap-2.5 rounded-xl border border-dashed border-slate-200 p-3 text-left transition hover:border-zappy-300 hover:bg-zappy-50/40"
      >
        <Store size={15} className="mt-0.5 shrink-0 text-zappy-500" />
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-bold text-[#0F172A]">Run a shop with technicians?</span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
            Opening hours, your team and assigning jobs to them live on a shop
            account. Sign in as a shop to set that up.
          </span>
        </span>
        <ChevronRight size={14} className="mt-0.5 shrink-0 text-slate-300" />
      </button>
    </div>
  );
}
