import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Check, X, MapPin, Star, AlertTriangle, Image as ImageIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetHelpingTaskQuery, useRespondHelpingApprovalMutation,
  useCancelHelpingTaskMutation, useRateHelpingTaskMutation,
} from '@shared/services/api';
import { formatPaise } from '@shared/utils/money';
import { PayNowButton } from '@shared/components/common/PayMethodPicker';
import LiveJobCard from '../../components/tracking/LiveJobCard';

/**
 * Customer tracking (§42) and the approval engine's customer half (§36, §6).
 *
 * Two numbers, always: the service fee and the item money, never combined —
 * `authorisation` from the server is what this screen renders, not a total it
 * computes itself.
 */
const WITH_HELPER = ['WORKER_ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'TASK_STARTED', 'IN_PROGRESS', 'APPROVAL_REQUIRED',
  'ITEM_UNAVAILABLE', 'RETURNING', 'AT_DROPOFF', 'HANDED_OVER', 'MERCHANT_REJECTED', 'EXCHANGE_UNAVAILABLE'];
const DOING_IT = WITH_HELPER.slice(3);
const OVER = ['COMPLETED', 'CUSTOMER_CONFIRMED', 'SETTLED', 'CANCELLED', 'FAILED', 'DISPUTED'];
const NOT_STARTED = ['DRAFT', 'REQUESTED', 'PAYMENT_PENDING'];

/** What each live stage means, in the direction this task actually travels. */
function hintFor(t) {
  const startsAtCustomer = ['return', 'exchange'].includes(t.serviceType);
  switch (t.status) {
    case 'WORKER_SEARCHING': return 'Matching you with a verified helper nearby.';
    case 'WORKER_ASSIGNED': return 'Waiting for them to accept.';
    case 'EN_ROUTE': return startsAtCustomer ? 'Coming to you to collect the item.' : 'Heading to the shop. Follow them on the map.';
    case 'ARRIVED': return startsAtCustomer ? 'They are at your door.' : 'They are at the shop.';
    case 'IN_PROGRESS': return startsAtCustomer ? 'Working on your return.' : 'Picking up your items.';
    case 'APPROVAL_REQUIRED': return 'They need your answer before carrying on.';
    case 'RETURNING': return startsAtCustomer ? 'Taking your item to the store.' : 'Bringing your items to you.';
    case 'AT_DROPOFF': return 'At the drop-off now.';
    default: return null;
  }
}

const STATUS_LABEL = {
  DRAFT: 'Draft', REQUESTED: 'Requested', PAYMENT_PENDING: 'Payment pending',
  CONFIRMED: 'Confirmed', WORKER_SEARCHING: 'Finding a helper', WORKER_ASSIGNED: 'Helper assigned',
  WORKER_ACCEPTED: 'Helper on the way', EN_ROUTE: 'Helper en route', ARRIVED: 'Helper arrived',
  TASK_STARTED: 'Task started', IN_PROGRESS: 'In progress', APPROVAL_REQUIRED: 'Your decision needed',
  RETURNING: 'On the way back', AT_DROPOFF: 'At the drop-off', HANDED_OVER: 'Handed over',
  COMPLETED: 'Completed', CUSTOMER_CONFIRMED: 'Confirmed', SETTLED: 'Settled',
  CANCELLED: 'Cancelled', FAILED: 'Failed', ITEM_UNAVAILABLE: 'Item unavailable',
  MERCHANT_REJECTED: 'Merchant did not accept it', EXCHANGE_UNAVAILABLE: 'Replacement unavailable',
  DISPUTED: 'Under review',
};

const ITEM_LABEL = {
  requested: 'Requested', found: 'Found', not_found: 'Not found', out_of_stock: 'Out of stock',
  alternative_proposed: 'Alternative proposed', awaiting_approval: 'Waiting on you',
  approved: 'Approved', rejected: 'Declined', purchased: 'Purchased', skipped: 'Skipped',
};

function Shell({ children }) {
  return <div className="mx-auto max-w-lg space-y-3 px-4 py-4 pb-10 md:max-w-2xl">{children}</div>;
}

export default function HelpingTaskDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, isLoading, refetch } = useGetHelpingTaskQuery(id, { pollingInterval: 15000 });
  const [respond] = useRespondHelpingApprovalMutation();
  const [cancel] = useCancelHelpingTaskMutation();

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 size={24} className="animate-spin text-zappy-400" /></div>;
  if (!data?.task) return <div className="text-center py-24 text-slate-400">Task not found</div>;

  const { task, authorisation, canCancel, provider } = data;
  const due = data.due || { totalPaise: 0, feePaise: 0, itemsPaise: 0, itemsPending: false };
  const closed = ['CANCELLED', 'FAILED', 'SETTLED'].includes(task.status);
  const pendingApprovals = (task.approvals || []).filter((a) => a.status === 'pending');

  async function answer(approvalId, approved) {
    try {
      await respond({ id: task._id, approvalId, approved }).unwrap();
      toast.success(approved ? 'Approved' : 'Declined');
      refetch();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not send your answer');
    }
  }

  async function doCancel() {
    try {
      await cancel({ id: task._id, reason: 'Changed my mind' }).unwrap();
      toast.success('Cancelled');
      refetch();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not cancel');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => nav(-1)} className="p-1 -ml-1"><ArrowLeft size={20} /></button>
        <div className="min-w-0">
          <h1 className="text-lg font-black text-[#0F172A] truncate">{task.title || task.reference}</h1>
          <p className="text-xs text-slate-400">{task.reference}</p>
        </div>
      </div>

      <Shell>
        {!OVER.includes(task.status) && !NOT_STARTED.includes(task.status) ? (
          <LiveJobCard
            kind="helping"
            job={task}
            provider={provider}
            jobsNoun="tasks"
            label={STATUS_LABEL[task.status] || task.status}
            hint={hintFor(task)}
            steps={[
              { label: 'Confirmed', reached: true },
              { label: 'Helper', reached: WITH_HELPER.includes(task.status) },
              { label: 'Doing it', reached: DOING_IT.includes(task.status) },
              { label: 'Done', reached: false },
            ]}
          />
        ) : (
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200/80">
            <p className="text-[12px] font-semibold text-slate-500">Status</p>
            <p className="mt-0.5 text-[17px] font-bold text-navy">{STATUS_LABEL[task.status] || task.status}</p>
            {provider && <p className="mt-1 text-[13px] text-slate-500">with {provider.name}</p>}
          </div>
        )}

        {/* §36 — the customer's half of the approval engine. */}
        {pendingApprovals.map((a) => (
          <div key={a._id} className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm font-bold text-amber-900">{a.reason || 'Your helper needs a decision'}</p>
            </div>
            <div className="flex items-center justify-between text-sm bg-white rounded-xl p-3">
              <span className="text-slate-500">Was</span>
              <span className="font-bold">{formatPaise(a.previousAmountPaise)}</span>
              <span className="text-slate-300">→</span>
              <span className="text-slate-500">Now</span>
              <span className="font-bold text-amber-700">{formatPaise(a.newAmountPaise)}</span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => answer(a._id, false)}
                className="flex-1 rounded-xl border-2 border-slate-200 bg-white font-bold py-2.5 flex items-center justify-center gap-1.5">
                <X size={15} /> Decline
              </button>
              <button type="button" onClick={() => answer(a._id, true)}
                className="flex-1 rounded-xl bg-amber-600 text-white font-bold py-2.5 flex items-center justify-center gap-1.5">
                <Check size={15} /> Approve
              </button>
            </div>
          </div>
        ))}

        {!!(task.items || []).length && (
          <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-2.5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Items</p>
            {task.items.map((it) => (
              <div key={it._id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                <div className="min-w-0">
                  <p className="font-bold text-[#0F172A] truncate">{it.name} × {it.quantity}</p>
                  <p className="text-xs text-slate-400">{ITEM_LABEL[it.status] || it.status}</p>
                </div>
                <span className="font-bold text-[#0F172A] shrink-0 ml-2">
                  {it.actualPricePaise != null ? formatPaise(it.actualPricePaise) : `≤${formatPaise(it.maxApprovedPricePaise)}`}
                </span>
              </div>
            ))}
          </div>
        )}

        {task.returnDetail && (
          <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-1.5 text-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Return status</p>
            <p className="font-bold text-[#0F172A]">{task.returnDetail.productName}</p>
            <p className="text-slate-500">{task.returnDetail.merchantName} · Order {task.returnDetail.orderId}</p>
            <RefundBadge status={task.returnDetail.refundStatus} />
          </div>
        )}

        <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-1.5 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Price</p>
          <div className="flex justify-between"><span>ZappyOne service fee</span><span className="font-bold">{formatPaise(authorisation.serviceChargePaise)}</span></div>
          {authorisation.itemBudgetPaise > 0 && (
            <div className="flex justify-between text-slate-500"><span>Item budget</span><span>up to {formatPaise(authorisation.itemBudgetPaise)}</span></div>
          )}
          <p className="text-[11px] text-slate-400 pt-1">{authorisation.note}</p>
          <div className="pt-1 space-y-0.5 text-xs text-slate-500">
            <p>{task.paymentStatus === 'paid' ? 'Service fee paid' : task.paymentMethod === 'online' ? 'Service fee: pay online' : 'Service fee: pay in cash when the task is done'}</p>
            {task.itemMoney?.paymentModel === 'prepaid_wallet' && task.itemMoney.heldPaise > 0 && (
              <p>{formatPaise(task.itemMoney.heldPaise)} held from your wallet for items; anything unspent comes back.</p>
            )}
            {task.itemMoney?.paymentModel !== 'prepaid_wallet' && (task.items || []).length > 0 && (
              <p>{due.itemsPending ? 'Items: you repay what the helper spends, against the receipt, at delivery' : 'Items bill is final'}</p>
            )}
          </div>
          {!closed && due.totalPaise > 0 && (
            <div className="mt-2 flex justify-between font-black text-[#0F172A]"><span>Due now</span><span>{formatPaise(due.totalPaise)}</span></div>
          )}
          {!closed && due.totalPaise > 0 && (task.paymentMethod === 'online' || due.itemsPaise > 0) && (
            <PayNowButton
              bookingSource="helping"
              bookingId={task._id}
              amountLabel={formatPaise(due.totalPaise)}
              label={due.itemsPaise > 0 ? 'Helper: items and service fee' : 'Helper service charge'}
              className="mt-2"
            />
          )}
        </div>

        {task.pickupLocation?.address && (
          <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 flex items-start gap-2.5 text-sm">
            <MapPin size={15} className="text-zappy-500 mt-0.5 shrink-0" />
            <span>{task.pickupLocation.address}</span>
          </div>
        )}

        {!!(task.proofs || []).length && (
          <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
              <ImageIcon size={13} /> Proof
            </p>
            <div className="grid grid-cols-3 gap-2">
              {task.proofs.filter((p) => p.url).map((p, i) => (
                <img key={i} src={p.url} alt={p.kind} className="rounded-lg aspect-square object-cover" />
              ))}
            </div>
          </div>
        )}

        {['COMPLETED', 'CUSTOMER_CONFIRMED', 'SETTLED'].includes(task.status) && !task.ratedAt && (
          <RateCard taskId={task._id} onDone={refetch} />
        )}
        {task.ratedAt && (
          <div className="rounded-2xl border-2 border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Your rating</p>
            <div className="flex gap-1 mt-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} size={16} className={i <= task.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} />
              ))}
            </div>
          </div>
        )}

        {canCancel && (
          <button type="button" onClick={doCancel} className="w-full rounded-2xl border-2 border-red-200 text-red-600 font-bold py-3">
            Cancel task
          </button>
        )}
      </Shell>
    </div>
  );
}

function RefundBadge({ status }) {
  const map = {
    unknown: ['Not yet handed over', 'bg-slate-100 text-slate-500'],
    not_applicable: ['Not applicable', 'bg-slate-100 text-slate-500'],
    pending_merchant: ['Handed over — waiting on the merchant', 'bg-amber-100 text-amber-700'],
    refund_confirmed: ['Merchant confirmed the refund', 'bg-emerald-100 text-emerald-700'],
    refund_failed: ['Merchant did not process this', 'bg-red-100 text-red-700'],
  };
  const [label, cls] = map[status] || map.unknown;
  return <span className={`inline-block mt-1 rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>{label}</span>;
}

function RateCard({ taskId, onDone }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [rate, { isLoading }] = useRateHelpingTaskMutation();

  async function submit() {
    if (!stars) { toast.error('Pick a star rating'); return; }
    try {
      await rate({ id: taskId, rating: stars, comment }).unwrap();
      toast.success('Thanks for the feedback');
      onDone();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not submit your rating');
    }
  }

  return (
    <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-2.5">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Rate your helper</p>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" onClick={() => setStars(i)}>
            <Star size={26} className={i <= stars ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} />
          </button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Anything to add? (optional)"
        rows={2} className="w-full rounded-xl border-2 border-slate-200 p-2.5 text-sm" />
      <button type="button" onClick={submit} disabled={isLoading}
        className="w-full rounded-xl bg-[#0F172A] text-white font-bold py-2.5 disabled:opacity-50">
        Submit rating
      </button>
    </div>
  );
}
