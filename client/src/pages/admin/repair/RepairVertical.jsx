import { useState } from 'react';
import {
  Smartphone, Layers, Wrench, Package, Tag, ShieldCheck, IndianRupee,
  Inbox, Settings, ClipboardList, Loader2, Check, X, TrendingUp, Search, Cpu, Boxes,
} from 'lucide-react';
import {
  useAdminRepairDashboardQuery,
  useAdminRepairPendingPricesQuery,
  useAdminDecideRepairPriceMutation,
  useAdminRepairCatalogRequestsQuery,
  useAdminRepairIdentificationsQuery,
  useAdminResolveRepairIdentificationMutation,
  useAdminApproveCatalogRequestMutation,
  useAdminRejectCatalogRequestMutation,
  useAdminRepairConfigQuery,
  useAdminUpdateRepairConfigMutation,
  useAdminRepairBookingsQuery,
} from '../../../services/api';
import { SectionHeader, Card, StatCard, Th, Td, EmptyState, PageLoader, StatusBadge, fmt, fmtDate } from '../_shared';
import CatalogTable from './CatalogTable';
import toast from 'react-hot-toast';

/**
 * Repair admin console — one screen serving every repair vertical.
 *
 * Reached from Services → Mobile / Laptop. The vertical is a PROP, not a copy:
 * duplicating this file per vertical is how two consoles drift into disagreeing
 * about the same catalog, and it is what §91 exists to prevent.
 *
 * Tabs map to the entities an operator actually manages; each catalog tab is
 * the shared CatalogTable driven by a field spec, so a new resource costs a
 * spec entry rather than another screen.
 *
 * Nothing here hardcodes a brand, model, problem or price — every value is read
 * from and written to the database (§1).
 */

/**
 * Columns that only make sense for some verticals.
 *
 * A phone has storage variants; a laptop has a product family, a series and a
 * configuration, because "HP Pavilion" spans hundreds of incompatible machines.
 * Showing every column everywhere would train operators to ignore the ones that
 * matter.
 */
const VERTICAL_MODEL_FIELDS = {
  mobile: [
    { key: 'storageVariants', label: 'Storage', type: 'array' },
    { key: 'ramVariants', label: 'RAM', type: 'array' },
  ],
  laptop: [
    { key: 'productTypeCode', label: 'Type' },
    { key: 'familyCode', label: 'Family' },
    { key: 'productNumbers', label: 'Product no.', type: 'array' },
  ],
};

/* Field specs — the shape of each catalog resource's editable columns. */
const SPECS = {
  brands: {
    title: 'Brands',
    hint: 'Shown to customers in this order. Popular brands surface first on the booking screen.',
    fields: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'logoUrl', label: 'Logo', type: 'image', folder: 'brands' },
      { key: 'sortOrder', label: 'Order', type: 'number' },
      { key: 'isActive', label: 'Active', type: 'boolean' },
    ],
  },
  models: {
    title: 'Models',
    hint: 'Belongs to a brand. Order decides where it sits in the customer list — lower is higher up, and 0 pins it to the top. Laptops need a Family or they cannot be reached in the customer flow. Comma-separated lists for multi-value columns.',
    fields: [
      { key: 'brandCode', label: 'Brand' },
      { key: 'name', label: 'Model' },
      { key: 'code', label: 'Code' },
      { key: 'seriesName', label: 'Series' },
      // Laptops are found Brand → Type → Family → Model, so a model with no
      // family is invisible in that flow however correct the rest of it is.
      { key: 'familyCode', label: 'Family' },
      // The curated position. Seeded models carry their place in the founder's
      // list; sorting is sortOrder first, so this is what actually orders the
      // screen a customer sees.
      { key: 'sortOrder', label: 'Order', type: 'number' },
      { key: 'imageUrl', label: 'Photo', type: 'image', folder: 'device-models' },
      { key: 'storageVariants', label: 'Storage', type: 'array' },
      { key: 'launchYear', label: 'Year', type: 'number' },
      { key: 'isActive', label: 'Active', type: 'boolean' },
    ],
  },
  'problem-categories': {
    title: 'Problem Categories',
    hint: 'The headings a customer sees on the home page. Each one opens its own page of issues; the photo is shown on the tile.',
    fields: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'imageUrl', label: 'Photo', type: 'image', folder: 'problem-categories' },
      { key: 'icon', label: 'Icon' },
      { key: 'displayOrder', label: 'Order', type: 'number' },
      { key: 'isActive', label: 'Active', type: 'boolean' },
    ],
  },
  problems: {
    title: 'Problems',
    hint: 'What the CUSTOMER reports — a symptom, not a repair. "Requires diagnosis" forces a quote before any price is shown.',
    fields: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Symptom' },
      /*
       * A symptom is far easier to recognise than to describe: "flickering"
       * and "lines on the display" are the same words until you see them. The
       * clip is for the ones a still cannot carry — a flicker, a boot loop.
       */
      { key: 'imageUrl', label: 'Photo', type: 'image', folder: 'problems' },
      { key: 'videoUrl', label: 'Clip', type: 'video', folder: 'problems' },
      { key: 'categoryCode', label: 'Category' },
      { key: 'candidateRepairCodes', label: 'Possible repairs', type: 'array' },
      { key: 'diagnosticFlowCode', label: 'Flow' },
      { key: 'requiresDiagnosis', label: 'Needs diagnosis', type: 'boolean' },
      { key: 'severity', label: 'Severity', type: 'select', options: ['low', 'normal', 'high', 'critical'] },
      { key: 'isPopular', label: 'Popular', type: 'boolean' },
      { key: 'isActive', label: 'Active', type: 'boolean' },
    ],
  },
  repairs: {
    title: 'Repairs',
    hint: 'What actually gets DONE. Pricing mode decides whether a customer sees a firm price, a range, or diagnosis-first.',
    fields: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Repair' },
      { key: 'problemCodes', label: 'Resolves', type: 'array' },
      { key: 'pricingMode', label: 'Pricing', type: 'select', options: ['fixed', 'range', 'diagnosis_required'] },
      { key: 'minSkillLevel', label: 'Min skill', type: 'number' },
      { key: 'allowedServiceModes', label: 'Modes', type: 'array' },
      { key: 'estimatedDurationMin', label: 'Mins', type: 'number' },
      { key: 'warrantyDays', label: 'Warranty', type: 'number' },
      { key: 'isActive', label: 'Active', type: 'boolean' },
    ],
  },
  parts: {
    title: 'Parts',
    hint: 'Never label an aftermarket part as genuine — quality grades carry that flag explicitly.',
    fields: [
      { key: 'sku', label: 'SKU' },
      { key: 'name', label: 'Part' },
      { key: 'componentCode', label: 'Component' },
      { key: 'brandCode', label: 'Brand' },
      { key: 'compatibleModelCodes', label: 'Fits models', type: 'array' },
      { key: 'qualityCode', label: 'Quality' },
      { key: 'manufacturerPartNumber', label: 'Mfr part no.' },
      { key: 'costPaise', label: 'Cost', type: 'money' },
      { key: 'sellingPricePaise', label: 'Sell', type: 'money' },
      { key: 'warrantyDays', label: 'Warranty', type: 'number' },
      { key: 'isActive', label: 'Active', type: 'boolean' },
    ],
  },
  'part-qualities': {
    title: 'Part Quality Grades',
    hint: '"Genuine" is a legal claim — only set it for parts genuinely sourced through the OEM channel.',
    fields: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Grade' },
      { key: 'isGenuine', label: 'Genuine', type: 'boolean' },
      { key: 'rank', label: 'Rank', type: 'number' },
      { key: 'defaultWarrantyDays', label: 'Warranty', type: 'number' },
      { key: 'isActive', label: 'Active', type: 'boolean' },
    ],
  },
  'skill-levels': {
    title: 'Skill Levels',
    hint: 'Levels needing verification cannot be self-claimed by a provider.',
    fields: [
      { key: 'level', label: 'Level', type: 'number' },
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
      { key: 'requiresVerification', label: 'Verify', type: 'boolean' },
      { key: 'isActive', label: 'Active', type: 'boolean' },
    ],
  },
  'qa-checklists': {
    title: 'QA Checklists',
    hint: 'A failed REQUIRED item blocks job completion.',
    fields: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Checklist' },
      { key: 'stage', label: 'Stage', type: 'select', options: ['before', 'after', 'both'] },
      { key: 'repairCodes', label: 'Repairs', type: 'array' },
      { key: 'isActive', label: 'Active', type: 'boolean' },
    ],
  },
  suppliers: {
    title: 'Suppliers',
    fields: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Supplier' },
      { key: 'contactName', label: 'Contact' },
      { key: 'phone', label: 'Phone' },
      { key: 'gstNumber', label: 'GST' },
      { key: 'isActive', label: 'Active', type: 'boolean' },
    ],
  },
  'product-types': {
    title: 'Product types',
    hint: 'The kind of machine — laptop, gaming laptop, MacBook. Popular types surface first for customers.',
    fields: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
      { key: 'displayOrder', label: 'Order', type: 'number' },
      { key: 'isPopular', label: 'Popular', type: 'boolean' },
      { key: 'isActive', label: 'Active', type: 'boolean' },
    ],
  },
  'product-families': {
    title: 'Families',
    hint: 'The product line — Pavilion, ThinkPad, ROG. Belongs to a brand, optionally scoped to a product type.',
    fields: [
      { key: 'brandCode', label: 'Brand' },
      { key: 'productTypeCode', label: 'Type' },
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'displayOrder', label: 'Order', type: 'number' },
      { key: 'isPopular', label: 'Popular', type: 'boolean' },
      { key: 'isActive', label: 'Active', type: 'boolean' },
    ],
  },
  'product-series': {
    title: 'Series',
    hint: 'A generation within a family — ThinkPad E Series, Pavilion 15. Used to group long model lists.',
    fields: [
      { key: 'brandCode', label: 'Brand' },
      { key: 'familyCode', label: 'Family' },
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'displayOrder', label: 'Order', type: 'number' },
      { key: 'isActive', label: 'Active', type: 'boolean' },
    ],
  },
  configurations: {
    title: 'Configurations',
    hint: 'The exact build of one model. This is where part compatibility resolves — two builds of the same laptop take different panels.',
    fields: [
      { key: 'modelCode', label: 'Model' },
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Label' },
      { key: 'displaySize', label: 'Screen' },
      { key: 'displayResolution', label: 'Resolution' },
      { key: 'isTouch', label: 'Touch', type: 'boolean' },
      { key: 'ramGb', label: 'RAM GB', type: 'number' },
      { key: 'ramType', label: 'RAM type' },
      { key: 'storageGb', label: 'Storage GB', type: 'number' },
      { key: 'storageType', label: 'Storage type' },
      { key: 'partNumber', label: 'Part no.' },
      { key: 'isActive', label: 'Active', type: 'boolean' },
    ],
  },
};

/**
 * Tabs.
 *
 * `deep` marks the ones that only exist for verticals identified below
 * model level. Mobile hides them because a phone has no families or builds,
 * and a console full of tabs that never apply teaches operators to skim.
 */
const TABS = [
  { id: 'overview', label: 'Overview', icon: TrendingUp },
  { id: 'brands', label: 'Brands', icon: Tag },
  { id: 'product-types', label: 'Types', icon: Cpu, deep: true },
  { id: 'product-families', label: 'Families', icon: Boxes, deep: true },
  { id: 'product-series', label: 'Series', icon: Layers, deep: true },
  { id: 'models', label: 'Models', icon: Smartphone },
  { id: 'configurations', label: 'Builds', icon: Cpu, deep: true },
  { id: 'identification', label: 'Identification', icon: Search, deep: true },
  { id: 'problem-categories', label: 'Categories', icon: Layers },
  { id: 'problems', label: 'Problems', icon: ClipboardList },
  { id: 'repairs', label: 'Repairs', icon: Wrench },
  { id: 'parts', label: 'Parts', icon: Package },
  { id: 'part-qualities', label: 'Quality', icon: ShieldCheck },
  { id: 'skill-levels', label: 'Skills', icon: ShieldCheck },
  { id: 'qa-checklists', label: 'QA', icon: ClipboardList },
  { id: 'suppliers', label: 'Suppliers', icon: Package },
  { id: 'pricing', label: 'Price Approvals', icon: IndianRupee },
  { id: 'requests', label: 'Customer Requests', icon: Inbox },
  { id: 'bookings', label: 'Bookings', icon: ClipboardList },
  { id: 'config', label: 'Configuration', icon: Settings },
];

/* ─── Overview ─────────────────────────────────────────────────────────── */

function Overview({ vertical }) {
  const { data, isLoading } = useAdminRepairDashboardQuery(vertical);
  if (isLoading) return <PageLoader />;

  const byStatus = data?.bookingsByStatus || {};
  const active = Object.entries(byStatus)
    .filter(([s]) => !['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED'].includes(s));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Completed repairs" value={data?.completed || 0} Icon={Check} color="text-green-600" bg="bg-green-50" />
        <StatCard label="Revenue" value={fmt(data?.revenuePaise || 0)} Icon={IndianRupee} color="text-indigo-600" bg="bg-indigo-50" />
        <StatCard label="Commission" value={fmt(data?.commissionPaise || 0)} Icon={TrendingUp} color="text-blue-600" bg="bg-blue-50" />
        <StatCard
          label="Active bookings"
          value={active.reduce((n, [, c]) => n + c, 0)}
          Icon={ClipboardList} color="text-amber-600" bg="bg-amber-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {[
          { label: 'Provider prices awaiting review', value: data?.queues?.pendingProviderPrices || 0, tone: 'text-amber-700 bg-amber-50' },
          { label: 'Customer catalog requests', value: data?.queues?.pendingCatalogRequests || 0, tone: 'text-blue-700 bg-blue-50' },
          { label: 'Open warranty claims', value: data?.queues?.openWarrantyClaims || 0, tone: 'text-red-700 bg-red-50' },
        ].map((q) => (
          <Card key={q.label} className="p-4">
            <p className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${q.tone}`}>Queue</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-2">{q.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{q.label}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-3">Bookings by status</p>
        {Object.keys(byStatus).length === 0 ? (
          <p className="text-sm text-slate-400">No bookings yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(byStatus).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5">
                <span className="text-xs font-semibold text-slate-600">{status.replace(/_/g, ' ').toLowerCase()}</span>
                <span className="text-xs font-black text-slate-900">{count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ─── Provider price approvals (§12/§68) ───────────────────────────────── */

function PriceApprovals({ vertical }) {
  const { data, isLoading, refetch } = useAdminRepairPendingPricesQuery();
  const [decide, { isLoading: deciding }] = useAdminDecideRepairPriceMutation();

  if (isLoading) return <PageLoader />;
  const items = data?.items || [];

  async function act(id, decision) {
    try {
      await decide({ id, decision, note: '' }).unwrap();
      toast.success(decision === 'approve' ? 'Price approved' : 'Price rejected');
      refetch();
    } catch (err) { toast.error(err?.data?.error || 'Failed'); }
  }

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Provider price approvals"
        subtitle="Each price is judged against the Zappy reference band for the same repair, model and quality."
      />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <Th>Repair</Th><Th>Model</Th><Th>Quality</Th>
                <Th>Provider price</Th><Th>Zappy reference</Th><Th>Deviation</Th><Th right>Decision</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((row) => {
                const ref = row.reference?.recommendedPaise;
                const dev = ref ? ((row.totalPaise - ref) / ref) * 100 : null;
                const band = dev == null ? 'unknown' : dev <= 15 ? 'green' : dev <= 35 ? 'yellow' : 'red';
                const bandCls = { green: 'bg-green-100 text-green-700', yellow: 'bg-amber-100 text-amber-700', red: 'bg-red-100 text-red-700', unknown: 'bg-slate-100 text-slate-600' }[band];
                return (
                  <tr key={row._id} className="hover:bg-slate-50/60">
                    <Td>{row.repairCode}</Td>
                    <Td muted>{row.modelCode || 'any'}</Td>
                    <Td muted>{row.qualityCode || 'any'}</Td>
                    <Td><span className="font-semibold">{fmt(row.totalPaise)}</span></Td>
                    <Td muted>{ref ? fmt(ref) : <span className="text-amber-600">none set</span>}</Td>
                    <Td>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${bandCls}`}>
                        {dev == null ? 'no reference' : `${dev > 0 ? '+' : ''}${dev.toFixed(1)}%`}
                      </span>
                    </Td>
                    <Td right>
                      <div className="flex items-center gap-1.5 justify-end">
                        <button onClick={() => act(row._id, 'approve')} disabled={deciding}
                          className="px-2.5 py-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 text-xs font-bold">
                          Approve
                        </button>
                        <button onClick={() => act(row._id, 'reject')} disabled={deciding}
                          className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 text-xs font-bold">
                          Reject
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!items.length && <EmptyState message="No prices awaiting review" icon={IndianRupee} />}
        </div>
      </Card>
    </div>
  );
}

/* ─── Customer catalog requests (§67) ──────────────────────────────────── */

function CatalogRequests({ vertical }) {
  const { data, isLoading, refetch } = useAdminRepairCatalogRequestsQuery({ vertical, status: 'pending' });
  const [approve] = useAdminApproveCatalogRequestMutation();
  const [reject] = useAdminRejectCatalogRequestMutation();
  const [form, setForm] = useState({});

  if (isLoading) return <PageLoader />;
  const items = data?.items || [];

  async function doApprove(row) {
    const f = form[row._id] || {};
    try {
      await approve({
        id: row._id,
        code: f.code || '',
        name: f.name || row.modelName || row.brandName,
        brandCode: f.brandCode || '',
      }).unwrap();
      toast.success('Request approved and added to the catalog');
      refetch();
    } catch (err) { toast.error(err?.data?.error || 'Failed'); }
  }

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Customer catalog requests"
        subtitle="Phones and brands customers asked for that the catalog does not carry yet. Approving one creates the real record."
      />
      {!items.length && <EmptyState message="No pending requests" icon={Inbox} />}
      {items.map((row) => (
        <Card key={row._id} className="p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold uppercase">{row.kind}</span>
                {row.requestCount > 1 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-bold">
                    asked {row.requestCount}×
                  </span>
                )}
              </div>
              <p className="font-bold text-slate-900 mt-1.5">
                {[row.brandName, row.modelName, row.variantName].filter(Boolean).join(' ') || row.problemText}
              </p>
              {row.notes && <p className="text-xs text-slate-500 mt-0.5">{row.notes}</p>}
              <p className="text-[11px] text-slate-400 mt-1">{fmtDate(row.createdAt)}</p>
            </div>

            <div className="flex items-end gap-2 flex-wrap">
              {row.kind === 'model' && (
                <input
                  placeholder="brand code"
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm w-28 outline-none focus:ring-2 focus:ring-blue-500"
                  value={form[row._id]?.brandCode || ''}
                  onChange={(e) => setForm((f) => ({ ...f, [row._id]: { ...f[row._id], brandCode: e.target.value } }))}
                />
              )}
              <input
                placeholder="new code"
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm w-36 outline-none focus:ring-2 focus:ring-blue-500"
                value={form[row._id]?.code || ''}
                onChange={(e) => setForm((f) => ({ ...f, [row._id]: { ...f[row._id], code: e.target.value } }))}
              />
              <button onClick={() => doApprove(row)}
                className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold">
                Approve &amp; create
              </button>
              <button onClick={async () => { await reject({ id: row._id, note: '' }).unwrap(); refetch(); }}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold">
                Reject
              </button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}


/* ─── Model identification queue ───────────────────────────────────────── */

/**
 * Customers who could not name their machine (§7).
 *
 * Someone is waiting on each of these rows, and the answer decides which part
 * gets ordered — so resolving one means naming a real model in THIS vertical,
 * not writing a note. Marking it unidentifiable is a legitimate outcome too:
 * telling the customer we need a photo of the sticker beats guessing.
 */
function IdentificationQueue({ vertical }) {
  const { data, isLoading, refetch } = useAdminRepairIdentificationsQuery({ vertical, status: 'pending' });
  const [resolve, { isLoading: saving }] = useAdminResolveRepairIdentificationMutation();
  const [form, setForm] = useState({});

  if (isLoading) return <PageLoader />;
  const items = data?.items || [];

  function patch(id, key, value) {
    setForm((f) => ({ ...f, [id]: { ...f[id], [key]: value } }));
  }

  async function decide(row, status) {
    const f = form[row._id] || {};
    try {
      await resolve({
        id: row._id,
        status,
        modelCode: f.modelCode || undefined,
        configurationCode: f.configurationCode || undefined,
        note: f.note || '',
      }).unwrap();
      toast.success(status === 'identified' ? 'Identified — customer notified' : 'Closed');
      refetch();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not resolve this');
    }
  }

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Model identification"
        subtitle="Customers who could not identify their device. Each one is blocked until someone here names the machine."
      />
      {!items.length && <EmptyState message="Nothing waiting to be identified" icon={Search} />}
      {items.map((row) => (
        <Card key={row._id} className="p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="font-bold text-slate-900">
                {row.brandName || row.brandCode || 'Unknown brand'}
                {row.modelText ? ` · ${row.modelText}` : ''}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                {row.productNumber && (
                  <span className="text-xs text-slate-600">
                    Product no. <span className="font-mono font-semibold">{row.productNumber}</span>
                  </span>
                )}
                {row.serialNumber && (
                  <span className="text-xs text-slate-600">
                    Serial <span className="font-mono font-semibold">{row.serialNumber}</span>
                  </span>
                )}
              </div>
              {row.notes && <p className="text-xs text-slate-500 mt-1">{row.notes}</p>}
              {row.imageUrls?.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {row.imageUrls.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer"
                      className="text-xs font-semibold text-blue-600 underline">
                      photo
                    </a>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-slate-400 mt-1">{fmtDate(row.createdAt)}</p>
            </div>

            <div className="flex items-end gap-2 flex-wrap">
              <input
                placeholder="model code"
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm w-44 outline-none focus:ring-2 focus:ring-blue-500"
                value={form[row._id]?.modelCode || ''}
                onChange={(e) => patch(row._id, 'modelCode', e.target.value)}
              />
              <input
                placeholder="configuration (optional)"
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm w-44 outline-none focus:ring-2 focus:ring-blue-500"
                value={form[row._id]?.configurationCode || ''}
                onChange={(e) => patch(row._id, 'configurationCode', e.target.value)}
              />
              <input
                placeholder="note to customer"
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm w-52 outline-none focus:ring-2 focus:ring-blue-500"
                value={form[row._id]?.note || ''}
                onChange={(e) => patch(row._id, 'note', e.target.value)}
              />
              <button onClick={() => decide(row, 'identified')} disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold disabled:opacity-60">
                {saving ? <Loader2 size={13} className="animate-spin" /> : 'Identified'}
              </button>
              <button onClick={() => decide(row, 'unidentifiable')} disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold">
                Need more info
              </button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ─── Bookings ─────────────────────────────────────────────────────────── */

function Bookings({ vertical }) {
  const { data, isLoading } = useAdminRepairBookingsQuery({ limit: 50, vertical });
  if (isLoading) return <PageLoader />;
  const items = data?.items || [];

  return (
    <div className="space-y-3">
      <SectionHeader title="Repair bookings" subtitle={`${data?.total ?? 0} total`} />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <Th>Ref</Th><Th>Device</Th><Th>Repair</Th><Th>Mode</Th><Th>Status</Th><Th>Total</Th><Th>Created</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((b) => (
                <tr key={b._id} className="hover:bg-slate-50/60">
                  <Td mono>{b.reference}</Td>
                  <Td muted>{b.brandCode} {b.modelCode}</Td>
                  <Td>{b.repairCode || <span className="text-amber-600">diagnosis</span>}</Td>
                  <Td muted>{(b.serviceMode || '').replace(/_/g, ' ')}</Td>
                  <Td><StatusBadge status={(b.status || '').toLowerCase()} /></Td>
                  <Td><span className="font-semibold">{fmt(b.priceSnapshot?.totalPaise || 0)}</span></Td>
                  <Td muted>{fmtDate(b.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length && <EmptyState message="No repair bookings yet" icon={ClipboardList} />}
        </div>
      </Card>
    </div>
  );
}

/* ─── Configuration (§42) ──────────────────────────────────────────────── */

const CONFIG_FIELDS = [
  { group: 'Price approval bands', keys: [
    ['greenMaxDeviationPct', 'Green — auto-approve up to (%)'],
    ['yellowMaxDeviationPct', 'Yellow — review up to (%)'],
    ['autoApproveGreen', 'Auto-approve green prices', 'bool'],
    ['blockRed', 'Block red prices', 'bool'],
  ] },
  { group: 'Platform economics', keys: [
    ['commissionPct', 'Commission from provider (%)'],
    ['taxPct', 'Tax (%)'],
    ['platformFeePaise', 'Platform fee — charged to customer (₹)', 'money'],
    ['diagnosisFeePaise', 'Inspection fee (₹)', 'money'],
    ['inspectionFeeCreditedOnRepair', 'Credit inspection fee against repair', 'bool'],
    ['pickupFeePaise', 'Pickup fee (₹)', 'money'],
    ['returnFeePaise', 'Return fee (₹)', 'money'],
  ] },
  { group: 'Matching', keys: [
    ['serviceRadiusKm', 'Service radius (km)'],
    ['maxProvidersShown', 'Max providers shown'],
  ] },
  { group: 'Windows', keys: [
    ['quoteExpiryHours', 'Quote expiry (hours)'],
    ['bookingExpiryMinutes', 'Booking expiry (min)'],
    ['warrantyDefaultDays', 'Default warranty (days)'],
    ['cancellationWindowMinutes', 'Free cancellation (min)'],
  ] },
];

function Configuration({ vertical }) {
  const { data, isLoading } = useAdminRepairConfigQuery(vertical);
  const [save, { isLoading: saving }] = useAdminUpdateRepairConfigMutation();
  const [draft, setDraft] = useState(null);

  if (isLoading) return <PageLoader />;
  const cfg = draft ?? data?.config ?? {};

  async function submit() {
    try {
      // Strip mongo bookkeeping so the server writes a clean new version.
      const { _id, __v, createdAt, updatedAt, version, supersededAt, ...payload } = cfg;
      await save({ ...payload, vertical }).unwrap();
      toast.success('Configuration saved — a new version was written');
      setDraft(null);
    } catch (err) { toast.error(err?.data?.error || 'Save failed'); }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Configuration"
        subtitle={`Version ${data?.config?.version ?? 1} — changes take effect immediately, no deployment needed.`}
      >
        <button onClick={submit} disabled={saving || !draft}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm px-4 py-2 rounded-lg transition">
          {saving && <Loader2 size={14} className="animate-spin" />} Save changes
        </button>
      </SectionHeader>

      {CONFIG_FIELDS.map((section) => (
        <Card key={section.group} className="p-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-3">{section.group}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {section.keys.map(([key, label, type]) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
                {type === 'bool' ? (
                  <button
                    onClick={() => setDraft({ ...cfg, [key]: !cfg[key] })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${cfg[key] ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {cfg[key] ? 'Enabled' : 'Disabled'}
                  </button>
                ) : type === 'money' ? (
                  /*
                   * Rupees on screen, paise in the document.
                   *
                   * These fields were labelled "(paise)" and an operator typing
                   * the obvious 15 set the platform fee to fifteen PAISE — which
                   * is exactly what happened and shipped. Nobody prices anything
                   * in paise, so nobody should be asked to.
                   */
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="w-full bg-white border border-slate-200 rounded-lg pl-7 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      value={cfg[key] == null ? '' : cfg[key] / 100}
                      onChange={(e) => setDraft({
                        ...cfg,
                        [key]: e.target.value === '' ? 0 : Math.round(Number(e.target.value) * 100),
                      })}
                    />
                  </div>
                ) : (
                  <input
                    type="number"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    value={cfg[key] ?? ''}
                    onChange={(e) => setDraft({ ...cfg, [key]: Number(e.target.value) })}
                  />
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ─── Shell ────────────────────────────────────────────────────────────── */

/**
 * `deepCatalog` says this vertical identifies devices below model level.
 * It is a property of the vertical rather than of the data, because admin
 * has to be able to create the FIRST product type — gating the tabs on
 * whether any exist would lock the operator out of bootstrapping them.
 */
export default function RepairVertical({ vertical = 'mobile', label = 'Mobile Repair', blurb, deepCatalog = false }) {
  const [tab, setTab] = useState('overview');

  const tabs = TABS.filter((t) => !t.deep || deepCatalog);

  function renderTab() {
    if (tab === 'overview') return <Overview vertical={vertical} />;
    if (tab === 'pricing') return <PriceApprovals vertical={vertical} />;
    if (tab === 'requests') return <CatalogRequests vertical={vertical} />;
    if (tab === 'bookings') return <Bookings vertical={vertical} />;
    if (tab === 'config') return <Configuration vertical={vertical} />;
    if (tab === 'identification') return <IdentificationQueue vertical={vertical} />;

    const spec = SPECS[tab];
    if (!spec) return null;

    // Splice the vertical's own columns in before the Active toggle, so the
    // trailing control stays where operators expect it.
    let fields = spec.fields;
    if (tab === 'models') {
      const extra = VERTICAL_MODEL_FIELDS[vertical] || [];
      const cut = fields.findIndex((f) => f.key === 'isActive');
      fields = [...fields.slice(0, cut), ...extra, ...fields.slice(cut)];
    }

    return (
      <CatalogTable
        key={`${vertical}:${tab}`}
        vertical={vertical}
        resource={tab}
        title={spec.title}
        hint={spec.hint}
        fields={fields}
        baseParams={spec.baseParams || {}}
      />
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title={label}
        subtitle={blurb || `Catalog, pricing and operations for the ${vertical} repair vertical.`}
      />

      {/* Tab rail — horizontally scrollable so it survives narrow windows. */}
      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                isActive ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {renderTab()}
    </div>
  );
}
