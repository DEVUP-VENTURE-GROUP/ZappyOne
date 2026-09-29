import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Mail, Lock, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { useLoginAdminMutation } from '@shared/services/api';
import { setAuth } from '@shared/modules/auth/authSlice';
import { adminPath } from '@/config/admin';
import toast from 'react-hot-toast';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginAdmin, { isLoading }] = useLoginAdminMutation();
  const dispatch = useDispatch();
  const nav = useNavigate();
  const loc = useLocation();

  async function submit(e) {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Enter email and password');
      return;
    }
    try {
      const r = await loginAdmin({ email, password }).unwrap();
      dispatch(setAuth({
        accessToken: r.accessToken,
        refreshToken: r.refreshToken,
        profile: r.admin,
        role: 'admin',
      }));
      const next = loc.state?.from || adminPath('/dashboard');
      nav(next, { replace: true });
    } catch (err) {
      const code = err.data?.code;
      if (code === 'ADMIN_LOCKED') {
        toast.error('Too many failed attempts. Try again in 15 minutes.');
      } else {
        toast.error('Invalid email or password');
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F172A] px-4">
      <div className="w-full max-w-sm">
        {/* Logo mark */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-12 h-12 rounded-xl bg-zappy-600 flex items-center justify-center shadow-lg">
            <ShieldCheck size={24} className="text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-white text-xl font-bold tracking-tight">Admin Portal</h1>
            <p className="text-slate-400 text-sm mt-0.5">Restricted access</p>
          </div>
        </div>

        {/* Card */}
        <form
          onSubmit={submit}
          className="bg-slate-800 rounded-2xl px-6 py-7 shadow-2xl space-y-5"
        >
          {/* Email */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Email
            </label>
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                autoComplete="username"
                className="w-full bg-slate-700 text-white placeholder-slate-500 text-sm rounded-xl pl-9 pr-4 py-3 outline-none focus:ring-2 focus:ring-zappy-500 transition"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Password
            </label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                autoComplete="current-password"
                className="w-full bg-slate-700 text-white placeholder-slate-500 text-sm rounded-xl pl-9 pr-4 py-3 outline-none focus:ring-2 focus:ring-zappy-500 transition"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 bg-zappy-600 hover:bg-zappy-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl py-3 transition"
          >
            {isLoading
              ? <><Loader2 size={16} className="animate-spin" /> Signing in…</>
              : <><ArrowRight size={16} /> Sign in</>
            }
          </button>
        </form>
      </div>
    </div>
  );
}
