import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Smartphone, Clock, AlertTriangle, X } from 'lucide-react';
import { useGetMeQuery, useDeleteAccountMutation } from '@shared/services/api';
import { useDispatch } from 'react-redux';
import { logout } from '@shared/modules/auth/authSlice';

function DeleteConfirmSheet({ onClose, onConfirm, isLoading }) {
  const [confirm, setConfirm] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-t-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-rose-600">Delete Account</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="bg-rose-50 rounded-xl p-3 text-sm text-rose-700 space-y-1">
          <p className="font-medium">This action is permanent.</p>
          <p className="text-xs">Your profile, addresses, and order history will be anonymised within 30 days. Active orders must be completed or cancelled first.</p>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">
            Type <span className="font-mono font-bold">DELETE</span> to confirm
          </label>
          <input
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="DELETE"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
          />
        </div>
        <button
          disabled={confirm !== 'DELETE' || isLoading}
          onClick={onConfirm}
          className="w-full py-2.5 rounded-xl bg-rose-600 text-white text-sm font-medium disabled:opacity-40"
        >
          {isLoading ? 'Deleting…' : 'Permanently Delete Account'}
        </button>
      </div>
    </div>
  );
}

export default function AccountSecurityPage() {
  const nav = useNavigate();
  const dispatch = useDispatch();
  const { data } = useGetMeQuery();
  const [deleteAccount, { isLoading: isDeleting }] = useDeleteAccountMutation();
  const [showDelete, setShowDelete] = useState(false);

  const loginHistory = data?.user?.loginHistory ?? [];

  async function handleDelete() {
    try {
      await deleteAccount().unwrap();
      dispatch(logout());
      nav('/', { replace: true });
    } catch {}
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => nav(-1)} className="p-1.5 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-semibold text-slate-800">Account Security</h1>
      </header>

      <div className="p-4 space-y-4">
        {/* Login history */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="px-4 pt-4 pb-2 flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-500" />
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
                      <span className="text-xs text-slate-400">{entry.ip || '—'}</span>
                      <span className="text-slate-200">·</span>
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

        {/* Danger zone */}
        <div className="bg-white rounded-xl shadow-sm border border-rose-100">
          <div className="px-4 pt-4 pb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <h2 className="font-semibold text-rose-600 text-sm">Danger Zone</h2>
          </div>
          <div className="px-4 pb-4">
            <p className="text-xs text-slate-500 mb-3">
              Deleting your account is irreversible. Your data will be anonymised within 30 days in compliance with our privacy policy.
            </p>
            <button
              onClick={() => setShowDelete(true)}
              className="w-full py-2.5 rounded-xl border border-rose-200 text-rose-600 text-sm font-medium hover:bg-rose-50 active:bg-rose-100"
            >
              Delete My Account
            </button>
          </div>
        </div>
      </div>

      {showDelete && (
        <DeleteConfirmSheet
          onClose={() => setShowDelete(false)}
          onConfirm={handleDelete}
          isLoading={isDeleting}
        />
      )}
    </div>
  );
}
