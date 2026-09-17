import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Check, X, AlertTriangle, Navigation, Banknote,
} from 'lucide-react';
import toast from 'react-hot-toast';
import ProofPhotos, { readyKeys } from '../../components/common/ProofPhotos';
import ImageUploadField from '../../components/common/ImageUploadField';
import {
  useGetHelpingTaskQuery, useAdvanceHelpingStatusMutation, useUpdateHelpingItemMutation,
  useProposeHelpingAlternativeMutation, useRecordHelpingAdvanceMutation,
  useAddHelpingProofMutation, useRecordHelpingHandoverMutation, useCompleteHelpingTaskMutation,
} from '../../services/api';
import { formatPaise } from '../../utils/money';

/**
 * Worker execution — §10, §11, §12, §13, §27, §28, §29.
 *
 * §61's rules are enforced by the server (an overpriced purchase is refused,
 * a handover with no proof is refused) — this screen exists to make the
 * RIGHT action obvious at each step, not to re-check the rules itself.
 */
const NEXT_STATUS = {
  WORKER_ACCEPTED: ['EN_ROUTE'],
  EN_ROUTE: ['ARRIVED'],
  ARRIVED: ['TASK_STARTED'],
  TASK_STARTED: ['IN_PROGRESS'],
};

function Shell({ children }) {
  return <div className="max-w-lg mx-auto px-4 py-4 space-y-3 pb-10">{children}</div>;
}

export default function WorkerHelpingJobPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, isLoading, refetch } = useGetHelpingTaskQuery(id, { pollingInterval: 10000 });
  const [advance] = useAdvanceHelpingStatusMutation();
  const [addProof] = useAddHelpingProofMutation();
  const [complete, { isLoading: completing }] = useCompleteHelpingTaskMutation();
  const [arrivalPhotos, setArrivalPhotos] = useState([]);

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 size={24} className="animate-spin text-indigo-400" /></div>;
  if (!data?.task) return <div className="text-center py-24 text-slate-400">Task not found</div>;

  const { task } = data;
  const isReturn = ['return', 'exchange'].includes(task.serviceType);
  const pendingApproval = (task.approvals || []).some((a) => a.status === 'pending');

  async function move(status) {
    try {
      // Arrival photos are attached to the task's proof log before the status
      // moves on — the whole point of capturing them is that they end up in
      // the report, not that they merely sat in a component's local state.
      if (status === 'TASK_STARTED' && readyKeys(arrivalPhotos).length) {
        await Promise.all(
          readyKeys(arrivalPhotos).map((key) => addProof({ id: task._id, kind: 'arrival', key }).unwrap()),
        );
      }
      await advance({ id: task._id, status }).unwrap();
      refetch();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not update the task');
    }
  }

  async function finish() {
    try {
      await complete(task._id).unwrap();
      toast.success('Task completed and settled');
      nav('/worker/helping');
    } catch (err) {
      toast.error(err?.data?.error || 'Could not complete the task');
    }
  }

  const nextMoves = NEXT_STATUS[task.status] || [];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => nav(-1)} className="p-1 -ml-1"><ArrowLeft size={20} /></button>
        <div className="min-w-0">
          <h1 className="text-lg font-black text-[#0F172A] truncate">{task.title || task.reference}</h1>
          <p className="text-xs text-slate-400">{task.status.replace(/_/g, ' ')}</p>
        </div>
      </div>

      <Shell>
        {task.pickupLocation?.address && (
          <a
            href={`https://maps.google.com/?q=${task.pickupLocation.coordinates?.[1]},${task.pickupLocation.coordinates?.[0]}`}
            target="_blank" rel="noreferrer"
            className="flex items-center gap-2.5 rounded-2xl border-2 border-slate-200 bg-white p-4 text-sm"
          >
            <Navigation size={16} className="text-indigo-500 shrink-0" />
            <span className="min-w-0 truncate">{task.pickupLocation.address}</span>
          </a>
        )}

        {task.instructions && (
          <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 text-sm text-slate-600">
            {task.instructions}
          </div>
        )}

        {nextMoves.length > 0 && (
          <div className="space-y-2">
            {nextMoves.map((s) => (
              <button key={s} type="button" onClick={() => move(s)}
                className="w-full rounded-2xl bg-[#0F172A] text-white font-bold py-3.5">
                {s === 'EN_ROUTE' && "I'm on my way"}
                {s === 'ARRIVED' && "I've arrived"}
                {s === 'TASK_STARTED' && 'Start the task'}
                {s === 'IN_PROGRESS' && 'Begin'}
              </button>
            ))}
          </div>
        )}

        {task.status === 'ARRIVED' && (
          <ProofPhotos
            photos={arrivalPhotos} onChange={setArrivalPhotos}
            folder="helping/arrival" max={2}
            title="Arrival photo" hint="A quick photo confirms you're at the right place."
          />
        )}

        {isReturn
          ? <ReturnExecution task={task} onChanged={refetch} />
          : <ShoppingExecution task={task} onChanged={refetch} disabled={pendingApproval} />}

        {pendingApproval && (
          <div className="flex items-start gap-2 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>Waiting on the customer's decision. You'll be notified the moment they answer.</span>
          </div>
        )}

        {['IN_PROGRESS', 'AT_DROPOFF', 'HANDED_OVER'].includes(task.status) && !pendingApproval && (
          <button type="button" onClick={finish} disabled={completing}
            className="w-full rounded-2xl bg-emerald-600 text-white font-bold py-3.5 disabled:opacity-50">
            {completing ? 'Completing…' : 'Complete task'}
          </button>
        )}
      </Shell>
    </div>
  );
}

/* ─── Shopping / pickup execution — §12, §13, §14 ─────────────────────── */

function ShoppingExecution({ task, onChanged, disabled }) {
  const [updateItem] = useUpdateHelpingItemMutation();
  const [proposeAlt] = useProposeHelpingAlternativeMutation();
  const [recordAdvance] = useRecordHelpingAdvanceMutation();
  const [advanceAmount, setAdvanceAmount] = useState('');

  if (!(task.items || []).length) return null;

  async function markPurchased(item, price) {
    try {
      await updateItem({
        id: task._id, itemId: item._id, status: 'purchased', actualPricePaise: Math.round(price * 100),
      }).unwrap();
      toast.success('Marked purchased');
      onChanged();
    } catch (err) {
      if (err?.data?.code === 'APPROVAL_REQUIRED') {
        toast.error('That price is above what the customer approved — propose it as an alternative instead');
      } else {
        toast.error(err?.data?.error || 'Could not save this');
      }
    }
  }

  async function markUnavailable(item, status) {
    try {
      await updateItem({ id: task._id, itemId: item._id, status, reason: 'Not available in store' }).unwrap();
      onChanged();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not save this');
    }
  }

  async function sendAdvance() {
    if (!advanceAmount) return;
    try {
      await recordAdvance({ id: task._id, amountPaise: Math.round(Number(advanceAmount) * 100) }).unwrap();
      toast.success('Advance recorded — you will be reimbursed on settlement');
      setAdvanceAmount('');
      onChanged();
    } catch (err) {
      toast.error(err?.data?.error || 'That is more than the advance limit — the customer must fund it');
    }
  }

  return (
    <div className="space-y-2.5">
      {task.items.map((item) => (
        <ItemRow
          key={item._id} item={item} disabled={disabled}
          onPurchase={(price) => markPurchased(item, price)}
          onUnavailable={(status) => markUnavailable(item, status)}
          onAlternative={(alt) => proposeAlt({ id: task._id, itemId: item._id, ...alt }).unwrap()
            .then(() => { toast.success('Sent for approval'); onChanged(); })
            .catch((err) => toast.error(err?.data?.error || 'Could not send this'))}
        />
      ))}

      {task.itemMoney?.paymentModel === 'worker_advance' && (
        <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
            <Banknote size={13} /> You're fronting this purchase
          </p>
          <div className="flex gap-2">
            <input type="number" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)}
              placeholder="Amount paid at till (₹)" className="flex-1 rounded-xl border-2 border-slate-200 p-2.5" />
            <button type="button" onClick={sendAdvance} className="rounded-xl bg-slate-900 text-white font-bold px-4">Record</button>
          </div>
          <p className="text-[11px] text-slate-400">You'll be reimbursed exactly this amount when the task settles.</p>
        </div>
      )}
    </div>
  );
}

function ItemRow({ item, disabled, onPurchase, onUnavailable, onAlternative }) {
  const [price, setPrice] = useState('');
  const [showAlt, setShowAlt] = useState(false);
  const [alt, setAlt] = useState({ name: '', pricePaise: '', quantity: item.quantity, photoKey: '', note: '' });

  const done = ['purchased', 'not_found', 'rejected', 'skipped'].includes(item.status);

  return (
    <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-2.5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="font-bold text-[#0F172A]">{item.name} × {item.quantity}</p>
          {(item.preferredBrand || item.preferredVariant) && (
            <p className="text-xs text-slate-400">{[item.preferredBrand, item.preferredVariant].filter(Boolean).join(' · ')}</p>
          )}
          <p className="text-xs text-slate-500 mt-0.5">Max: {formatPaise(item.maxApprovedPricePaise)}</p>
        </div>
        <span className="text-[10px] font-bold uppercase text-indigo-500 shrink-0">{item.status.replace(/_/g, ' ')}</span>
      </div>

      {!done && !disabled && (
        <>
          <div className="flex gap-2">
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)}
              placeholder="Price paid (₹)" className="flex-1 rounded-xl border-2 border-slate-200 p-2 text-sm" />
            <button type="button" onClick={() => price && onPurchase(Number(price))}
              className="rounded-xl bg-emerald-600 text-white font-bold px-3 text-sm flex items-center gap-1">
              <Check size={14} /> Bought
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => onUnavailable('not_found')}
              className="flex-1 rounded-xl border-2 border-slate-200 font-bold py-2 text-xs flex items-center justify-center gap-1">
              <X size={12} /> Not found
            </button>
            <button type="button" onClick={() => setShowAlt((v) => !v)}
              className="flex-1 rounded-xl border-2 border-amber-200 text-amber-700 font-bold py-2 text-xs">
              Propose alternative
            </button>
          </div>
        </>
      )}

      {showAlt && !done && (
        <div className="rounded-xl bg-amber-50 p-3 space-y-2">
          <input value={alt.name} onChange={(e) => setAlt((a) => ({ ...a, name: e.target.value }))}
            placeholder="Alternative product name" className="w-full rounded-lg border-2 border-amber-200 p-2 text-sm" />
          <div className="flex gap-2">
            <input type="number" value={alt.pricePaise} onChange={(e) => setAlt((a) => ({ ...a, pricePaise: e.target.value }))}
              placeholder="Its price (₹)" className="flex-1 rounded-lg border-2 border-amber-200 p-2 text-sm" />
          </div>
          <ImageUploadField value={alt.photoKey} onChange={(v) => setAlt((a) => ({ ...a, photoKey: v }))}
            folder="helping/alternatives" label="photo of the item" />
          <button
            type="button"
            onClick={() => {
              onAlternative({ ...alt, pricePaise: Math.round(Number(alt.pricePaise || 0) * 100) });
              setShowAlt(false);
            }}
            disabled={!alt.name || !alt.pricePaise}
            className="w-full rounded-lg bg-amber-600 text-white font-bold py-2 text-sm disabled:opacity-50"
          >
            Send to customer for approval
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Return / exchange execution — §27, §28, §29 ─────────────────────── */

function ReturnExecution({ task, onChanged }) {
  const [proofs, setProofs] = useState([]);
  const [tracking, setTracking] = useState('');
  const [ack, setAck] = useState('');
  const [handover, { isLoading }] = useRecordHelpingHandoverMutation();
  const [addProof] = useAddHelpingProofMutation();

  const done = ['HANDED_OVER', 'COMPLETED', 'CUSTOMER_CONFIRMED', 'SETTLED'].includes(task.status);

  async function submitHandover() {
    const keys = readyKeys(proofs);
    if (!keys.length) { toast.error('At least one photo of the handover is needed'); return; }
    try {
      // Every proof also lives on the task's own proof log for the report.
      await Promise.all(keys.map((k) => addProof({ id: task._id, kind: 'merchant_acknowledgement', key: k }).unwrap()));
      await handover({
        id: task._id, trackingNumber: tracking, acknowledgement: ack, proofKeys: keys,
      }).unwrap();
      toast.success('Handover recorded');
      onChanged();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not record the handover');
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        Handover recorded — the merchant's own process takes it from here.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Handover</p>
      {task.returnDetail?.merchantInstructions && (
        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5">{task.returnDetail.merchantInstructions}</p>
      )}
      <ProofPhotos photos={proofs} onChange={setProofs} folder="helping/handover" max={3}
        title="Handover / receipt photo" hint="A courier receipt, store acknowledgement, or clear handover photo." />
      <input value={tracking} onChange={(e) => setTracking(e.target.value)}
        placeholder="Tracking / AWB number (if any)" className="w-full rounded-xl border-2 border-slate-200 p-2.5 text-sm" />
      <input value={ack} onChange={(e) => setAck(e.target.value)}
        placeholder="Merchant acknowledgement (if any)" className="w-full rounded-xl border-2 border-slate-200 p-2.5 text-sm" />
      <button type="button" onClick={submitHandover} disabled={isLoading}
        className="w-full rounded-xl bg-[#0F172A] text-white font-bold py-3 disabled:opacity-50">
        {isLoading ? 'Recording…' : 'Confirm handover'}
      </button>
    </div>
  );
}
