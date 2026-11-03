import { Link, useLocation } from 'react-router-dom';
import { useT } from '@shared/i18n/I18nProvider';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { ArrowRight, CircleCheck, CircleDashed } from 'lucide-react';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { useProviderProfileStatusQuery } from '@shared/services/api';

// Pages a partner can always open, so they can fill in what is missing and still manage their account.
export const ALWAYS = ['/shop/profile', '/shop/kyc', '/shop/account', '/shop/notifications', '/worker/notifications', '/worker/profile', '/worker/kyc', '/partner/profile', '/verify-email', '/shop/support', '/worker/support', '/partner/support'];

// Until every required detail is filled (server onboarding/profile-check), the dashboard is replaced by the list of what is left.
export default function ProfileGate({ children }) {
  const { accessToken, role } = useSelector(selectAuth);
  const t = useT();
  const { pathname } = useLocation();
  const { data } = useProviderProfileStatusQuery(undefined, { skip: !accessToken, refetchOnMountOrArgChange: 30 });
  if (!data || data.complete || ALWAYS.some((p) => pathname.startsWith(p))) return children;
  const done = data.total - data.missing.length;
  // Every step with its state (older servers sent only what was missing).
  const steps = data.items || data.missing.map((m) => ({ ...m, done: false }));
  const next = steps.find((m) => !m.done);
  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card space-y-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-zappy-600">{done} of {data.total} done</p>
          <h1 className="mt-1 text-xl font-extrabold text-[#0F172A]">{t('sp.finish_your_profile_to_open_your_dashboard', 'Finish your profile to open your dashboard')}</h1>
          <p className="mt-1 text-sm text-slate-500">Customers see these details before they book you, and ZappyOne checks them before you take work.</p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100"><motion.div className="h-full bg-zappy-600" initial={{ width: 0 }} animate={{ width: `${(done / data.total) * 100}%` }} transition={{ duration: 0.6 }} /></div>
        <ul className="divide-y divide-slate-100">
          {steps.map((m, i) => (
            <motion.li key={m.key} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
              {m.done ? (
                <div className="flex items-center gap-3 py-3 text-sm">
                  <CircleCheck size={18} className="shrink-0 text-emerald-600" />
                  <span className="flex-1 font-medium text-slate-400 line-through decoration-slate-300">{m.label}</span>
                  <span className="text-[11px] font-bold text-emerald-700">Done</span>
                </div>
              ) : (
                <Link to={`${m.path}?focus=${m.key}`} className={`-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 text-sm hover:bg-zappy-50 hover:text-zappy-700 ${m.key === next?.key ? 'bg-zappy-50/60' : ''}`}>
                  <CircleDashed size={18} className={`shrink-0 ${m.key === next?.key ? 'text-zappy-600' : 'text-slate-300'}`} />
                  <span className="flex-1 font-semibold text-slate-800">{m.label}</span>
                  <span className="text-[11px] font-bold text-zappy-700">{m.key === next?.key ? 'Do this next' : 'To do'}</span>
                  <ArrowRight size={16} className="text-slate-400" />
                </Link>
              )}
            </motion.li>
          ))}
        </ul>
        {role === 'worker' && <p className="text-xs text-slate-500">Your shop owner can see what is still missing too.</p>}
      </motion.div>
    </div>
  );
}
