import { useState } from 'react';
import { ShoppingBag, AlertTriangle, Save, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useAdminHelpingConfigQuery, useAdminUpdateHelpingConfigMutation,
  useAdminHelpingTasksQuery, useAdminHelpingRefundOutcomeMutation,
} from '@shared/services/api';
import {
  PageLoader, EmptyState, SectionHeader, Card, StatusBadge, Th, Td,
  FormRow, Input, Select, Spinner,
} from './_shared';

/**
 * Helping Services operations (§37, §51).
 *
 * Two jobs: tune the economics without a deploy, and deal with the tasks that
 * need a human. Everything on the config tab is a live value the pricing
 * engine reads on the next request — the cache is invalidated server-side on
 * save, so an edit takes effect immediately rather than in 30 seconds.
 */

const rupees = (paise) => (paise == null ? '' : (paise / 100).toString());
const paise = (rs) => Math.round((Number(rs) || 0) * 100);

const SERVICE_LABEL = {
  shopping: 'Shopping', pickup: 'Pickup', return: 'Returns', exchange: 'Exchange',
};

export default function Helping() {
  const [tab, setTab] = useState('ops');

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Helping Services"
        subtitle="Errands, shopping, returns and exchanges — pricing and live operations"
      />

      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {[['ops', 'Live tasks'], ['exceptions', 'Exceptions'], ['config', 'Pricing & limits']].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
              tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'config' ? <ConfigTab /> : <TasksTab exceptionsOnly={tab === 'exceptions'} />}
    </div>
  );
}

/* ─── Live tasks & exceptions (§37) ───────────────────────────────────── */

function TasksTab({ exceptionsOnly }) {
  const { data, isLoading, refetch } = useAdminHelpingTasksQuery(
    exceptionsOnly ? { exceptions: 'true' } : {},
    { pollingInterval: 30000 },
  );
  const [setOutcome] = useAdminHelpingRefundOutcomeMutation();

  if (isLoading) return <PageLoader />;
  const tasks = data?.tasks || [];

  if (!tasks.length) {
    return (
      <EmptyState
        icon={exceptionsOnly ? AlertTriangle : ShoppingBag}
        message={exceptionsOnly ? 'Nothing needs attention right now' : 'No tasks yet'}
      />
    );
  }

  async function recordRefund(id, status) {
    const ref = window.prompt(
      status === 'refund_confirmed'
        ? "Merchant's refund reference (required — this is the evidence)"
        : 'Reason / reference',
    );
    if (status === 'refund_confirmed' && !ref) {
      toast.error('A refund is only marked confirmed against a real merchant reference');
      return;
    }
    try {
      await setOutcome({ id, status, externalReference: ref || '' }).unwrap();
      toast.success('Recorded');
      refetch();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not record that');
    }
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <Th>Reference</Th>
              <Th>Service</Th>
              <Th>Status</Th>
              <Th right>Service fee</Th>
              <Th right>Item money</Th>
              <Th>Refund</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t._id} className="border-b border-slate-50 last:border-0">
                <Td mono>{t.reference}</Td>
                <Td>{SERVICE_LABEL[t.serviceType] || t.serviceType}</Td>
                <Td><StatusBadge status={t.status} /></Td>
                {/* The two monies stay visually apart here too — an operator
                    reading one total would be reading a number that does not
                    exist anywhere in the system. */}
                <Td right mono>₹{rupees(t.charge?.serviceChargePaise) || '0'}</Td>
                <Td right mono muted>
                  {t.itemMoney?.actualPaise
                    ? `₹${rupees(t.itemMoney.actualPaise)}`
                    : t.itemMoney?.budgetPaise
                      ? `≤₹${rupees(t.itemMoney.budgetPaise)}`
                      : '—'}
                </Td>
                <Td muted>{t.returnDetail ? t.returnDetail.refundStatus.replace(/_/g, ' ') : '—'}</Td>
                <Td>
                  {t.returnDetail && t.returnDetail.refundStatus === 'pending_merchant' && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => recordRefund(t._id, 'refund_confirmed')}
                        className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white"
                      >
                        Refunded
                      </button>
                      <button
                        type="button"
                        onClick={() => recordRefund(t._id, 'refund_failed')}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600"
                      >
                        Rejected
                      </button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ─── Pricing & limits (§51) ──────────────────────────────────────────── */

function ConfigTab() {
  const { data, isLoading } = useAdminHelpingConfigQuery();
  const [active, setActive] = useState(null);

  if (isLoading) return <PageLoader />;
  const configs = data?.configs || [];
  const current = configs.find((c) => c.serviceType === (active || configs[0]?.serviceType));

  if (!current) return <EmptyState icon={Package} message="No services configured yet — run the seeder" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {configs.map((c) => (
          <button
            key={c.serviceType}
            type="button"
            onClick={() => setActive(c.serviceType)}
            className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${
              c.serviceType === current.serviceType
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            {SERVICE_LABEL[c.serviceType] || c.serviceType}
          </button>
        ))}
      </div>
      <ConfigForm key={current.serviceType} config={current} />
    </div>
  );
}

function ConfigForm({ config }) {
  const [save, { isLoading }] = useAdminUpdateHelpingConfigMutation();
  const [form, setForm] = useState({
    baseFee: rupees(config.baseFeePaise),
    freeWaitingMinutes: config.freeWaitingMinutes,
    waitingPerMinute: rupees(config.waitingPerMinutePaise),
    includedStops: config.includedStops,
    additionalStopFee: rupees(config.additionalStopFeePaise),
    maxStops: config.maxStops,
    timeExtensionBlockMinutes: config.timeExtensionBlockMinutes,
    timeExtensionFee: rupees(config.timeExtensionFeePaise),
    specialHandlingFee: rupees(config.specialHandlingFeePaise),
    commissionPct: config.commissionPct,
    platformFee: rupees(config.platformFeePaise),
    taxPct: config.taxPct,
    maxWorkerAdvance: rupees(config.maxWorkerAdvancePaise),
    maxItemBudget: rupees(config.maxItemBudgetPaise),
    priceTolerancePct: config.priceTolerancePct,
    maxItems: config.maxItems,
    defaultDurationMinutes: config.defaultDurationMinutes,
    restricted: (config.restrictedItemCategories || []).join(', '),
    disclaimer: config.disclaimer || '',
    slabs: (config.distanceSlabs || []).map((s) => ({ ...s, fee: rupees(s.feePaise) })),
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function setSlab(i, patch) {
    setForm((f) => ({ ...f, slabs: f.slabs.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));
  }

  async function submit() {
    try {
      await save({
        serviceType: config.serviceType,
        baseFeePaise: paise(form.baseFee),
        freeWaitingMinutes: Number(form.freeWaitingMinutes),
        waitingPerMinutePaise: paise(form.waitingPerMinute),
        includedStops: Number(form.includedStops),
        additionalStopFeePaise: paise(form.additionalStopFee),
        maxStops: Number(form.maxStops),
        timeExtensionBlockMinutes: Number(form.timeExtensionBlockMinutes),
        timeExtensionFeePaise: paise(form.timeExtensionFee),
        specialHandlingFeePaise: paise(form.specialHandlingFee),
        commissionPct: Number(form.commissionPct),
        platformFeePaise: paise(form.platformFee),
        taxPct: Number(form.taxPct),
        maxWorkerAdvancePaise: paise(form.maxWorkerAdvance),
        maxItemBudgetPaise: paise(form.maxItemBudget),
        priceTolerancePct: Number(form.priceTolerancePct),
        maxItems: Number(form.maxItems),
        defaultDurationMinutes: Number(form.defaultDurationMinutes),
        restrictedItemCategories: form.restricted.split(',').map((x) => x.trim()).filter(Boolean),
        disclaimer: form.disclaimer,
        distanceSlabs: form.slabs.map((s) => ({
          fromKm: Number(s.fromKm),
          toKm: s.toKm === '' || s.toKm == null ? null : Number(s.toKm),
          feePaise: paise(s.fee),
          requiresQuote: !!s.requiresQuote,
        })),
      }).unwrap();
      toast.success('Saved — live on the next quote');
    } catch (err) {
      toast.error(err?.data?.error || 'Could not save');
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-3 text-sm font-black text-slate-900">Service charge</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FormRow label="Base fee (₹)">
            <Input type="number" value={form.baseFee} onChange={(e) => set('baseFee', e.target.value)} />
          </FormRow>
          <FormRow label="Free waiting (minutes)" hint="Metered only after this">
            <Input type="number" value={form.freeWaitingMinutes} onChange={(e) => set('freeWaitingMinutes', e.target.value)} />
          </FormRow>
          <FormRow label="Waiting per minute (₹)">
            <Input type="number" value={form.waitingPerMinute} onChange={(e) => set('waitingPerMinute', e.target.value)} />
          </FormRow>
          <FormRow label="Included stops">
            <Input type="number" value={form.includedStops} onChange={(e) => set('includedStops', e.target.value)} />
          </FormRow>
          <FormRow label="Additional stop fee (₹)">
            <Input type="number" value={form.additionalStopFee} onChange={(e) => set('additionalStopFee', e.target.value)} />
          </FormRow>
          <FormRow label="Max stops">
            <Input type="number" value={form.maxStops} onChange={(e) => set('maxStops', e.target.value)} />
          </FormRow>
          <FormRow label="Overtime block (minutes)">
            <Input type="number" value={form.timeExtensionBlockMinutes} onChange={(e) => set('timeExtensionBlockMinutes', e.target.value)} />
          </FormRow>
          <FormRow label="Overtime fee per block (₹)">
            <Input type="number" value={form.timeExtensionFee} onChange={(e) => set('timeExtensionFee', e.target.value)} />
          </FormRow>
          <FormRow label="Special handling (₹)">
            <Input type="number" value={form.specialHandlingFee} onChange={(e) => set('specialHandlingFee', e.target.value)} />
          </FormRow>
        </div>
      </Card>

      <Card>
        <h3 className="mb-1 text-sm font-black text-slate-900">Distance slabs</h3>
        <p className="mb-3 text-xs text-slate-500">
          A trip past the last slab is refused rather than priced on a guess — mark the final
          open-ended slab &quot;quote required&quot;.
        </p>
        <div className="space-y-2">
          {form.slabs.map((s, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Input type="number" placeholder="From km" value={s.fromKm} onChange={(e) => setSlab(i, { fromKm: e.target.value })} />
              <Input type="number" placeholder="To km (blank = ∞)" value={s.toKm ?? ''} onChange={(e) => setSlab(i, { toKm: e.target.value })} />
              <Input type="number" placeholder="Fee ₹" value={s.fee} onChange={(e) => setSlab(i, { fee: e.target.value })} />
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input type="checkbox" checked={!!s.requiresQuote} onChange={(e) => setSlab(i, { requiresQuote: e.target.checked })} />
                Quote required
              </label>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-1 text-sm font-black text-slate-900">Item money &amp; limits</h3>
        <p className="mb-3 text-xs text-slate-500">
          Item cost is never ZappyOne revenue and is never commissioned — these are the guardrails
          around the customer&apos;s money, not pricing.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FormRow label="Max worker advance (₹)" hint="Above this, the customer must fund it">
            <Input type="number" value={form.maxWorkerAdvance} onChange={(e) => set('maxWorkerAdvance', e.target.value)} />
          </FormRow>
          <FormRow label="Max item budget (₹)">
            <Input type="number" value={form.maxItemBudget} onChange={(e) => set('maxItemBudget', e.target.value)} />
          </FormRow>
          <FormRow label="Price tolerance (%)" hint="0 = always ask before overspending">
            <Input type="number" value={form.priceTolerancePct} onChange={(e) => set('priceTolerancePct', e.target.value)} />
          </FormRow>
          <FormRow label="Max items per task">
            <Input type="number" value={form.maxItems} onChange={(e) => set('maxItems', e.target.value)} />
          </FormRow>
          <FormRow label="Commission (%)" hint="Taken from the service fee only">
            <Input type="number" value={form.commissionPct} onChange={(e) => set('commissionPct', e.target.value)} />
          </FormRow>
          <FormRow label="Platform fee (₹)">
            <Input type="number" value={form.platformFee} onChange={(e) => set('platformFee', e.target.value)} />
          </FormRow>
          <FormRow label="Tax (%)">
            <Input type="number" value={form.taxPct} onChange={(e) => set('taxPct', e.target.value)} />
          </FormRow>
          <FormRow label="Default duration (minutes)">
            <Input type="number" value={form.defaultDurationMinutes} onChange={(e) => set('defaultDurationMinutes', e.target.value)} />
          </FormRow>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-black text-slate-900">Restrictions &amp; customer copy</h3>
        <div className="space-y-3">
          <FormRow label="Restricted item categories" hint="Comma separated. A task naming any of these is refused at creation.">
            <Input value={form.restricted} onChange={(e) => set('restricted', e.target.value)} />
          </FormRow>
          <FormRow label="Customer disclaimer" hint="Shown before booking. Must not soften into a promise.">
            <Input value={form.disclaimer} onChange={(e) => set('disclaimer', e.target.value)} />
          </FormRow>
        </div>
      </Card>

      <button
        type="button"
        onClick={submit}
        disabled={isLoading}
        className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {isLoading ? <Spinner size={15} /> : <Save size={15} />}
        Save configuration
      </button>
    </div>
  );
}
