import { useState } from 'react';
import { PawPrint, ShieldCheck, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useAdminPetBookingsQuery, useAdminPetPricingQuery, useAdminUpdatePetPricingMutation,
  useAdminPetCapabilitiesQuery, useAdminUpdatePetCapabilityMutation,
} from '../../services/api';
import {
  PageLoader, EmptyState, SectionHeader, Card, StatusBadge, Th, Td, FormRow, Input, Spinner,
} from './_shared';

/**
 * Pet Services operations (§46, §47).
 *
 * Same discipline as the other verticals: every price is a `PetPricingRule`
 * row editable here, and the change is live on the next quote — the
 * pricing engine's cache is invalidated server-side on save.
 */
export default function Pet() {
  const [tab, setTab] = useState('bookings');

  return (
    <div className="space-y-5">
      <SectionHeader title="Pet Services" subtitle="Grooming, boarding, walking and care for dogs and cats" />

      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {[['bookings', 'Bookings'], ['providers', 'Providers'], ['pricing', 'Pricing']].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition ${tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'bookings' && <BookingsTab />}
      {tab === 'providers' && <ProvidersTab />}
      {tab === 'pricing' && <PricingTab />}
    </div>
  );
}

function BookingsTab() {
  const { data, isLoading } = useAdminPetBookingsQuery({});
  if (isLoading) return <PageLoader />;
  const bookings = data?.bookings || [];
  if (!bookings.length) return <EmptyState icon={PawPrint} message="No bookings yet" />;

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200">
            <Th>Reference</Th><Th>Category</Th><Th>Status</Th><Th right>Total</Th><Th right>Commission</Th>
          </tr></thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b._id} className="border-b border-slate-50 last:border-0">
                <Td mono>{b.reference}</Td>
                <Td>{b.categoryCode.replace(/_/g, ' ')}</Td>
                <Td><StatusBadge status={b.status} /></Td>
                <Td right mono>₹{((b.pricing?.totalPaise || 0) / 100).toFixed(0)}</Td>
                <Td right mono muted>₹{((b.pricing?.commissionPaise || 0) / 100).toFixed(0)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ProvidersTab() {
  const { data, isLoading } = useAdminPetCapabilitiesQuery({});
  const [update] = useAdminUpdatePetCapabilityMutation();
  if (isLoading) return <PageLoader />;
  const capabilities = data?.capabilities || [];
  if (!capabilities.length) return <EmptyState icon={ShieldCheck} message="No providers yet" />;

  async function setStatus(id, verificationStatus) {
    try {
      await update({ id, verificationStatus }).unwrap();
      toast.success('Updated');
    } catch (err) {
      toast.error(err?.data?.error || 'Could not update');
    }
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200">
            <Th>Type</Th><Th>Species</Th><Th>Categories</Th><Th>Capacity</Th><Th>Status</Th><Th>Demo</Th><Th>Action</Th>
          </tr></thead>
          <tbody>
            {capabilities.map((c) => (
              <tr key={c._id} className="border-b border-slate-50 last:border-0">
                <Td>{c.providerType.replace(/_/g, ' ')}</Td>
                <Td muted>{(c.species || []).join(', ')}</Td>
                <Td muted>{(c.categoryCodes || []).map((x) => x.replace('pet_', '')).join(', ')}</Td>
                <Td muted>{c.boardingCapacity ? `${c.boardingCapacity} board` : ''}{c.daycareCapacity ? ` / ${c.daycareCapacity} day` : ''}</Td>
                <Td><StatusBadge status={c.verificationStatus} /></Td>
                <Td muted>{c.isDemo ? 'Yes' : ''}</Td>
                <Td>
                  {c.verificationStatus !== 'verified' && (
                    <button type="button" onClick={() => setStatus(c._id, 'verified')} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">Verify</button>
                  )}
                  {c.verificationStatus === 'verified' && (
                    <button type="button" onClick={() => setStatus(c._id, 'suspended')} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600">Suspend</button>
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

function PricingTab() {
  const { data, isLoading } = useAdminPetPricingQuery();
  const [category, setCategory] = useState(null);
  if (isLoading) return <PageLoader />;
  const rules = data?.rules || [];
  const categories = [...new Set(rules.map((r) => r.categoryCode))];
  const active = category || categories[0];
  const shown = rules.filter((r) => r.categoryCode === active);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button key={c} type="button" onClick={() => setCategory(c)}
            className={`rounded-lg px-3 py-1.5 text-sm font-bold capitalize transition ${c === active ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            {c.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {shown.map((r) => <RuleRow key={r._id} rule={r} />)}
      </div>
    </div>
  );
}

function RuleRow({ rule }) {
  const [update, { isLoading }] = useAdminUpdatePetPricingMutation();
  const [form, setForm] = useState({
    basePaise: (rule.basePaise || 0) / 100,
    perNightPaise: (rule.perNightPaise || 0) / 100,
    perDayPaise: (rule.perDayPaise || 0) / 100,
    perVisitPaise: (rule.perVisitPaise || 0) / 100,
    perMinutePaise: (rule.perMinutePaise || 0) / 100,
    perKmPaise: (rule.perKmPaise || 0) / 100,
    commissionPct: rule.commissionPct,
    minPaise: (rule.minPaise || 0) / 100,
    maxPaise: (rule.maxPaise || 0) / 100,
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    try {
      await update({
        id: rule._id,
        basePaise: Math.round(form.basePaise * 100),
        perNightPaise: Math.round(form.perNightPaise * 100),
        perDayPaise: Math.round(form.perDayPaise * 100),
        perVisitPaise: Math.round(form.perVisitPaise * 100),
        perMinutePaise: Math.round(form.perMinutePaise * 100),
        perKmPaise: Math.round(form.perKmPaise * 100),
        commissionPct: Number(form.commissionPct),
        minPaise: Math.round(form.minPaise * 100),
        maxPaise: Math.round(form.maxPaise * 100),
      }).unwrap();
      toast.success('Saved — live on the next quote');
    } catch (err) {
      toast.error(err?.data?.error || 'Could not save');
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-bold text-slate-900">{rule.variantCode || 'Category default'}</p>
          {rule.referenceNote && <p className="text-xs text-slate-400 mt-0.5">{rule.referenceNote}</p>}
        </div>
        <button type="button" onClick={save} disabled={isLoading}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
          {isLoading ? <Spinner size={13} /> : <Save size={13} />} Save
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <FormRow label="Base (₹)"><Input type="number" value={form.basePaise} onChange={(e) => set('basePaise', e.target.value)} /></FormRow>
        <FormRow label="Per night (₹)"><Input type="number" value={form.perNightPaise} onChange={(e) => set('perNightPaise', e.target.value)} /></FormRow>
        <FormRow label="Per day (₹)"><Input type="number" value={form.perDayPaise} onChange={(e) => set('perDayPaise', e.target.value)} /></FormRow>
        <FormRow label="Per visit (₹)"><Input type="number" value={form.perVisitPaise} onChange={(e) => set('perVisitPaise', e.target.value)} /></FormRow>
        <FormRow label="Per minute (₹)"><Input type="number" value={form.perMinutePaise} onChange={(e) => set('perMinutePaise', e.target.value)} /></FormRow>
        <FormRow label="Per km (₹)"><Input type="number" value={form.perKmPaise} onChange={(e) => set('perKmPaise', e.target.value)} /></FormRow>
        <FormRow label="Commission (%)"><Input type="number" value={form.commissionPct} onChange={(e) => set('commissionPct', e.target.value)} /></FormRow>
        <FormRow label="Min (₹)"><Input type="number" value={form.minPaise} onChange={(e) => set('minPaise', e.target.value)} /></FormRow>
        <FormRow label="Max (₹)"><Input type="number" value={form.maxPaise} onChange={(e) => set('maxPaise', e.target.value)} /></FormRow>
      </div>
    </Card>
  );
}
