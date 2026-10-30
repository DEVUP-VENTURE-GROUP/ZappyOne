import PageSkeleton from '@shared/components/common/Skeleton';

/**
 * The few building blocks every partner page shares. Kept deliberately small:
 * anything used by one page lives with that page.
 */

// Pages loading show their shape, not a spinner (shared Skeleton).
export function Spinner({ label = 'Loading', kind = 'list' }) {
  return <PageSkeleton kind={kind} label={label} />;
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold leading-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[14px] text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line-strong bg-white px-6 py-12 text-center">
      {Icon && <span className="flex h-12 w-12 items-center justify-center rounded-btn bg-sunken text-ink-500"><Icon size={22} /></span>}
      <p className="mt-3 text-[16px] font-semibold text-ink-900">{title}</p>
      {text && <p className="mt-1 max-w-sm text-[14px] text-ink-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Card({ className = '', children }) {
  return <section className={`rounded-card border border-line bg-white ${className}`}>{children}</section>;
}

export function Stat({ label, value, hint }) {
  return (
    <div className="rounded-card border border-line bg-white p-4">
      <p className="text-[13px] text-ink-500">{label}</p>
      <p className="mt-1 text-[22px] font-bold tabular-nums text-ink-900">{value}</p>
      {hint && <p className="mt-0.5 text-[12px] text-ink-400">{hint}</p>}
    </div>
  );
}

export function Field({ label, hint, required, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-700">
        {label}{required && <span className="text-red-600"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-ink-400">{hint}</span>}
    </label>
  );
}
