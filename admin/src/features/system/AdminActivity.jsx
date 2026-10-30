import { useState } from 'react';
import { X } from 'lucide-react';
import { useAdminAuditLogsQuery } from '@shared/services/api';
import { Th, Td, EmptyState, PageLoader, Pagination, fmtDate } from '../../ui/kit';

const PORTAL = { fleet: 'Fleet portal', admin: 'Admin' };

// Everything one admin has done and every sign-in, newest first, across admin and the Fleet portal.
export default function AdminActivity({ admin, onClose }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useAdminAuditLogsQuery({ actorId: admin.id, page });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`Activity of ${admin.name}`} onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900">{admin.name}</h3>
            <p className="truncate text-[12px] text-slate-500">{admin.email}{data?.total != null ? `, ${data.total} entries` : ''}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        {isFetching && <div className="h-1 animate-pulse bg-blue-600" />}
        <div className="flex-1 overflow-auto">
          {isLoading ? <PageLoader /> : !data?.logs?.length ? <EmptyState message="No activity yet." /> : (
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="border-b border-slate-100"><Th>When</Th><Th>What</Th><Th>Where</Th></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {data.logs.map((l) => (
                  <tr key={l._id}>
                    <Td muted><span className="whitespace-nowrap">{fmtDate(l.at)}</span></Td>
                    <Td><span className="text-xs font-semibold capitalize text-slate-800">{l.action?.replace(/[._]/g, ' ')}</span></Td>
                    <Td muted><span className="text-xs">{PORTAL[l.portal] || l.portal || '-'}</span><span className="block text-[11px] text-slate-400">{l.ip || ''}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {data?.total > 50 && <div className="border-t border-slate-100 px-5 py-2"><Pagination page={page} total={data.total} onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => p + 1)} /></div>}
      </div>
    </div>
  );
}
