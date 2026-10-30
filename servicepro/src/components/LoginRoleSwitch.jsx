import { useNavigate } from 'react-router-dom';
import { Store, Wrench } from 'lucide-react';

const ROLES = [
  { key: 'owner', label: 'Shop owner', to: '/shop/login', Icon: Store },
  { key: 'worker', label: 'Shop worker', to: '/shop/worker/login', Icon: Wrench },
];

/** Bottom of both servicepro sign-in screens: the same shop, two ways in. */
export default function LoginRoleSwitch({ active }) {
  const nav = useNavigate();
  return (
    <div className="mx-auto w-full max-w-sm">
      <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Signing in as</p>
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
        {ROLES.map(({ key, label, to, Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={active === key}
            onClick={() => active !== key && nav(to, { replace: true })}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zappy-300 ${
              active === key ? 'bg-white text-navy shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}
