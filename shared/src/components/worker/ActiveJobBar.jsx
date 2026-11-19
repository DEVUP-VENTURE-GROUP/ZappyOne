import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// The job under way stays pinned at the bottom of Home until it is completed; one tap opens it.
export default function ActiveJobBar({ jobs = [] }) {
  const nav = useNavigate();
  const job = jobs[0];
  if (!job) return null;
  const more = jobs.length - 1;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+64px)] z-30 px-4 lg:bottom-6">
      <button type="button" onClick={() => nav(job.to)} aria-label={`Open ${job.title}`}
        className="pointer-events-auto mx-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-navy px-4 py-3 text-left text-white shadow-lg">
        <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{job.title}</span>
          <span className="block truncate text-[12px] text-white/70">{job.status}{more > 0 ? ` · ${more} more job${more > 1 ? 's' : ''}` : ''}</span>
        </span>
        <span className="flex items-center gap-0.5 text-[13px] font-bold">Open <ChevronRight size={16} /></span>
      </button>
    </div>
  );
}
