import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, Check, X, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetHelpingTaskQuery, useRespondHelpingApprovalMutation, useCancelHelpingTaskMutation, useRateHelpingTaskMutation,
} from '@shared/services/api';
import { formatPaise } from '@shared/utils/money';
import { PayNowButton } from '@shared/components/common/PayMethodPicker';
import JobTrackingPage from '../../tracking/JobTrackingPage';
import { KINDS } from '../../tracking/kinds';
import { useJobSOS } from '../../tracking/useJobSOS';

/**
 * A helping task, tracked live on the shared page (tracking/JobTrackingPage).
 *
 * Helping-specific here: decisions the helper needs from the customer, the
 * items and what each cost, a return's refund status, and the item money —
 * always shown apart from the service fee, never combined into one number.
 */

const STATUS_LABEL = {
  DRAFT: 'Draft', REQUESTED: 'Requested', PAYMENT_PENDING: 'Payment pending', CONFIRMED: 'Confirmed',
  WORKER_SEARCHING: 'Finding a helper', WORKER_ASSIGNED: 'Helper assigned', WORKER_ACCEPTED: 'Helper confirmed',
  EN_ROUTE: 'Helper on the way', ARRIVED: 'Helper arrived', TASK_STARTED: 'Started', IN_PROGRESS: 'In progress',
  APPROVAL_REQUIRED: 'Your decision needed', RETURNING: 'On the way back', AT_DROPOFF: 'At the drop-off',
  HANDED_OVER: 'Handed over', COMPLETED: 'Completed', CUSTOMER_CONFIRMED: 'Completed', SETTLED: 'Completed',
  CANCELLED: 'Cancelled', FAILED: 'Could not be completed', ITEM_UNAVAILABLE: 'Item unavailable',
  MERCHANT_REJECTED: 'Merchant did not accept it', EXCHANGE_UNAVAILABLE: 'Replacement unavailable', DISPUTED: 'Under review',
};
const ITEM_LABEL = {
  requested: 'Requested', found: 'Found', not_found: 'Not found', out_of_stock: 'Out of stock',
  alternative_proposed: 'Alternative proposed', awaiting_approval: 'Waiting on you',
  approved: 'Approved', rejected: 'Declined', purchased: 'Purchased', skipped: 'Skipped',
};
const REFUND = {
  unknown: ['Not yet handed over', 'bg-slate-100 text-slate-600'],
  not_applicable: ['Not applicable', 'bg-slate-100 text-slate-600'],
  pending_merchant: ['Handed over, waiting on the merchant', 'bg-amber-100 text-amber-800'],
  refund_confirmed: ['Merchant confirmed the refund', 'bg-emerald-100 text-emerald-800'],
  refund_failed: ['Merchant did not process this', 'bg-red-100 text-red-700'],
};
const card = 'rounded-[24px] bg-white p-[18px] ring-1 ring-slate-100';

/** When the customer's code is due: collecting a return at their door, or receiving the shopping. */
function codeStageFor(t) {
  if (['return', 'exchange'].includes(t.serviceType)) return null; // the normal arrival moment
  if (['RETURNING', 'AT_DROPOFF'].includes(t.status)) return 'arrived';
  if (['WORKER_ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'TASK_STARTED', 'IN_PROGRESS', 'APPROVAL_REQUIRED'].includes(t.status)) return 'on_the_way';
  return 'done';
}

export default function HelpingTaskDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, isLoading, refetch } = useGetHelpingTaskQuery(id, { pollingInterval: 30000 });
  const [respond] = useRespondHelpingApprovalMutation();
  const [cancel] = useCancelHelpingTaskMutation();
  const [rate] = useRateHelpingTaskMutation();
  const sos = useJobSOS(id);

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 size={24} className="animate-spin text-zappy-500" /></div>;
  if (!data?.task) return <p className="py-24 text-center text-slate-500">Task not found</p>;

  const { task } = data;
  const job = KINDS.helping.toJob(data, { statusLabel: STATUS_LABEL[task.status] });
  const due = data.due || { totalPaise: 0, itemsPaise: 0, itemsPending: false };
  const closed = ['CANCELLED', 'FAILED', 'SETTLED'].includes(task.status);
  const pending = (task.approvals || []).filter((a) => a.status === 'pending');

  async function answer(approvalId, approved) {
    try {
      await respond({ id: task._id, approvalId, approved }).unwrap();
      toast.success(approved ? 'Approved' : 'Declined');
      refetch();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not send your answer');
    }
  }

  const extras = (
    <>
      {pending.map((a) => (
        <div key={a._id} className="space-y-3 rounded-card border-2 border-amber-300 bg-amber-50 p-4">
          <p className="flex items-start gap-2 text-sm font-bold text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" /> {a.reason || 'Your helper needs a decision'}</p>
          <div className="flex items-center justify-between rounded-xl bg-white p-3 text-sm">
            <span className="text-slate-500">Was</span><span className="font-bold">{formatPaise(a.previousAmountPaise)}</span>
            <span className="text-slate-300">→</span>
            <span className="text-slate-500">Now</span><span className="font-bold text-amber-700">{formatPaise(a.newAmountPaise)}</span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => answer(a._id, false)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-slate-200 bg-white py-2.5 font-bold"><X size={15} /> Decline</button>
            <button type="button" onClick={() => answer(a._id, true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-600 py-2.5 font-bold text-white"><Check size={15} /> Approve</button>
          </div>
        </div>
      ))}

      {(task.items || []).length > 0 && (
        <div className={card}>
          <p className="mb-2 text-[15px] font-bold text-navy">Items</p>
          {task.items.map((it) => (
            <div key={it._id} className="flex items-center justify-between border-b border-slate-50 py-2 text-sm last:border-0">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-navy">{it.name} × {it.quantity}</span>
                <span className="block text-xs text-slate-500">{ITEM_LABEL[it.status] || it.status}</span>
              </span>
              <span className="ml-2 shrink-0 font-semibold tabular-nums text-navy">
                {it.actualPricePaise != null ? formatPaise(it.actualPricePaise) : `up to ${formatPaise(it.maxApprovedPricePaise)}`}
              </span>
            </div>
          ))}
          {due.itemsPending && <p className="mt-2 text-xs text-slate-500">You repay what the helper spends, against the receipt, at delivery.</p>}
        </div>
      )}

      {task.returnDetail && (
        <div className={card}>
          <p className="text-[15px] font-bold text-navy">{task.returnDetail.productName}</p>
          <p className="text-sm text-slate-500">{task.returnDetail.merchantName} · Order {task.returnDetail.orderId}</p>
          {(() => { const [text, tone] = REFUND[task.returnDetail.refundStatus] || REFUND.unknown; return <span className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{text}</span>; })()}
        </div>
      )}

      {!closed && due.totalPaise > 0 && (task.paymentMethod === 'online' || due.itemsPaise > 0) && (
        <div className={card}>
          <p className="text-[15px] font-bold text-navy">Due now: {formatPaise(due.totalPaise)}</p>
          <p className="mt-0.5 text-[12.5px] text-slate-500">{due.itemsPaise > 0 ? 'Items and the service fee' : 'Service fee'}</p>
          <PayNowButton bookingSource="helping" bookingId={task._id} amountLabel={formatPaise(due.totalPaise)}
            label={due.itemsPaise > 0 ? 'Helper: items and service fee' : 'Helper service charge'} className="mt-3" />
        </div>
      )}
    </>
  );

  const codeStage = codeStageFor(task);
  return (
    <JobTrackingPage
      job={job}
      onBack={() => nav('/orders')}
      startCode={codeStage === 'done' ? null : task.handoverOtp}
      codeStage={codeStage === 'done' ? null : codeStage}
      onSOS={sos}
      cancel={data.canCancel ? {
        note: 'Cancelling before your helper starts is free. Any budget held for items comes back to you.',
        run: async () => {
          try {
            await cancel({ id: task._id, reason: 'Changed my mind' }).unwrap();
            toast.success('Task cancelled');
            refetch();
          } catch (err) {
            toast.error(err?.data?.error || 'Could not cancel');
          }
        },
      } : null}
      onRate={!task.ratedAt ? async (rating) => {
        try { await rate({ id: task._id, rating }).unwrap(); toast.success('Thanks for the feedback'); refetch(); }
        catch (err) { toast.error(err?.data?.error || 'Could not save your rating'); }
      } : undefined}
      extras={extras}
    />
  );
}
