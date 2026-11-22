import { CheckCircle2, CircleAlert, CircleSlash, RefreshCw } from 'lucide-react';
import { useAdminIntegrationsQuery } from '@shared/services/api';
import { SectionHeader, Card, ErrorState, PageSkeleton } from '../../ui/kit';

const STATE = {
  ok: { Icon: CheckCircle2, tone: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-700', label: 'Working' },
  failing: { Icon: CircleAlert, tone: 'text-rose-600', badge: 'bg-rose-50 text-rose-700', label: 'Not working' },
  missing: { Icon: CircleSlash, tone: 'text-amber-600', badge: 'bg-amber-50 text-amber-800', label: 'Not set up' },
};

// Push, email and maps, each checked with one live call on the server (admin/lib/integrations); nothing reaches a customer.
export default function Integrations() {
  const { data, isLoading, isError, refetch, isFetching } = useAdminIntegrationsQuery(undefined, { refetchOnMountOrArgChange: true });
  return (
    <div className="space-y-4">
      <SectionHeader title="Integrations" subtitle="Push notifications, email and maps, each tested live just now.">
        <button type="button" onClick={refetch} disabled={isFetching}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Check again
        </button>
      </SectionHeader>

      {isLoading ? <PageSkeleton rows={5} /> : isError ? <ErrorState onRetry={refetch} /> : (
        <>
          <Card>
            <p className="text-sm text-slate-700">Arrival times, traffic and surge use <span className="font-semibold">{data.etaSource}</span> right now.</p>
          </Card>
          <div className="space-y-3">
            {data.services.map((s) => {
              const st = STATE[s.state] || STATE.failing;
              return (
                <Card key={s.key}>
                  <div className="flex items-start gap-3">
                    <st.Icon size={18} className={`mt-0.5 shrink-0 ${st.tone}`} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{s.label}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${st.badge}`}>{st.label}</span>
                      </div>
                      <p className="text-xs text-slate-500">{s.purpose}</p>
                      <p className="text-sm text-slate-700">{s.detail}</p>
                      {s.fix && <p className="text-sm text-slate-900"><span className="font-semibold">To fix: </span>{s.fix}</p>}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          <p className="text-xs text-slate-400">Checked {new Date(data.checkedAt).toLocaleString('en-IN')}.</p>
        </>
      )}
    </div>
  );
}
