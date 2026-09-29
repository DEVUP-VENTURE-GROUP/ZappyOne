import { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, RefreshCw, CheckCircle2, X, Search, IndianRupee, Undo2, XCircle } from 'lucide-react';
import {
  useAdminPaymentsQuery, useAdminPaymentsSummaryQuery,
  useAdminRetryRefundMutation, useAdminMarkRefundedMutation, useAdminReconcilePaymentMutation,
} from '@shared/services/api';
import { SectionHeader, Card, StatCard, StatusBadge, Th, Td, EmptyState, Pagination, PageLoader, fmt, fmtDate } from '../../ui/kit';

const STATUSES = ['', 'captured', 'created', 'failed', 'refunded', 'expired'];
const SOURCES = ['', 'repair', 'pet', 'helping'];
const PURPOSE_LABEL = {
  booking_payment: 'Booking', repair_payment: 'Booking', order_payment: 'Rakshak order',
  wallet_topup: 'Wallet top-up', subscription: 'Plan', event_advance_payment: 'Event advance', event_remaining_payment: 'Event balance',
};

/** What a payment is for, in words an ops person recognises. */
function forLabel(p) {
  const what = PURPOSE_LABEL[p.purpose] || p.purpose;
  return p.bookingSource ? `${what} · ${p.bookingSource}${p.bookingReference ? ` ${p.bookingReference}` : ''}` : what;
}

/**
 * Money → Payments.
 *
 *   Summary      what came in, what went back, what failed
 *   Needs action refunds the gateway refused + payments whose effects failed
 *   All          every payment, filterable
 */
export default function Payments() {
  const [filters, setFilters] = useState({ status: '', source: '', q: '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [refundTarget, setRefundTarget] = useState(null);
  const [reference, setReference] = useState('');

  const { data: summary } = useAdminPaymentsSummaryQuery(7, { pollingInterval: 60000 });
  const { data: actionData, isLoading: loadingAction } = useAdminPaymentsQuery({ needsAction: true }, { pollingInterval: 30000 });
  const params = Object.fromEntries(Object.entries({ ...filters, page }).filter(([, v]) => v !== '' && v != null));
  const { data, isFetching } = useAdminPaymentsQuery(params);

  const [retry, { isLoading: retrying }] = useAdminRetryRefundMutation();
  const [markRefunded, { isLoading: marking }] = useAdminMarkRefundedMutation();
  const [reconcile, { isLoading: reconciling }] = useAdminReconcilePaymentMutation();

  const setFilter = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

  async function doRetry(p) {
    try {
      const out = await retry(p.cfOrderId).unwrap();
      if (out.refunded) toast.success('Refund sent to the gateway');
      else toast.error('The gateway refused again — refund by bank transfer and record it');
    } catch (err) { toast.error(err?.data?.error || 'Retry failed'); }
  }

  async function doMarkRefunded() {
    try {
      await markRefunded({ cfOrderId: refundTarget.cfOrderId, reference: reference.trim() }).unwrap();
      toast.success('Refund recorded');
      setRefundTarget(null);
      setReference('');
    } catch (err) { toast.error(err?.data?.error || 'Could not record the refund'); }
  }

  async function doReconcile(p) {
    const notes = window.prompt('What was done to fix this payment? (kept in the audit log)');
    if (notes === null) return;
    try {
      await reconcile({ cfOrderId: p.cfOrderId, notes }).unwrap();
      toast.success('Marked as fixed');
    } catch (err) { toast.error(err?.data?.error || 'Could not update'); }
  }

  const needsAction = actionData?.items || [];

  return (
    <div className="space-y-6">
      <SectionHeader title="Payments" subtitle="Online payments through Cashfree, last 7 days" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard Icon={IndianRupee} label="Collected" value={fmt(summary?.collectedPaise || 0)} sub={`${summary?.collectedCount || 0} payments`} />
        <StatCard Icon={Undo2} label="Refunded" value={fmt(summary?.refundedPaise || 0)} sub={`${summary?.refundsInFlight || 0} in progress`} color="text-violet-600" bg="bg-violet-50" />
        <StatCard Icon={XCircle} label="Failed payments" value={summary?.failedCount ?? 0} color="text-amber-600" bg="bg-amber-50" />
        <StatCard Icon={AlertTriangle} label="Needs action" value={summary?.needsActionCount ?? 0} color={summary?.needsActionCount ? 'text-rose-600' : 'text-emerald-600'} bg={summary?.needsActionCount ? 'bg-rose-50' : 'bg-emerald-50'} />
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={16} className={needsAction.length ? 'text-rose-500' : 'text-slate-300'} />
          <h3 className="text-sm font-bold text-slate-800">Needs action</h3>
          <span className="text-xs text-slate-400">{needsAction.length}</span>
        </div>
        {loadingAction ? <PageLoader /> : needsAction.length === 0 ? (
          <p className="text-sm text-slate-400 py-3">Nothing waiting. Refunds and payments are all settled.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {needsAction.map((p) => (
              <div key={p.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">
                    {fmt(p.refund?.status === 'manual_required' ? p.refund.amountPaise : p.amountPaise)} · {forLabel(p)}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {p.owner.name || 'Unknown'} {p.owner.phone ? `· ${p.owner.phone}` : ''} · {p.cfOrderId}
                  </p>
                  <p className="text-xs text-rose-600 mt-0.5">
                    {p.refund?.status === 'manual_required'
                      ? `Refund refused by the gateway${p.refund.reason ? ` — ${p.refund.reason}` : ''}`
                      : `Paid, but not applied: ${p.reconciliationReason || 'unknown error'}`}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {p.refund?.status === 'manual_required' ? (
                    <>
                      <button type="button" onClick={() => doRetry(p)} disabled={retrying}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1 disabled:opacity-50">
                        <RefreshCw size={12} /> Retry refund
                      </button>
                      <button type="button" onClick={() => { setRefundTarget(p); setReference(''); }}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800">
                        Refunded by bank
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => doReconcile(p)} disabled={reconciling}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 flex items-center gap-1 disabled:opacity-50">
                      <CheckCircle2 size={12} /> Mark fixed
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <h3 className="text-sm font-bold text-slate-800 mr-auto">All payments</h3>
          <form onSubmit={(e) => { e.preventDefault(); setFilter('q', search.trim()); }} className="flex items-center gap-1 border border-slate-200 rounded-lg px-2">
            <Search size={13} className="text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Payment / booking / customer id"
              className="text-xs py-1.5 outline-none w-52" aria-label="Search payments" />
          </form>
          <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5" aria-label="Status">
            {STATUSES.map((s) => <option key={s} value={s}>{s ? s[0].toUpperCase() + s.slice(1) : 'All statuses'}</option>)}
          </select>
          <select value={filters.source} onChange={(e) => setFilter('source', e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5" aria-label="Service">
            {SOURCES.map((s) => <option key={s} value={s}>{s ? s[0].toUpperCase() + s.slice(1) : 'All services'}</option>)}
          </select>
        </div>

        {!data?.items?.length ? (
          <EmptyState message={isFetching ? 'Loading…' : 'No payments match'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><Th>When</Th><Th>For</Th><Th>Customer</Th><Th right>Amount</Th><Th>Status</Th><Th>Refund</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <Td muted>{fmtDate(p.createdAt)}</Td>
                    <Td>{forLabel(p)}</Td>
                    <Td>{p.owner.name || '—'}{p.owner.phone ? <span className="block text-[11px] text-slate-400">{p.owner.phone}</span> : null}</Td>
                    <Td right mono>{fmt(p.amountPaise)}</Td>
                    <Td><StatusBadge status={p.status} /></Td>
                    <Td>{p.refund ? <><StatusBadge status={p.refund.status} /> <span className="text-[11px] text-slate-500">{fmt(p.refund.amountPaise)}</span></> : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data?.total > data?.pageSize && (
          <Pagination page={page} total={data.total} limit={data.pageSize} onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => p + 1)} />
        )}
      </Card>

      {refundTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Record a bank refund</h3>
              <button type="button" onClick={() => setRefundTarget(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <p className="text-sm text-slate-600">
              Send {fmt(refundTarget.refund.amountPaise)} to {refundTarget.owner.name || 'the customer'} by bank or UPI,
              then enter the transfer reference. The booking will show as refunded.
            </p>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / transfer reference"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" autoFocus />
            <button type="button" onClick={doMarkRefunded} disabled={marking || reference.trim().length < 6}
              className="w-full bg-slate-900 text-white font-bold py-2.5 rounded-xl disabled:opacity-50">
              {marking ? 'Saving…' : 'Record refund'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
