import { useState } from 'react';
import { useAdminSystemHealthQuery } from '@shared/services/api';
import { SectionHeader, Card, PageLoader } from './_shared';
import { Server, Database, Zap, HardDrive, Clock, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

function StatusDot({ ok }) {
  return ok
    ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
    : <XCircle size={16} className="text-red-500 shrink-0" />;
}

function HealthRow({ label, ok, detail }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
      <div className="flex items-center gap-2.5">
        <StatusDot ok={ok} />
        <span className="text-sm font-semibold text-slate-700">{label}</span>
      </div>
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
        {detail}
      </span>
    </div>
  );
}

function QueueCard({ name, counts = {} }) {
  const { waiting = 0, active = 0, failed = 0, delayed = 0 } = counts;
  const hasFailed = failed > 0;
  return (
    <div className={`rounded-xl border p-4 ${hasFailed ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-white'}`}>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">{name} Queue</p>
      <div className="grid grid-cols-2 gap-2">
        {[['Waiting', waiting, 'text-amber-700 bg-amber-50'], ['Active', active, 'text-blue-700 bg-blue-50'], ['Failed', failed, 'text-red-700 bg-red-50'], ['Delayed', delayed, 'text-slate-600 bg-slate-100']].map(([label, val, cls]) => (
          <div key={label} className="text-center">
            <p className={`text-lg font-extrabold ${val > 0 && label === 'Failed' ? 'text-red-600' : 'text-slate-900'}`}>{val}</p>
            <p className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full inline-block mt-0.5 ${cls}`}>{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtUptime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function SystemHealth() {
  const [pollingInterval, setPollingInterval] = useState(15000);
  const { data, isLoading, isFetching, refetch } = useAdminSystemHealthQuery(undefined, {
    pollingInterval,
  });

  if (isLoading) return <PageLoader />;

  const h = data || {};
  const overallOk = h.redis?.ok && h.mongo?.ok;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="System Health"
        subtitle={h.checkedAt ? `Last checked: ${new Date(h.checkedAt).toLocaleTimeString('en-IN')}` : undefined}
      >
        <div className="flex items-center gap-2">
          <select
            value={pollingInterval}
            onChange={e => setPollingInterval(Number(e.target.value))}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 outline-none"
          >
            <option value={5000}>Refresh: 5s</option>
            <option value={15000}>Refresh: 15s</option>
            <option value={30000}>Refresh: 30s</option>
            <option value={0}>Manual</option>
          </select>
          <button onClick={refetch} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700 transition">
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </SectionHeader>

      {/* Overall status banner */}
      <div className={`rounded-xl border px-5 py-4 flex items-center gap-3 ${overallOk ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
        {overallOk
          ? <CheckCircle2 size={22} className="text-emerald-500" />
          : <XCircle size={22} className="text-red-500" />}
        <div>
          <p className={`font-bold text-sm ${overallOk ? 'text-emerald-800' : 'text-red-800'}`}>
            {overallOk ? 'All Systems Operational' : 'System Degraded — Check Below'}
          </p>
          <p className={`text-xs mt-0.5 ${overallOk ? 'text-emerald-600' : 'text-red-600'}`}>
            Server uptime: {fmtUptime(h.uptime || 0)}
          </p>
        </div>
      </div>

      {/* Core services */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
              <Zap size={16} className="text-orange-500" />
            </div>
            <p className="text-sm font-bold text-slate-700">Infrastructure</p>
          </div>
          <HealthRow label="Redis Cache" ok={h.redis?.ok} detail={h.redis?.ok ? 'Connected' : 'Disconnected'} />
          <HealthRow label="MongoDB" ok={h.mongo?.ok} detail={h.mongo?.ok ? 'Connected' : 'Disconnected'} />
          <HealthRow label="API Server" ok detail="Running" />
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <HardDrive size={16} className="text-blue-500" />
            </div>
            <p className="text-sm font-bold text-slate-700">Memory Usage</p>
          </div>
          {h.memory && (
            <div className="space-y-2">
              {[
                ['Heap Used', h.memory.heapUsedMB, h.memory.heapTotalMB],
                ['RSS', h.memory.rssMB, null],
              ].map(([label, used, total]) => (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500 font-medium">{label}</span>
                    <span className="text-slate-700 font-semibold">{used} MB{total ? ` / ${total} MB` : ''}</span>
                  </div>
                  {total && (
                    <div className="bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all ${used / total > 0.8 ? 'bg-red-500' : used / total > 0.6 ? 'bg-amber-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.min((used / total) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                <Clock size={12} className="text-slate-400" />
                <span className="text-xs text-slate-400">Uptime: {fmtUptime(h.uptime || 0)}</span>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Queue stats */}
      <div>
        <p className="text-sm font-bold text-slate-700 mb-3">Job Queues</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <QueueCard name="Dispatch"      counts={h.queues?.dispatch} />
          <QueueCard name="Notifications" counts={h.queues?.notifications} />
          <QueueCard name="Payments"      counts={h.queues?.payments} />
        </div>
        {Object.values(h.queues || {}).some(q => (q?.failed || 0) > 0) && (
          <p className="text-xs text-red-600 mt-2 font-medium">
            Failed jobs detected — investigate BullMQ dashboard or server logs.
          </p>
        )}
      </div>
    </div>
  );
}
