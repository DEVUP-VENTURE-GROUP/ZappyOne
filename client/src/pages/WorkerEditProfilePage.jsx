import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Save, User, FileText, Wrench,
  Building2, CreditCard, AlertCircle, GraduationCap,
  Target, TrendingUp, Star, ChevronRight, Award,
  Loader2, BarChart2, Shield, KeyRound,
} from 'lucide-react';
import { useGetWorkerMeQuery, useUpdateWorkerProfileMutation, useSetWorkerCredentialsMutation } from '../services/api';
import toast from 'react-hot-toast';

const ALL_SKILLS = [
  { code: 'electrical',            label: 'Electrical' },
  { code: 'plumbing',              label: 'Plumbing' },
  { code: 'ac_repair',             label: 'AC Repair' },
  { code: 'carpenter',             label: 'Carpenter' },
  { code: 'helper',                label: 'Helper' },
  { code: 'puncture',              label: 'Puncture Repair' },
  { code: 'cleaning',              label: 'Cleaning' },
  { code: 'painting',              label: 'Painting' },
  { code: 'screen_replacement',    label: 'Screen Replacement' },
  { code: 'battery_replacement',   label: 'Battery Replacement' },
  { code: 'charging_issue',        label: 'Charging Issue' },
  { code: 'speaker_mic_issue',     label: 'Speaker / Mic' },
  { code: 'software_issue',        label: 'Software Issue' },
  { code: 'water_damage_check',    label: 'Water Damage Check' },
  { code: 'mason',                 label: 'Mason' },
  { code: 'battery_jump_start',    label: 'Battery Jump Start' },
  { code: 'fuel_delivery',         label: 'Fuel Delivery' },
  { code: 'bike_wash',             label: 'Bike Wash' },
  { code: 'car_wash',              label: 'Car Wash' },
  { code: 'minor_roadside_repair', label: 'Roadside Repair' },
];

const NAV_SECTIONS = [
  {
    title: 'Earnings & Finance',
    items: [
      { to: '/worker/earnings',  Icon: BarChart2,    label: 'Earnings Breakdown',  desc: 'Per-job breakdown & payslip',      color: 'indigo' },
      { to: '/worker/goals',     Icon: Target,       label: 'Earnings Goals',       desc: 'Daily & weekly targets',           color: 'purple' },
      { to: '/worker/bank',      Icon: Building2,    label: 'Bank & UPI Accounts',  desc: 'Manage payment destinations',      color: 'blue' },
      { to: '/worker/withdraw',  Icon: CreditCard,   label: 'Withdraw Earnings',    desc: 'Transfer to bank or UPI',          color: 'emerald' },
    ],
  },
  {
    title: 'Skills & Growth',
    items: [
      { to: '/worker/skills',    Icon: Star,         label: 'Skills & Specialisation', desc: 'Set primary skill, unlock jobs', color: 'amber' },
      { to: '/worker/training',  Icon: GraduationCap,label: 'Training & Certification', desc: 'Video courses + quiz certs',   color: 'rose' },
      { to: '/worker/appeals',   Icon: AlertCircle,  label: 'Appeals',                  desc: 'Contest ratings & penalties',  color: 'orange' },
    ],
  },
  {
    title: 'Insights',
    items: [
      { to: '/worker/goals',     Icon: TrendingUp,   label: 'Zone Benchmark',       desc: 'See how you rank nearby',          color: 'cyan' },
      { to: '/plans',            Icon: Award,        label: 'Subscription Plan',    desc: 'Lower commission, more earnings',  color: 'violet' },
      { to: '/worker/kyc',       Icon: Shield,       label: 'KYC Documents',        desc: 'Verification & compliance',        color: 'slate' },
    ],
  },
];

const COLOR_MAP = {
  indigo:  { bg: 'bg-indigo-50',  icon: 'text-indigo-600' },
  purple:  { bg: 'bg-purple-50',  icon: 'text-purple-600' },
  blue:    { bg: 'bg-blue-50',    icon: 'text-blue-600' },
  emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600' },
  amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600' },
  rose:    { bg: 'bg-rose-50',    icon: 'text-rose-600' },
  orange:  { bg: 'bg-orange-50',  icon: 'text-orange-600' },
  cyan:    { bg: 'bg-cyan-50',    icon: 'text-cyan-600' },
  violet:  { bg: 'bg-violet-50',  icon: 'text-violet-600' },
  slate:   { bg: 'bg-slate-100',  icon: 'text-slate-600' },
};

export default function WorkerEditProfilePage() {
  const nav = useNavigate();
  const { data: meData, isLoading } = useGetWorkerMeQuery();
  const me = meData?.worker;
  const [updateProfile, { isLoading: isSaving }] = useUpdateWorkerProfileMutation();
  const [setCredentials, { isLoading: savingCreds }] = useSetWorkerCredentialsMutation();

  const [name,   setName]   = useState('');
  const [bio,    setBio]    = useState('');
  const [skills, setSkills] = useState(null);
  // Login credentials (#2)
  const [username, setUsername]   = useState('');
  const [newPw,    setNewPw]      = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  async function saveCredentials() {
    if (newPw.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return; }
    try {
      await setCredentials({ ...(username.trim() ? { username: username.trim() } : {}), password: newPw }).unwrap();
      toast.success('Login credentials saved — you can now sign in with your password');
      setNewPw(''); setConfirmPw('');
    } catch (err) {
      toast.error(err.data?.error || 'Could not save credentials');
    }
  }

  if (me && skills === null) {
    setName(me.name ?? '');
    setBio(me.bio ?? '');
    setSkills(me.skills ?? []);
  }

  const toggleSkill = (code) => {
    setSkills(prev => prev.includes(code) ? prev.filter(s => s !== code) : [...prev, code]);
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error('Name is required');
    if ((skills ?? []).length === 0) return toast.error('Select at least 1 skill');

    const body = {};
    if (name.trim() !== (me?.name ?? ''))  body.name   = name.trim();
    if (bio.trim()  !== (me?.bio  ?? ''))  body.bio    = bio.trim();
    const orig = JSON.stringify([...(me?.skills ?? [])].sort());
    const next = JSON.stringify([...(skills ?? [])].sort());
    if (next !== orig) body.skills = skills;

    if (!Object.keys(body).length) { toast.success('No changes'); return; }

    const res = await updateProfile(body);
    if (res.error) {
      toast.error(res.error?.data?.error || 'Failed to save. Try again.');
    } else {
      toast.success('Profile updated!');
      nav('/worker');
    }
  };

  if (isLoading || skills === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 size={24} className="animate-spin text-indigo-300" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="min-h-screen bg-slate-50 pb-12">
      <div className="bg-white border-b border-slate-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => nav('/worker')} className="p-2 rounded-lg hover:bg-slate-100">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <h1 className="font-semibold text-slate-800">Profile & Settings</h1>
        <button onClick={handleSave} disabled={isSaving || (skills ?? []).length === 0}
          className="ml-auto flex items-center gap-1.5 bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50">
          {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-5">

        {/* Avatar placeholder + stats */}
        <div className="bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm">
          <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center text-2xl font-bold text-indigo-600 shrink-0">
            {(me?.name || 'W')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-800 truncate">{me?.name || 'Your Name'}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              ⭐ {me?.rating?.toFixed(1) ?? '—'} · {me?.completedJobs ?? 0} jobs completed
            </p>
          </div>
          {me?.trust?.isVerified && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
              <Shield size={9} /> Verified
            </span>
          )}
        </div>

        {/* Name */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <User size={15} className="text-indigo-500" />
            <span className="text-sm font-semibold text-slate-700">Display Name</span>
          </div>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="Your full name"
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition" />
        </div>

        {/* Bio */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={15} className="text-indigo-500" />
            <span className="text-sm font-semibold text-slate-700">Bio</span>
            <span className="ml-auto text-xs text-slate-400">{bio.length}/300</span>
          </div>
          <textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={300} rows={3}
            placeholder="Describe your experience — shown to customers when they view your profile…"
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 transition" />
        </div>

        {/* Skills */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Wrench size={15} className="text-indigo-500" />
            <span className="text-sm font-semibold text-slate-700">Skills</span>
            <span className="ml-auto text-xs text-slate-400">{skills.length}/10 selected</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_SKILLS.map(({ code, label }) => {
              const sel = skills.includes(code);
              return (
                <button key={code}
                  onClick={() => (skills.length < 10 || sel) ? toggleSkill(code) : toast.error('Max 10 skills')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${sel ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {label}
                </button>
              );
            })}
          </div>
          {skills.length === 0 && (
            <p className="mt-3 text-xs text-red-500 flex items-center gap-1">
              <AlertCircle size={11} /> Select at least 1 skill to appear in dispatch
            </p>
          )}
          <button onClick={() => nav('/worker/skills')} className="mt-3 text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
            Advanced skills & certifications <ChevronRight size={11} />
          </button>
        </div>

        {/* Login Credentials (#2) — set a Worker ID + password to sign in without OTP */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <KeyRound size={15} className="text-indigo-500" />
            <span className="text-sm font-semibold text-slate-700">Login Credentials</span>
          </div>
          <p className="text-xs text-slate-400 mb-3">Set a Worker ID and password so you can sign in without an OTP each time.</p>
          <div className="space-y-2.5">
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Worker ID {me?.username ? `(current: ${me.username})` : '(optional)'}</label>
              <input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} maxLength={30}
                placeholder={me?.username || 'e.g. ravi_kumar'}
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">New Password</label>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                placeholder="At least 8 characters"
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Confirm Password</label>
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                placeholder="Re-enter password"
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition" />
            </div>
            <button onClick={saveCredentials} disabled={savingCreds || newPw.length < 8}
              className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 text-white text-sm font-bold rounded-xl py-2.5 disabled:opacity-50 hover:bg-indigo-700 transition">
              {savingCreds ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} Save Login Credentials
            </button>
          </div>
        </div>

        {/* Navigation hub */}
        {NAV_SECTIONS.map(section => (
          <div key={section.title}>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 mb-2">{section.title}</p>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-slate-100">
              {section.items.map(({ to, Icon, label, desc, color }) => {
                const c = COLOR_MAP[color] ?? COLOR_MAP.slate;
                return (
                  <button key={to + label} onClick={() => nav(to)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 active:bg-slate-100 transition text-left">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${c.bg}`}>
                      <Icon size={16} className={c.icon} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{label}</p>
                      <p className="text-xs text-slate-500 truncate">{desc}</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-300 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}

      </div>
    </motion.div>
  );
}
