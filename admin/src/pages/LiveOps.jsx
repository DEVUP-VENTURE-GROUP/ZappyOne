import { useState } from 'react';
import { useAdminLiveOpsQuery } from '@shared/services/api';
import { SectionHeader, Card, PageLoader, StatusBadge } from './_shared';
import { MapPin, Users, ShoppingBag, Clock, RefreshCw, Search, Wrench, Navigation } from 'lucide-react';

const STATUS_ICON = {
  searching:   { Icon: Search,    color: 'text-amber-500',  bg: 'bg-amber-50' },
  assigned:    { Icon: Users,     color: 'text-blue-500',   bg: 'bg-blue-50' },
  on_the_way:  { Icon: Navigation,color: 'text-violet-500', bg: 'bg-violet-50' },
  arrived:     { Icon: MapPin,    color: 'text-indigo-500', bg: 'bg-indigo-50' },
  in_progress: { Icon: Wrench,    color: 'text-emerald-500',bg: 'bg-emerald-50' },
};

function msAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function StatPill({ label, value, color = 'text-slate-900', bg = 'bg-slate-50 border-slate-100' }) {
  return (
    <div className={`rounded-xl border p-4 text-center ${bg}`}>
      <p className={`text-2xl font-extrabold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-slate-400 font-semibold mt-0.5">{label}</p>
    </div>
  );
}

export default function LiveOps() {
  const [pollInterval, setPollInterval] = useState(10000);
  const { data, isLoading, isFetching, refetch } = useAdminLiveOpsQuery(undefined, {
    pollingInterval: pollInterval,
  });

  if (isLoading) return <PageLoader />;

  const orders  = data?.activeOrders || [];
  const workers = data?.workerLocations || [];
  const counts  = data?.counts || {};
  const byStatus = counts.byStatus || {};

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Live Operations"
        subtitle={data?.checkedAt ? `Last refresh: ${new Date(data.checkedAt).toLocaleTimeString('en-IN')}` : undefined}
      >
        <div className="flex items-center gap-2">
          <select
            value={pollInterval}
            onChange={e => setPollInterval(Number(e.target.value))}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 outline-none"
          >
            <option value={5000}>5s</option>
            <option value={10000}>10s</option>
            <option value={30000}>30s</option>
            <option value={0}>Manual</option>
          </select>
          <button onClick={refetch} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700 transition">
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </SectionHeader>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatPill label="Active Orders"    value={counts.total || 0}         bg="bg-blue-50 border-blue-100" color="text-blue-700" />
        <StatPill label="Online Workers"   value={counts.onlineWorkers || 0} bg="bg-emerald-50 border-emerald-100" color="text-emerald-700" />
        <StatPill label="Searching"        value={byStatus.searching || 0}   bg="bg-amber-50 border-amber-100"   color="text-amber-700" />
        <StatPill label="Assigned"         value={byStatus.assigned || 0}    bg="bg-violet-50 border-violet-100" color="text-violet-700" />
        <StatPill label="On the Way"       value={byStatus.on_the_way || 0}  bg="bg-indigo-50 border-indigo-100" color="text-indigo-700" />
        <StatPill label="In Progress"      value={byStatus.in_progress || 0} bg="bg-green-50 border-green-100"  color="text-green-700" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Active Orders List */}
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <ShoppingBag size={15} className="text-slate-500" />
            <p className="text-sm font-bold text-slate-700">Active Orders ({orders.length})</p>
          </div>
          {orders.length === 0 ? (
            <div className="p-8 text-center">
              <ShoppingBag size={24} className="text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No active orders right now</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
              {orders.map(o => {
                const meta = STATUS_ICON[o.status] || STATUS_ICON.searching;
                const Icon = meta.Icon;
                return (
                  <div key={o._id} className="flex items-center gap-3 px-5 py-3">
                    <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
                      <Icon size={14} className={meta.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold text-slate-800 capitalize">{o.service?.replace(/_/g, ' ')}</p>
                        <StatusBadge status={o.status} />
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                        <Clock size={10} /> {msAgo(o.createdAt)}
                        {!o.hasWorker && o.status !== 'searching' && (
                          <span className="text-amber-600 font-semibold ml-1">· no worker</span>
                        )}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">{String(o._id).slice(-6)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Online Workers */}
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <Users size={15} className="text-slate-500" />
            <p className="text-sm font-bold text-slate-700">Online Workers ({workers.length})</p>
          </div>
          {workers.length === 0 ? (
            <div className="p-8 text-center">
              <Users size={24} className="text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No workers online</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
              {workers.map(w => (
                <div key={w.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                    <MapPin size={14} className="text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-slate-500">{String(w.id).slice(-8)}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {w.lat?.toFixed(4)}, {w.lng?.toFixed(4)}
                    </p>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
              ))}
            </div>
          )}

          {/* Simple dot-grid visualization */}
          {workers.length > 0 && (
            <div className="px-5 py-4 border-t border-slate-50">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Worker Distribution</p>
              <div className="flex flex-wrap gap-1.5">
                {workers.slice(0, 60).map(w => (
                  <div
                    key={w.id}
                    className="w-2.5 h-2.5 rounded-full bg-emerald-400 opacity-80"
                    title={`${w.lat?.toFixed(3)}, ${w.lng?.toFixed(3)}`}
                  />
                ))}
                {workers.length > 60 && (
                  <span className="text-[10px] text-slate-400 self-center">+{workers.length - 60} more</span>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
