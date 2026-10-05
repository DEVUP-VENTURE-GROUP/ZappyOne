import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { useAdminDuesQuery, useAdminRecordDuesPaymentMutation, useAdminRejectDuesClaimMutation } from '@shared/services/api';
import { Card, PageLoader, StatCard, fmt } from '../../../ui/kit';
import { RupeeInput, Setting, toPaise } from './fields';
import { useRuleForm, rupeeField } from './CancellationRules';

const STATUS = {
  blocked: ['New jobs stopped', 'bg-red-50 text-red-700'],
  warning: ['Warned', 'bg-amber-50 text-amber-700'],
  in_debt: ['Owes', 'bg-slate-100 text-slate-600'],
  clear: ['Clear', 'bg-emerald-50 text-emerald-700'],
};

const DUES_FIELDS = [
  rupeeField('workerDuesWarnPaise', 10000000),
  rupeeField('workerDuesLimitPaise', 10000000),
  { key: 'duesPayInstructions', toForm: (v) => v || '', toValue: (v) => String(v || '').trim(), valid: (v) => v.length <= 300 },
];

function Limits() {
  const f = useRuleForm(DUES_FIELDS);
  if (!f.form) return <PageLoader />;
  const order = f.form && toPaise(f.form.workerDuesWarnPaise) <= toPaise(f.form.workerDuesLimitPaise);
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Dues limits</h3>
          <p className="mt-0.5 text-[12px] text-slate-500">On a cash job the worker keeps everything and owes ZappyOne the commission. Their wallet can go below zero up to the limit.</p>
        </div>
        <button type="button" onClick={() => f.submit('Dues limits saved')} disabled={!f.dirty || !f.valid || !order || f.saving}
          className="inline-flex min-w-[72px] items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400">
          {f.saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
        </button>
      </div>
      <Setting title="Warn the worker at" hint="They see a warning card and get a push to pay some now.">
        <RupeeInput value={f.form.workerDuesWarnPaise} onChange={f.set('workerDuesWarnPaise')} max={100000} label="Warning amount" />
      </Setting>
      <Setting title="Stop new jobs at" hint="No alerts, no accepting, cannot go online. A job already under way still finishes.">
        <RupeeInput value={f.form.workerDuesLimitPaise} onChange={f.set('workerDuesLimitPaise')} max={100000} label="Limit amount" />
      </Setting>
      <Setting title="How workers pay" hint="Shown on their dues card, e.g. your UPI ID or office address.">
        <input value={f.form.duesPayInstructions} onChange={(e) => f.set('duesPayInstructions')(e.target.value)} maxLength={300}
          placeholder="Pay to UPI zappyone@okaxis and tap I have paid"
          className="w-full min-w-[260px] rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 sm:w-80" />
      </Setting>
      {!order && <p className="px-4 pb-3 text-[12px] text-red-600">The warning must be at or below the limit.</p>}
    </Card>
  );
}

function RecordPayment({ row, claim, onDone }) {
  const [amount, setAmount] = useState(claim ? String(claim.amountPaise / 100) : '');
  const [reference, setReference] = useState(claim?.reference || '');
  const [method, setMethod] = useState(claim?.method || 'upi');
  const [record, { isLoading }] = useAdminRecordDuesPaymentMutation();
  async function submit() {
    const paise = toPaise(amount);
    if (!Number.isFinite(paise) || paise < 100) return toast.error('Enter the amount received');
    try {
      const out = await record({ workerId: row.workerId, amountPaise: paise, method, reference: reference.trim(), claimId: claim?._id || null }).unwrap();
      toast.success(`Recorded. ${row.name} now owes ${fmt(out.after.duesPaise)}.`);
      onDone();
    } catch (err) { toast.error(err?.data?.error || 'Could not record it'); }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
      <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm">
        <option value="upi">UPI</option><option value="bank">Bank</option><option value="cash">Cash</option>
      </select>
      <RupeeInput value={amount} onChange={setAmount} max={100000} label="Amount received" />
      <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference" maxLength={80}
        className="w-40 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
      <button type="button" onClick={submit} disabled={isLoading}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {isLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} {claim ? 'Confirm received' : 'Record payment'}
      </button>
      <button type="button" onClick={onDone} className="px-2 text-sm text-slate-500">Cancel</button>
    </div>
  );
}

function Row({ row }) {
  const [open, setOpen] = useState(null);
  const [reject] = useAdminRejectDuesClaimMutation();
  const [label, tone] = STATUS[row.status] || STATUS.in_debt;
  return (
    <div className="space-y-2 border-t border-slate-100 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{row.name} <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{label}</span></p>
          <p className="text-[12px] text-slate-500">{row.phone || 'No phone'}{row.online ? ' · online' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base font-bold tabular-nums text-slate-900">{fmt(row.duesPaise)}</span>
          {row.phone && <a href={`tel:${row.phone}`} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">Call</a>}
          {row.duesPaise > 0 && <button type="button" onClick={() => setOpen({})} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">Record payment</button>}
        </div>
      </div>
      {row.claims.map((c) => (
        <div key={c._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px]">
          <span className="text-amber-900">Says they paid <b>{fmt(c.amountPaise)}</b> by {c.method}{c.reference ? ` · ref ${c.reference}` : ''} · {new Date(c.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setOpen({ claim: c })} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white">Check and confirm</button>
            <button type="button" onClick={async () => {
              const note = window.prompt('Why? The worker sees this.', 'We could not find this payment. Check the reference.');
              if (note == null) return;
              try { await reject({ id: c._id, note }).unwrap(); toast.success('Rejected; the worker was told'); } catch (err) { toast.error(err?.data?.error || 'Could not reject'); }
            }} className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">Not received</button>
          </span>
        </div>
      ))}
      {open && <RecordPayment row={row} claim={open.claim} onDone={() => setOpen(null)} />}
    </div>
  );
}

export default function WorkerDues() {
  const { data, isLoading } = useAdminDuesQuery(undefined, { pollingInterval: 60000 });
  return (
    <div className="space-y-5">
      <Limits />
      {isLoading ? <PageLoader /> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Owed to ZappyOne" value={fmt(data?.totalPaise || 0)} />
            <StatCard label="Workers owing" value={(data?.rows || []).filter((r) => r.duesPaise > 0).length} />
            <StatCard label="New jobs stopped" value={data?.blocked || 0} color="text-red-600" bg="bg-red-50" />
            <StatCard label="Payments to check" value={data?.pendingClaims || 0} color="text-amber-600" bg="bg-amber-50" />
          </div>
          <Card className="overflow-hidden p-0">
            <div className="px-4 py-3">
              <h3 className="text-sm font-bold text-slate-800">Who owes</h3>
              <p className="mt-0.5 text-[12px] text-slate-500">Deepest first. Recording a payment credits their wallet and lifts the stop at once.</p>
            </div>
            {(data?.rows || []).length
              ? data.rows.map((r) => <Row key={r.workerId} row={r} />)
              : <p className="border-t border-slate-100 px-4 py-8 text-center text-sm text-slate-400">No worker owes anything right now.</p>}
          </Card>
        </>
      )}
    </div>
  );
}
