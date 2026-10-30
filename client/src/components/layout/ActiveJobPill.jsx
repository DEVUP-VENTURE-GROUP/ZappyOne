import { useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { useMyJobs } from '@shared/customer/useMyJobs';

const HIDE_ON = new Set(['/', '/home', '/login']);

// A live job follows the customer around the app, as Rapido's "Active order" tab does; home has its own card.
export default function ActiveJobPill() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { accessToken, role } = useSelector(selectAuth);
  const signedIn = Boolean(accessToken) && role === 'user';
  const { current } = useMyJobs({ skip: !signedIn });
  if (!signedIn || !current || HIDE_ON.has(pathname) || pathname.startsWith(current.href)) return null;
  return (
    <button type="button" onClick={() => nav(current.href)} aria-label={`Your ${current.title}: ${current.stage}. Open`}
      className="fixed left-0 z-[105] flex max-w-[78vw] items-center gap-2.5 rounded-r-full bg-ink-900 py-2 pl-3 pr-3.5 text-left text-white shadow-lg bottom-[calc(84px_+_env(safe-area-inset-bottom))] md:bottom-6">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className={`absolute inline-flex h-full w-full rounded-full opacity-70 motion-safe:animate-ping ${current.needsYou ? 'bg-amber-400' : 'bg-green-400'}`} />
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${current.needsYou ? 'bg-amber-400' : 'bg-green-400'}`} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold capitalize">{current.needsYou ? 'Needs your approval' : current.title}</span>
        <span className="block truncate text-[11.5px] text-white/65">{current.stage}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-white/70" />
    </button>
  );
}
