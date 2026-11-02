// Grey shapes where content is about to land, laid out like the page that is loading, so nothing jumps when it arrives.
export function Bone({ className = '' }) {
  return <span className={`block animate-pulse rounded-lg bg-slate-200/80 motion-reduce:animate-none ${className}`} />;
}

function Card({ children, className = '' }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-4 ${className}`}>{children}</div>;
}

const Rows = ({ n = 4 }) => Array.from({ length: n }, (_, i) => (
  <div key={i} className="flex items-center gap-3 py-2.5">
    <Bone className="h-10 w-10 shrink-0 rounded-xl" />
    <div className="min-w-0 flex-1 space-y-2"><Bone className="h-3.5 w-2/5" /><Bone className="h-3 w-3/5" /></div>
    <Bone className="h-6 w-16 rounded-full" />
  </div>
));

// kind: dashboard (header, tiles, panels), list (rows), form (labelled fields).
export default function PageSkeleton({ kind = 'list', label = 'Loading' }) {
  return (
    <div role="status" aria-label={label} className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5">
      {kind === 'dashboard' && (
        <>
          <Card className="overflow-hidden p-0"><Bone className="h-[18px] rounded-none" /><div className="flex items-center gap-3 p-4"><Bone className="h-14 w-14 rounded-2xl" /><div className="flex-1 space-y-2"><Bone className="h-3 w-24" /><Bone className="h-5 w-48" /><Bone className="h-6 w-56 rounded-full" /></div></div></Card>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Card key={i} className="space-y-3"><Bone className="h-10 w-10 rounded-xl" /><Bone className="h-3 w-20" /><Bone className="h-6 w-16" /></Card>)}</div>
          <Card><Bone className="mb-3 h-4 w-40" /><Rows n={3} /></Card>
        </>
      )}
      {kind === 'list' && <Card><Bone className="mb-2 h-4 w-32" /><Rows n={5} /></Card>}
      {kind === 'form' && (
        <Card className="space-y-4">{Array.from({ length: 5 }, (_, i) => <div key={i} className="space-y-2"><Bone className="h-3 w-28" /><Bone className="h-11 w-full rounded-xl" /></div>)}<Bone className="h-11 w-full rounded-xl" /></Card>
      )}
    </div>
  );
}
