import { useSafeBack } from '../../hooks/useBookingFlow';
import LoginSecurityCard from '@shared/components/account/LoginSecurityCard';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Smartphone, Clock } from 'lucide-react';
import { useGetMeQuery } from '@shared/services/api';
import DeleteAccountSection from '@shared/components/account/DeleteAccountSection';

export default function AccountSecurityPage() {
  const nav = useNavigate();
  // Back to the previous page, or to /profile when this page was opened directly.
  const goBack = useSafeBack('/profile');
  const { data } = useGetMeQuery();

  const loginHistory = data?.user?.loginHistory ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => goBack()} className="p-1.5 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-semibold text-slate-800">Account Security</h1>
      </header>

      <div className="p-4 space-y-4">
        <LoginSecurityCard />

        {/* Login history */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="px-4 pt-4 pb-2 flex items-center gap-2">
            <Shield className="w-4 h-4 text-zappy-500" />
            <h2 className="font-semibold text-slate-700 text-sm">Recent Login Activity</h2>
          </div>
          {loginHistory.length === 0 ? (
            <p className="text-xs text-slate-400 px-4 pb-4">No login history available</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {loginHistory.slice(0, 10).map((entry, i) => (
                <div key={i} className="px-4 py-3 flex items-start gap-3">
                  <Smartphone className="w-4 h-4 text-slate-300 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700">{entry.device || 'Unknown device'}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-400">{entry.ip || '-'}</span>
                      <span className="text-slate-200">|</span>
                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="w-3 h-3" />
                        {new Date(entry.at).toLocaleDateString('en-IN', {
                          day: 'numeric', month: 'short', year: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                  {i === 0 && (
                    <span className="text-xs bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">Current</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DeleteAccountSection onDeleted={() => nav('/', { replace: true })} />
      </div>

    </div>
  );
}
