import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { LogOut, ShieldOff, Warehouse } from 'lucide-react';
import { logout } from '@shared/modules/auth/authSlice';
import { useLogoutMutation, useAdminMeQuery } from '@shared/services/api';
import Hub from '@admin/ui/Hub';
import { FLEET_VIEWS, FLEET_TITLE, FLEET_SUBTITLE } from '@admin/features/fleet/views';
import { fleetPath } from './fleetPaths';

/**
 * The Fleet portal once signed in: the fleet's screens and nothing else.
 * Only an admin whose role opens Fleet (server admin/access 'fleet') gets in;
 * the server checks the same on every call.
 */
export default function FleetShell() {
  const { data: me, isLoading } = useAdminMeQuery();
  const [callLogout] = useLogoutMutation();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  async function signOut() {
    try { await callLogout().unwrap(); } catch { /* signed out here either way */ }
    dispatch(logout());
    navigate(fleetPath('/login'), { replace: true });
  }

  if (isLoading) return <div className="flex h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  const allowed = (me?.areas || []).includes('fleet');

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white"><Warehouse size={16} /></span>
          <p className="text-[15px] font-bold text-slate-900">Fleet</p>
          <p className="ml-auto truncate text-[13px] text-slate-500">{me?.admin?.name || me?.admin?.email || ''}</p>
          <button type="button" onClick={signOut} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-slate-600 hover:bg-slate-100">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>
      <main className="px-4 py-6 sm:px-6">
        {allowed ? <Hub title={FLEET_TITLE} subtitle={FLEET_SUBTITLE} views={FLEET_VIEWS} /> : (
          <div className="mx-auto mt-16 max-w-sm text-center">
            <ShieldOff size={28} className="mx-auto text-slate-400" />
            <p className="mt-3 text-[15px] font-bold text-slate-900">No access to Fleet</p>
            <p className="mt-1 text-[13px] text-slate-500">Ask a super admin to give your account the Fleet manager role.</p>
          </div>
        )}
      </main>
    </div>
  );
}
