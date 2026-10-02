import { AlertTriangle, Wrench } from 'lucide-react';
import { problemPhoto } from '@shared/components/home/problemArt';

/**
 * One problem as a picture card: what it looks like, what it is called, and
 * whether it is priced only after an inspection. Problems without a photo get
 * the same card with a calm icon, so a grid never looks broken.
 */
export function ProblemCard({ vertical, problem, onPick }) {
  const photo = problemPhoto(vertical, problem);
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
