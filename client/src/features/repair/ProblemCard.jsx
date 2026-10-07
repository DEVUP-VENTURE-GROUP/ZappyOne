import { AlertTriangle, Wrench, ChevronRight } from 'lucide-react';
import { problemPhotoIn } from '@shared/components/home/problemArt';

/**
 * One problem as a picture card: what it looks like, what it is called, and
 * whether it is priced only after an inspection. Problems without a photo get
 * the same card with a calm icon, so a grid never looks broken.
 */
export function ProblemCard({ vertical, problem, category, onPick }) {
  const photo = problemPhotoIn(vertical, problem, category);
  return (
    <button type="button" onClick={() => onPick(problem)}
      className="group flex flex-col overflow-hidden rounded-card border border-line bg-white text-left transition-colors duration-150 hover:border-line-strong active:bg-canvas">
      <span className="relative block aspect-square w-full overflow-hidden bg-sunken">
        {photo
          ? <img src={photo} alt="" loading="lazy" decoding="async" width="480" height="480"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          : <span className="flex h-full items-center justify-center text-ink-400"><Wrench size={28} strokeWidth={1.5} /></span>}
        {problem.severity === 'critical' && (
          <span className="chip absolute left-2 top-2 bg-white text-red-600"><AlertTriangle size={12} /> Urgent</span>
        )}
      </span>
      <span className="flex flex-1 flex-col gap-0.5 p-2.5 sm:p-3">
        <span className="line-clamp-2 text-[14px] font-semibold leading-snug text-ink-900">{problem.name}</span>
        {problem.requiresDiagnosis && (
          <span className="text-[12px] font-medium text-amber-700">Priced after inspection</span>
        )}
      </span>
    </button>
  );
}

/** The grid the cards sit in: two across on phones, more as room allows. */
export function ProblemGrid({ children }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}

/** A problem as a plain row, for headings whose problems have no photos of their own (vehicles). */
export function ProblemRow({ problem, onPick }) {
  return (
    <button type="button" onClick={() => onPick(problem)}
      className="flex w-full items-center gap-3 rounded-card border border-line bg-white p-3.5 text-left transition-colors hover:border-line-strong active:bg-canvas">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink-900">{problem.name}</span>
        {problem.requiresDiagnosis && <span className="mt-0.5 block text-[12px] font-medium text-amber-700">Priced after inspection</span>}
      </span>
      {problem.severity === 'critical' && <span className="chip bg-red-50 text-red-700"><AlertTriangle size={12} /> Urgent</span>}
      <ChevronRight size={18} className="shrink-0 text-ink-300" />
    </button>
  );
}

/** Photo cards when this heading's problems have photos, rows when none do. */
export function ProblemLayout({ vertical, problems, category, onPick }) {
  const withPhotos = problems.some((p) => problemPhotoIn(vertical, p, category));
  if (!withPhotos) {
    return <div className="space-y-2">{problems.map((p) => <ProblemRow key={p.code} problem={p} onPick={onPick} />)}</div>;
  }
  return <ProblemGrid>{problems.map((p) => <ProblemCard key={p.code} vertical={vertical} problem={p} category={category} onPick={onPick} />)}</ProblemGrid>;
}
