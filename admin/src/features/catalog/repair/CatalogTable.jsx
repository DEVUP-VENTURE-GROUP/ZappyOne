import { useState } from 'react';
import ImageUploadField from '@shared/components/common/ImageUploadField';
import { Plus, Pencil, Archive, Loader2, X, Check, Search } from 'lucide-react';
import {
  useAdminRepairListQuery,
  useAdminRepairCreateMutation,
  useAdminRepairUpdateMutation,
  useAdminRepairArchiveMutation,
} from '@shared/services/api';
import { Card, Th, Td, EmptyState, Pagination, StatusBadge } from '../../../ui/kit';
import toast from 'react-hot-toast';

/**
 * Generic catalog CRUD table.
 *
 * Every repair catalog resource — brands, models, problems, repairs, parts —
 * is the same interaction: list, search, add, edit inline, archive. Writing one
 * table driven by a field spec keeps them consistent and means a new resource
 * costs a config array rather than another 200-line screen that drifts.
 *
 * Records are ARCHIVED, never deleted, because historical bookings still point
 * at them; the button says so plainly rather than implying destruction.
 */

/** Render a value for the read-only table cell. */
/** Does this field hold an image or video, by declared type or by key name? */
function isMediaField(field) {
  return field.type === 'image' || field.type === 'video'
    || /(imageUrl|logoUrl|photoUrl|iconUrl|coverImageUrl|videoUrl)$/i.test(field.key);
}

function displayValue(row, field) {
  const v = row[field.key];
  if (v == null || v === '') return <span className="text-slate-300">—</span>;
  if (field.type === 'boolean') return v ? <Check size={13} className="text-green-600" /> : <span className="text-slate-300">—</span>;
  if (field.type === 'array') return Array.isArray(v) ? v.slice(0, 3).join(', ') + (v.length > 3 ? ` +${v.length - 3}` : '') : String(v);
  if (field.type === 'money') return `₹${(v / 100).toLocaleString('en-IN')}`;
  if (field.type === 'status') return <StatusBadge status={String(v)} />;

  /*
   * An image column must show the IMAGE, not its address.
   *
   * This returned `String(v)` for media fields, so a saved logo appeared as a
   * long signed URL sprawled across the cell — and an unsaved one as a dash.
   * Either way the operator never saw the picture they had just uploaded and
   * read it as "not saved". A private-bucket key that has not been signed can
   * never load, so only an http(s) URL is rendered; a bare key falls back to a
   * small marker rather than a broken-image icon.
   */
  if (isMediaField(field)) {
    const loadable = /^https?:\/\//.test(String(v));
    const isVid = field.type === 'video' || /videoUrl$/i.test(field.key);
    if (!loadable) return <span className="text-[11px] text-slate-400" title={String(v)}>saved</span>;
    return isVid
      ? <video src={v} muted playsInline className="h-8 w-8 rounded object-cover" />
      : <img src={v} alt="" className="h-8 w-8 rounded object-cover" />;
  }

  return String(v);
}

/** One editable input, shaped by the field spec. */
function FieldInput({ field, value, onChange }) {
  const base = 'w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500';

  /**
   * Anything holding an image is UPLOADED, never typed.
   *
   * A text box labelled "Logo URL" asks an operator to go and host the file
   * themselves, then paste an address back — which most people cannot do, and
   * which leaves the catalog pointing at somebody else's server to rot. Matched
   * on the field key so a new image column gets the right control without
   * anyone having to remember to ask for it.
   */
  const isVideoField = field.type === 'video' || /videoUrl$/i.test(field.key);
  if (isVideoField
    || field.type === 'image'
    || /(imageUrl|logoUrl|photoUrl|iconUrl|coverImageUrl)$/i.test(field.key)) {
    return (
      <ImageUploadField
        value={value}
        onChange={onChange}
        folder={field.folder || 'catalog'}
        label={(field.label || 'image').toLowerCase().replace(/\s*url$/i, '')}
        // Video is heavier by nature, so it gets its own cap rather than
        // failing against an image-sized one.
        accept={isVideoField ? 'video/*' : 'image/*'}
        maxMb={isVideoField ? 25 : 5}
      />
    );
  }

  if (field.type === 'boolean') {
    return (
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`px-2.5 py-1 rounded-lg text-xs font-bold ${value ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}
      >
        {value ? 'Yes' : 'No'}
      </button>
    );
  }
  if (field.type === 'select') {
    return (
      <select className={base} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {field.options.map((o) => (
          <option key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>
            {typeof o === 'string' ? o : o.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'array') {
    return (
      <input
        className={base}
        value={Array.isArray(value) ? value.join(', ') : (value ?? '')}
        placeholder="comma, separated"
        onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
      />
    );
  }
  if (field.type === 'number' || field.type === 'money') {
    return (
      <input
        type="number"
        className={base}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    );
  }
  return <input className={base} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
}

export default function CatalogTable({ resource, title, fields, baseParams = {}, hint, vertical = 'mobile' }) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);   // row id, or 'new'
  const [draft, setDraft] = useState({});

  const { data, isFetching, refetch } = useAdminRepairListQuery({
    resource, vertical, page, ...(q ? { q } : {}), ...baseParams,
  });

  const [create, { isLoading: creating }] = useAdminRepairCreateMutation();
  const [update, { isLoading: updating }] = useAdminRepairUpdateMutation();
  const [archive] = useAdminRepairArchiveMutation();

  const items = data?.items || [];
  const editable = fields.filter((f) => !f.readOnly);

  function startNew() {
    const blank = {};
    for (const f of editable) blank[f.key] = f.type === 'boolean' ? false : f.type === 'array' ? [] : '';
    setDraft({ ...blank, ...baseParams });
    setEditing('new');
  }

  function startEdit(row) {
    const d = {};
    for (const f of editable) d[f.key] = row[f.key];
    setDraft(d);
    setEditing(row._id);
  }

  async function save() {
    try {
      // Strip empties so the server's own defaults apply rather than being
      // overwritten with blank strings.
      const payload = Object.fromEntries(
        Object.entries(draft).filter(([, v]) => v !== '' && v !== null && v !== undefined),
      );
      if (editing === 'new') await create({ resource, vertical, ...payload }).unwrap();
      else await update({ resource, vertical, id: editing, ...payload }).unwrap();
      toast.success(editing === 'new' ? `${title} added` : `${title} updated`);
      setEditing(null);
      refetch();
    } catch (err) {
      toast.error(err?.data?.error || 'Save failed');
    }
  }

  async function doArchive(row) {
    if (!window.confirm(`Archive "${row.name || row.code || row.sku}"?\n\nIt stays in the database — existing bookings that reference it keep working — but it will no longer be offered to customers.`)) return;
    try {
      await archive({ resource, vertical, id: row._id }).unwrap();
      toast.success('Archived');
      refetch();
    } catch (err) {
      toast.error(err?.data?.error || 'Archive failed');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-52"
              placeholder="Search…"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
            />
          </div>
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      <Card className="overflow-hidden">
        {isFetching && <div className="h-0.5 bg-blue-600 animate-pulse" />}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {fields.map((f) => <Th key={f.key}>{f.label}</Th>)}
                <Th right>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {editing === 'new' && (
                <tr className="bg-blue-50/40">
                  {fields.map((f) => (
                    <Td key={f.key}>
                      {f.readOnly ? <span className="text-slate-300">—</span>
                        : <FieldInput field={f} value={draft[f.key]} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />}
                    </Td>
                  ))}
                  <Td right>
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={save} disabled={creating} className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200">
                        {creating ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                      <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200">
                        <X size={13} />
                      </button>
                    </div>
                  </Td>
                </tr>
              )}

              {items.map((row) => {
                const isEditing = editing === row._id;
                return (
                  <tr key={row._id} className={`hover:bg-slate-50/60 transition-colors ${row.isArchived ? 'opacity-50' : ''}`}>
                    {fields.map((f) => (
                      <Td key={f.key}>
                        {isEditing && !f.readOnly
                          ? <FieldInput field={f} value={draft[f.key]} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
                          : displayValue(row, f)}
                      </Td>
                    ))}
                    <Td right>
                      <div className="flex items-center gap-1.5 justify-end">
                        {isEditing ? (
                          <>
                            <button onClick={save} disabled={updating} className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200">
                              {updating ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                            </button>
                            <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200">
                              <X size={13} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(row)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" title="Edit">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => doArchive(row)} className="p-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100" title="Archive">
                              <Archive size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!items.length && !isFetching && editing !== 'new' && <EmptyState message={`No ${title.toLowerCase()} yet`} />}
        </div>
        <div className="px-4 py-3 border-t border-slate-100">
          <Pagination page={page} total={data?.total} onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
        </div>
      </Card>
    </div>
  );
}
