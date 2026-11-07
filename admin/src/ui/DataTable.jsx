import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { Card, EmptyState, ErrorState, Pagination } from './kit';

const LIMIT_AT_ONCE = 4;

// Runs one call per row, a few at a time so the server is not flooded; reports how many worked.
export async function eachRow(rows, fn) {
  const queue = [...rows];
  let ok = 0;
  const failed = [];
  await Promise.all(Array.from({ length: Math.min(LIMIT_AT_ONCE, queue.length) }, async () => {
    while (queue.length) {
      const row = queue.shift();
      try { await fn(row); ok += 1; } catch (e) { failed.push({ row, error: e?.data?.error || e?.message }); }
    }
  }));
  return { ok, failed };
}

function cellValue(col, row) {
  if (col.sortValue) return col.sortValue(row);
  const v = row[col.key];
  return v == null ? '' : v;
}

/**
 * One table for every admin list.
 * columns: [{ key, header, render?(row), sortValue?(row), align?, width? }]
 * bulkActions: [{ label, tone?: 'danger', confirm?(rows) => string, run(rows) => Promise<{ ok, failed }> }]
 */
export default function DataTable({
  columns, rows = [], rowKey = (r) => r._id, loading = false, fetching = false, error = null, onRetry,
  empty = { message: 'Nothing here yet' }, onRowClick, bulkActions = [], page, total, limit = 50, onPage,
}) {
  const [sort, setSort] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [running, setRunning] = useState(null);
  const selectable = bulkActions.length > 0;

  const shown = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = cellValue(col, a); const y = cellValue(col, b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en-IN', { numeric: true })) * dir;
    });
  }, [rows, sort, columns]);

  const keys = shown.map(rowKey);
  const pickedRows = shown.filter((r) => picked.has(rowKey(r)));
  const allPicked = keys.length > 0 && keys.every((k) => picked.has(k));
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(keys));
  const toggle = (k) => setPicked((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const sortBy = (key) => setSort((s) => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));

  async function runBulk(action) {
    const list = pickedRows;
    if (!list.length) return;
    const ask = action.confirm?.(list);
    if (ask && !window.confirm(ask)) return;
    setRunning(action.label);
    try {
      const { ok, failed } = await action.run(list);
      if (ok) toast.success(`${action.label}: ${ok} done`);
      if (failed.length) toast.error(`${failed.length} could not be changed${failed[0].error ? `: ${failed[0].error}` : ''}`);
      setPicked(new Set(failed.map((f) => rowKey(f.row))));
    } finally {
      setRunning(null);
    }
  }

  const span = columns.length + (selectable ? 1 : 0);
  return (
    <Card className="overflow-hidden">
      {fetching && !loading && <div className="h-1 animate-pulse bg-blue-600" />}
      {selectable && pickedRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2.5">
          <span className="text-[13px] font-bold text-blue-900">{pickedRows.length} selected</span>
          <button type="button" onClick={() => setPicked(new Set())} className="flex items-center gap-1 text-[12px] font-semibold text-blue-700 hover:underline"><X size={12} /> Clear</button>
          <div className="ml-auto flex flex-wrap gap-2">
            {bulkActions.map((a) => (
              <button key={a.label} type="button" disabled={!!running} onClick={() => runBulk(a)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold disabled:opacity-50 ${a.tone === 'danger' ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
                {running === a.label && <Loader2 size={13} className="animate-spin" />}{a.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <div className="p-4"><ErrorState onRetry={onRetry} /></div>}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              {selectable && (
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label="Select all on this page" className="h-4 w-4 accent-blue-600" />
                </th>
              )}
              {columns.map((c) => {
                const on = sort?.key === c.key;
                const sortable = c.sortable !== false && !!c.header;
                return (
                  <th key={c.key} scope="col" style={c.width ? { width: c.width } : undefined} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={`whitespace-nowrap px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                    {sortable ? (
                      <button type="button" onClick={() => sortBy(c.key)} className={`inline-flex items-center gap-1 hover:text-slate-700 ${on ? 'text-slate-700' : ''}`}>
                        {c.header}{on ? (sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ChevronsUpDown size={11} className="opacity-40" />}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && Array.from({ length: 6 }, (_, i) => (
              <tr key={`s${i}`}><td colSpan={span} className="px-4 py-3"><div className="h-5 animate-pulse rounded bg-slate-100" /></td></tr>
            ))}
            {!loading && shown.map((row) => {
              const k = rowKey(row);
              return (
                <tr key={k} onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row); } : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={`transition-colors ${picked.has(k) ? 'bg-blue-50/50' : 'hover:bg-slate-50/80'} ${onRowClick ? 'cursor-pointer focus:bg-slate-50 focus:outline-none' : ''}`}>
                  {selectable && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={picked.has(k)} onChange={() => toggle(k)} aria-label="Select row" className="h-4 w-4 accent-blue-600" />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-3 text-sm text-slate-700 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                      {c.render ? c.render(row) : (row[c.key] ?? '-')}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && !error && !shown.length && <EmptyState message={empty.message} icon={empty.icon} />}
      </div>
      {onPage && (
        <div className="border-t border-slate-100 px-4 py-3">
          <Pagination page={page} total={total} limit={limit} onPrev={() => { setPicked(new Set()); onPage(page - 1); }} onNext={() => { setPicked(new Set()); onPage(page + 1); }} />
        </div>
      )}
    </Card>
  );
}
