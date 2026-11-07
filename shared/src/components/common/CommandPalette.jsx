import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';

const norm = (s) => String(s || '').toLowerCase();

// Ctrl/Cmd+K or "/" (when not typing) opens it from anywhere; Esc closes.
export function usePaletteKeys(setOpen) {
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === '/' && !typing) { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);
}

/** items: [{ id, label, group?, hint?, Icon?, keywords?, onSelect }] */
export default function CommandPalette({ open, onClose, items, placeholder = 'Go to a page…' }) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const input = useRef(null);
  const list = useRef(null);

  const shown = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return items;
    return items
      .map((i) => ({ i, hay: norm(`${i.label} ${i.group || ''} ${i.keywords || ''}`), start: norm(i.label).startsWith(words[0]) }))
      .filter((x) => words.every((w) => x.hay.includes(w)))
      .sort((a, b) => Number(b.start) - Number(a.start))
      .map((x) => x.i);
  }, [items, q]);

  useEffect(() => { if (open) { setQ(''); setAt(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);
  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => { list.current?.querySelector(`[data-i="${at}"]`)?.scrollIntoView({ block: 'nearest' }); }, [at]);

  if (!open) return null;
  const pick = (item) => { onClose(); item?.onSelect(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setAt((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(shown[at]); }
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-start justify-center bg-slate-900/40 px-4 pt-[12vh]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Go to a page" className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-4">
          <Search size={17} className="shrink-0 text-slate-400" aria-hidden="true" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={placeholder}
            role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={shown[at] ? `palette-${shown[at].id}` : undefined}
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400" />
          <kbd className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-400 sm:block">Esc</kbd>
        </div>
        <ul ref={list} id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
          {shown.length === 0 && <li className="px-3 py-8 text-center text-[14px] text-slate-500">Nothing matches &ldquo;{q}&rdquo;</li>}
          {shown.map((item, i) => (
            <li key={item.id} id={`palette-${item.id}`} data-i={i} role="option" aria-selected={i === at}
              onMouseMove={() => setAt(i)} onClick={() => pick(item)}
              className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${i === at ? 'bg-slate-100' : ''}`}>
              {item.Icon && <item.Icon size={16} className="shrink-0 text-slate-500" aria-hidden="true" />}
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-slate-800">{item.label}</span>
              {item.group && <span className="shrink-0 text-[12px] text-slate-400">{item.group}</span>}
              {i === at && <CornerDownLeft size={13} className="shrink-0 text-slate-400" aria-hidden="true" />}
            </li>
          ))}
        </ul>
        <p className="border-t border-slate-100 px-4 py-2 text-[11.5px] text-slate-400">
          <kbd className="font-semibold">↑</kbd> <kbd className="font-semibold">↓</kbd> to move · <kbd className="font-semibold">Enter</kbd> to open · <kbd className="font-semibold">Ctrl K</kbd> or <kbd className="font-semibold">/</kbd> from anywhere
        </p>
      </div>
    </div>
  );
}
