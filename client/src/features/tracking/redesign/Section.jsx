import { ChevronRight } from 'lucide-react';

// The flat white block every part of tracking sits in; the grey band under it is the separator.
export function Section({ title, children, className = '' }) {
  return (
    <section className={`border-b-8 border-sunken bg-white px-4 py-4 sm:px-6 ${className}`}>
      {title && <h2 className="mb-1 text-[18px] font-extrabold tracking-[-0.01em] text-ink-900">{title}</h2>}
      {children}
    </section>
  );
}

// One line of a list: icon, words, and what tapping it does.
export function Row({ Icon, title, sub, right, onClick, tone = 'ink' }) {
  const body = (
    <>
      {Icon && <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sunken text-ink-900"><Icon size={19} strokeWidth={1.9} /></span>}
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] leading-snug ${tone === 'danger' ? 'font-semibold text-red-700' : 'text-ink-900'}`}>{title}</span>
        {sub && <span className="mt-0.5 block text-[13px] leading-snug text-ink-500">{sub}</span>}
      </span>
      {right ?? (onClick ? <ChevronRight size={18} className="shrink-0 text-ink-400" /> : null)}
    </>
  );
  const cls = 'flex w-full items-center gap-3.5 py-3.5 text-left';
  return onClick
    ? <button type="button" onClick={onClick} className={cls}>{body}</button>
    : <div className={cls}>{body}</div>;
}
