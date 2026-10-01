import { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { API_BASE } from '@shared/services/apiBase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Star, Package, Calendar, Wallet, User, LogOut,
  Plus, Loader2, CheckCircle, Clock, ChevronRight, Upload,
  Trash2, Edit3, AlertCircle, PartyPopper, X, Camera, FileText,
  TrendingUp, BadgeCheck, IndianRupee, CalendarCheck, Sparkles,
  ShieldCheck, ArrowRight, Bell, ChevronDown, Menu, Megaphone,
  LayoutGrid, Palette, Zap, Phone, MapPin, Briefcase, Award, Quote,
} from 'lucide-react';
import {
  usePartnerOverviewQuery, usePartnerMeQuery, useUpdatePartnerMeMutation,
  usePartnerThemesQuery, useCreateEventThemeMutation, useUpdateEventThemeMutation, useDeleteEventThemeMutation,
  usePartnerBookingsQuery, useUpdatePartnerBookingStatusMutation, useDeclineEventBookingMutation,
  usePartnerCalendarQuery, useBlockEventDateMutation, useUnblockEventDateMutation,
  usePartnerEarningsQuery, useGetEventCategoriesQuery, usePresignUploadMutation,
  usePartnerNotificationsQuery, useMarkPartnerNotificationReadMutation, useMarkAllPartnerNotificationsReadMutation,
  useLogoutMutation,
} from '@shared/services/api';
import { logout } from '@shared/modules/auth/authSlice';
import LiveSelfieCapture from '@shared/components/kyc/LiveSelfieCapture';
import toast from 'react-hot-toast';
import { useStartCodeGate } from '@shared/components/worker/StartCodePrompt';
import decorPhoto from '@shared/assets/events/event_romantic.webp';

/* Status pill */
const PILL = {
  pending: 'bg-amber-50  text-amber-700  border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  featured: 'bg-purple-50 text-purple-700 border-purple-200',
  rejected: 'bg-red-50    text-red-700    border-red-200',
  hidden: 'bg-slate-100 text-slate-500  border-slate-200',
  confirmed: 'bg-blue-50   text-blue-700   border-blue-200',
  partner_assigned: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  in_progress: 'bg-orange-50 text-orange-600 border-orange-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50    text-red-500    border-red-200',
  not_submitted: 'bg-slate-100 text-slate-500  border-slate-200',
};
function Pill({ status, className = '' }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${PILL[status] || PILL.hidden} ${className}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

/* Spinner / Empty */
function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-10 h-10 rounded-2xl bg-violet-100 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-violet-500" />
      </div>
    </div>
  );
}
function EmptyState({ icon: Icon, text, sub, action }) {
  return (
    <div className="text-center py-14">
      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
        <Icon size={28} className="text-slate-300" />
      </div>
      <p className="font-bold text-slate-700 text-sm">{text}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* Stat card */
function StatCard({ label, value, icon: Icon, gradient, sub }) {
  return (
    <div className={`rounded-2xl p-4 ${gradient} relative overflow-hidden`}>
      <div className="absolute top-2 right-2 opacity-10">
        <Icon size={40} />
      </div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={13} className="opacity-70" />
        <p className="text-[11px] font-semibold opacity-70 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-black">{value}</p>
      {sub && <p className="text-[10px] opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

/* Mobile Overview (Redesign) */
function MobileOverviewTab({ onNavigate }) {
  const { data, isLoading } = usePartnerOverviewQuery();
  if (isLoading) return <Spinner />;
  const { partner, stats } = data || {};
  const kycOk = partner?.kyc?.status === 'approved';
  const kycPending = partner?.kyc?.status === 'pending';

  return (
    <div className="w-full flex flex-col -mt-[64px] pb-6 font-sans">
      {/* HERO SECTION */}
      <div className="relative pt-[85px] px-5 pb-[70px] bg-[#0f1123] rounded-b-[40px] overflow-hidden shadow-sm">
        <div className="relative z-10 flex flex-col">
          <p className="text-[13px] text-white/80 font-medium mb-1">Welcome to Zappyone,</p>
          <h1 className="text-[26px] font-extrabold text-white leading-none tracking-tight mb-2.5">
            {partner?.businessName || 'Happy creations'}
          </h1>
          <div className="flex items-center gap-1.5">
            {kycOk ? (
              <ShieldCheck size={14} className="text-emerald-400" />
            ) : kycPending ? (
              <Clock size={14} className="text-blue-400" />
            ) : (
              <AlertCircle size={14} className="text-amber-400" />
            )}
            <span className={`text-[12px] font-bold ${kycOk ? "text-emerald-400" : kycPending ? "text-blue-400" : "text-amber-400"}`}>
              {kycOk ? "KYC Verified Partner" : kycPending ? "KYC Submitted" : "KYC Action Required"}
            </span>
          </div>
        </div>
      </div>

      {/* OVERLAPPING PROFILE CARD */}
      <div className="px-5 -mt-[45px] relative z-20 mb-6">
        <div className="bg-gradient-to-br from-[#7e22ce] via-[#a855f7] to-[#ec4899] rounded-[24px] p-5 shadow-[0_12px_30px_rgba(168,85,247,0.3)]">
          <div className="flex justify-between items-start mb-6">
            <div className="flex-1 pr-4">
              <h2 className="text-[15px] font-bold text-white mb-1.5 leading-tight">Let's create something amazing today! 🎉</h2>
              <p className="text-[11px] text-white/80 font-medium leading-relaxed">
                {kycOk
                  ? "Complete your profile to get more bookings."
                  : kycPending
                    ? "KYC submitted. Please wait for confirmation to unlock all features."
                    : "Complete your profile and upload KYC to unlock all features."}
              </p>
            </div>
            <button onClick={() => onNavigate('profile')} className="shrink-0 bg-white text-[#7e22ce] text-[11px] font-bold px-3 py-2 rounded-[10px] flex items-center gap-1 shadow-sm hover:scale-105 transition-transform">
              View Profile <ArrowRight size={12} strokeWidth={2.5} />
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-white/10 pt-4">
            <div className="flex flex-col items-center flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Star size={16} className="text-yellow-400 fill-yellow-400" />
                <span className="text-[15px] font-extrabold text-white">{partner?.rating?.toFixed(1) || '0.0'}</span>
              </div>
              <span className="text-[10px] text-white/70 font-medium">Rating</span>
            </div>
            <div className="w-px h-8 bg-white/10"></div>
            <div className="flex flex-col items-center flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <CalendarCheck size={16} className="text-pink-200" />
                <span className="text-[15px] font-extrabold text-white">{partner?.completedEvents || 0}</span>
              </div>
              <span className="text-[10px] text-white/70 font-medium">Total Events</span>
            </div>
            <div className="w-px h-8 bg-white/10"></div>
            <div className="flex flex-col items-center flex-1">
              <div className="flex items-center gap-1 mb-0.5">
                {kycOk ? (
                  <ShieldCheck size={16} className="text-emerald-300" />
                ) : kycPending ? (
                  <Clock size={16} className="text-blue-300" />
                ) : (
                  <AlertCircle size={16} className="text-amber-300" />
                )}
                <span className="text-[12px] font-extrabold text-white leading-tight">
                  {kycOk ? "KYC Verified" : kycPending ? "KYC Submitted" : "KYC Not Verified"}
                </span>
              </div>
              <span className="text-[9px] text-white/70 font-medium whitespace-nowrap">
                {kycOk ? "Verified Partner" : kycPending ? "Pending Confirmation" : "Action Required"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* STATS GRID */}
      <div className="px-5 grid grid-cols-2 gap-3 mb-8">
        <div className="bg-white rounded-[20px] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-slate-50 flex flex-col relative overflow-hidden">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-violet-50 flex items-center justify-center text-violet-500">
              <PartyPopper size={14} />
            </div>
            <span className="text-[10px] font-extrabold text-violet-600 uppercase tracking-wider">My Themes</span>
          </div>
          <span className="text-[24px] font-black text-slate-800 leading-none mb-1">{stats?.themes || 0}</span>
          <span className="text-[10px] text-slate-400 font-medium z-10">Themes Created</span>
          {/* Sparkline curve via SVG */}
          <div className="absolute bottom-0 left-0 right-0 h-10 opacity-60">
            <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-full stroke-violet-400 fill-none" strokeWidth="1.5">
              <path d="M0,25 C10,15 20,25 30,15 C40,5 50,20 60,10 C75,25 85,5 100,20" />
            </svg>
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-slate-50 flex flex-col relative overflow-hidden">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
              <CalendarCheck size={14} />
            </div>
            <span className="text-[10px] font-extrabold text-blue-600 uppercase tracking-wider">Upcoming</span>
          </div>
          <span className="text-[24px] font-black text-slate-800 leading-none mb-1">{stats?.upcomingEvents || 0}</span>
          <span className="text-[10px] text-slate-400 font-medium z-10">Events next 7 days</span>
          <div className="absolute bottom-0 left-0 right-0 h-10 opacity-60">
            <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-full stroke-blue-400 fill-none" strokeWidth="1.5">
              <path d="M0,20 C15,25 25,10 40,20 C50,25 65,10 75,15 C85,25 95,10 100,15" />
            </svg>
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-slate-50 flex flex-col relative overflow-hidden">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-orange-50 flex items-center justify-center text-orange-500">
              <Clock size={14} />
            </div>
            <span className="text-[10px] font-extrabold text-orange-600 uppercase tracking-wider">Pending Confirm</span>
          </div>
          <span className="text-[24px] font-black text-slate-800 leading-none mb-1">{stats?.pendingConfirmations || 0}</span>
          <span className="text-[10px] text-slate-400 font-medium z-10">Bookings</span>
          <div className="absolute bottom-0 left-0 right-0 h-10 opacity-60">
            <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-full stroke-orange-400 fill-none" strokeWidth="1.5">
              <path d="M0,15 C20,15 30,25 50,15 C65,5 75,25 100,10" />
            </svg>
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-slate-50 flex flex-col relative overflow-hidden">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
              <IndianRupee size={14} />
            </div>
            <span className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-wider">Net Earned</span>
          </div>
          <span className="text-[24px] font-black text-slate-800 leading-none mb-1">₹{Math.round((stats?.netEarningsPaise || 0) / 100).toLocaleString('en-IN')}</span>
          <span className="text-[10px] text-slate-400 font-medium z-10">Total Earnings</span>
          <div className="absolute bottom-0 left-0 right-0 h-10 opacity-60">
            <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-full stroke-emerald-400 fill-none" strokeWidth="1.5">
              <path d="M0,25 C15,10 30,20 45,15 C60,5 80,25 100,15" />
            </svg>
          </div>
        </div>
      </div>

      {/* QUICK ACTIONS */}
      <div className="px-5 mb-8">
        <div className="flex justify-between items-end mb-4">
          <h3 className="text-[16px] font-extrabold text-slate-900">Quick Actions</h3>
          <span className="text-[12px] font-bold text-violet-600 hover:underline cursor-pointer">View All</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onNavigate('themes')} className="bg-white rounded-[16px] border border-slate-100 p-3 flex items-center justify-between group hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[10px] text-violet-500 flex items-center justify-center bg-violet-50 group-hover:bg-violet-100 transition-colors">
                <Upload size={14} strokeWidth={2.5} />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[11px] font-bold text-violet-700 leading-tight mb-0.5">Upload Theme</span>
                <span className="text-[9px] text-slate-400 font-medium leading-none">Add new theme</span>
              </div>
            </div>
            <ArrowRight size={12} className="text-slate-300 group-hover:text-violet-500 transition-colors shrink-0" />
          </button>

          <button onClick={() => onNavigate('bookings')} className="bg-white rounded-[16px] border border-slate-100 p-3 flex items-center justify-between group hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[10px] text-blue-500 flex items-center justify-center bg-blue-50 group-hover:bg-blue-100 transition-colors">
                <Package size={14} strokeWidth={2.5} />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[11px] font-bold text-blue-700 leading-tight mb-0.5">View Bookings</span>
                <span className="text-[9px] text-slate-400 font-medium leading-none">Manage bookings</span>
              </div>
            </div>
            <ArrowRight size={12} className="text-slate-300 group-hover:text-blue-500 transition-colors shrink-0" />
          </button>

          <button onClick={() => onNavigate('earnings')} className="bg-white rounded-[16px] border border-slate-100 p-3 flex items-center justify-between group hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[10px] text-emerald-500 flex items-center justify-center bg-emerald-50 group-hover:bg-emerald-100 transition-colors">
                <Wallet size={14} strokeWidth={2.5} />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[11px] font-bold text-emerald-700 leading-tight mb-0.5">My Earnings</span>
                <span className="text-[9px] text-slate-400 font-medium leading-none">Check earnings</span>
              </div>
            </div>
            <ArrowRight size={12} className="text-slate-300 group-hover:text-emerald-500 transition-colors shrink-0" />
          </button>

          <button onClick={() => onNavigate('calendar')} className="bg-white rounded-[16px] border border-slate-100 p-3 flex items-center justify-between group hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[10px] text-orange-500 flex items-center justify-center bg-orange-50 group-hover:bg-orange-100 transition-colors">
                <Calendar size={14} strokeWidth={2.5} />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[11px] font-bold text-orange-700 leading-tight mb-0.5">Calendar</span>
                <span className="text-[9px] text-slate-400 font-medium leading-none">View schedule</span>
              </div>
            </div>
            <ArrowRight size={12} className="text-slate-300 group-hover:text-orange-500 transition-colors shrink-0" />
          </button>
        </div>
      </div>

      {/* PROMOTION BANNER */}
      <div className="px-5 mb-6">
        <a href="/partner/advertise" className="block relative bg-gradient-to-r from-[#7462ff] to-[#984dff] rounded-[24px] p-5 overflow-hidden shadow-lg shadow-violet-200/50 hover:shadow-xl transition-shadow">
          <div className="absolute top-0 right-0 bottom-0 w-32 flex items-center justify-end pr-2 opacity-90">
            <Megaphone size={80} className="text-white/20 rotate-[-15deg] translate-x-4" strokeWidth={1} />
          </div>
          <div className="relative z-10 w-[65%]">
            <h3 className="text-[15px] font-extrabold text-white mb-1.5 leading-tight">Boost your visibility</h3>
            <p className="text-[11px] text-white/80 font-medium leading-relaxed mb-4">Advertise your services on Zappyone and reach more customers.</p>
            <div className="inline-flex items-center gap-1.5 bg-white text-violet-600 text-[11px] font-bold px-3 py-2 rounded-xl">
              Advertise Now <ArrowRight size={12} />
            </div>
          </div>
        </a>
      </div>
    </div>
  );
}

/* Overview */
function OverviewTab({ onNavigate }) {
  const { data, isLoading } = usePartnerOverviewQuery();
  if (isLoading) return <Spinner />;
  const { partner, stats } = data || {};
  const kycOk = partner?.kyc?.status === 'approved';
  const kycPending = partner?.kyc?.status === 'pending';

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="relative rounded-[24px] overflow-hidden bg-gradient-to-r from-[#5940ff] via-[#7d50ff] to-[#a15bff] shadow-lg shadow-violet-500/20">
        <div className="absolute inset-y-0 right-0 w-1/3 opacity-80 mix-blend-overlay">
          <img src={decorPhoto} alt="Decor" className="w-full h-full object-cover object-left [mask-image:linear-gradient(to_right,transparent,black)]" onError={e => e.target.style.display = 'none'} />
        </div>
        <div className="relative p-8 md:w-3/4 flex flex-col items-start">
          <h2 className="text-[28px] font-black text-white leading-tight mb-1">Let's create something amazing today! 🎉</h2>
          <p className="text-white/80 text-[15px] font-medium mb-6">
            {kycOk
              ? "Complete your profile to get more bookings."
              : kycPending
                ? "KYC submitted. Please wait for confirmation to unlock all features."
                : "Complete your profile and upload KYC to unlock all features."}
          </p>

          <div className="flex items-center gap-4 flex-wrap mb-6">
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-[16px] px-4 py-2.5">
              <Star size={18} className="text-yellow-400 fill-yellow-400" />
              <div>
                <span className="block text-white text-[15px] font-bold leading-none">{partner?.rating?.toFixed(1) || '0.0'}</span>
                <span className="block text-white/60 text-[11px] font-medium mt-0.5">Rating</span>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-[16px] px-4 py-2.5">
              <CalendarCheck size={18} className="text-white/80" />
              <div>
                <span className="block text-white text-[15px] font-bold leading-none">{partner?.completedEvents || 0}</span>
                <span className="block text-white/60 text-[11px] font-medium mt-0.5">Total Events</span>
              </div>
            </div>
            <div className={`flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-[16px] px-4 py-2.5`}>
              {kycOk ? (
                <ShieldCheck size={18} className="text-emerald-300" />
              ) : kycPending ? (
                <Clock size={18} className="text-blue-300" />
              ) : (
                <AlertCircle size={18} className="text-amber-300" />
              )}
              <div>
                <span className="block text-white text-[15px] font-bold leading-none">
                  {kycOk ? "KYC Verified" : kycPending ? "KYC Submitted" : "KYC Not Verified"}
                </span>
                <span className="block text-white/60 text-[11px] font-medium mt-0.5">
                  {kycOk ? "Verified Partner" : kycPending ? "Pending Confirmation" : "Action Required"}
                </span>
              </div>
            </div>
          </div>

          <button onClick={() => onNavigate('profile')} className="px-5 py-2.5 bg-white/10 hover:bg-white/20 border border-white/30 text-white rounded-[14px] text-[13px] font-bold backdrop-blur-md transition-colors flex items-center gap-2">
            View Profile <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-4 gap-5">
        <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 flex flex-col relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="flex items-start gap-4 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center text-violet-600 group-hover:scale-110 transition-transform">
              <Palette size={20} strokeWidth={2} />
            </div>
            <div className="pt-0.5">
              <span className="block text-[11px] font-extrabold text-violet-600 uppercase tracking-wider mb-1">My Themes</span>
              <span className="block text-[28px] font-black text-[#0f172a] leading-none mb-1">{stats?.themes || 0}</span>
              <span className="block text-[11px] text-slate-400 font-medium z-10">Themes Created</span>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-12 opacity-60">
            <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-full stroke-violet-400 fill-none" strokeWidth="1.5"><path d="M0,25 C10,15 20,25 30,15 C40,5 50,20 60,10 C75,25 85,5 100,20" /></svg>
          </div>
        </div>

        <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 flex flex-col relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="flex items-start gap-4 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
              <CalendarCheck size={20} strokeWidth={2} />
            </div>
            <div className="pt-0.5">
              <span className="block text-[11px] font-extrabold text-blue-600 uppercase tracking-wider mb-1">Upcoming</span>
              <span className="block text-[28px] font-black text-[#0f172a] leading-none mb-1">{stats?.upcomingEvents || 0}</span>
              <span className="block text-[11px] text-slate-400 font-medium z-10">Events next 7 days</span>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-12 opacity-60">
            <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-full stroke-blue-400 fill-none" strokeWidth="1.5"><path d="M0,20 C15,25 25,10 40,20 C50,25 65,10 75,15 C85,25 95,10 100,15" /></svg>
          </div>
        </div>

        <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 flex flex-col relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="flex items-start gap-4 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
              <Clock size={20} strokeWidth={2} />
            </div>
            <div className="pt-0.5">
              <span className="block text-[11px] font-extrabold text-amber-500 uppercase tracking-wider mb-1">Pending Confirm</span>
              <span className="block text-[28px] font-black text-[#0f172a] leading-none mb-1">{stats?.pendingConfirmations || 0}</span>
              <span className="block text-[11px] text-slate-400 font-medium z-10">Bookings</span>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-12 opacity-60">
            <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-full stroke-amber-400 fill-none" strokeWidth="1.5"><path d="M0,15 C20,15 30,25 50,15 C65,5 75,25 100,10" /></svg>
          </div>
        </div>

        <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 flex flex-col relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="flex items-start gap-4 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
              <IndianRupee size={20} strokeWidth={2} />
            </div>
            <div className="pt-0.5">
              <span className="block text-[11px] font-extrabold text-emerald-500 uppercase tracking-wider mb-1">Net Earned</span>
              <span className="block text-[28px] font-black text-[#0f172a] leading-none mb-1">₹{Math.round((stats?.netEarningsPaise || 0) / 100).toLocaleString('en-IN')}</span>
              <span className="block text-[11px] text-slate-400 font-medium z-10">Total Earnings</span>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-12 opacity-60">
            <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-full stroke-emerald-400 fill-none" strokeWidth="1.5"><path d="M0,25 C15,10 30,20 45,15 C60,5 80,25 100,15" /></svg>
          </div>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-12 gap-6">

        {/* Left Column */}
        <div className="col-span-7 space-y-6">
          <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <Zap size={18} className="text-violet-600" />
              <h3 className="text-[16px] font-extrabold text-slate-900">Quick Actions</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => onNavigate('themes')} className="bg-slate-50/50 rounded-[16px] border border-slate-100 p-4 flex items-center justify-between group hover:shadow-md hover:bg-white transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[12px] text-violet-600 flex items-center justify-center bg-violet-100/50 group-hover:bg-violet-100 transition-colors">
                    <Upload size={16} strokeWidth={2} />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-[13px] font-bold text-violet-700 leading-tight mb-1">Upload Theme</span>
                    <span className="text-[11px] text-slate-400 font-medium leading-none">Add new theme</span>
                  </div>
                </div>
                <ArrowRight size={14} className="text-slate-300 group-hover:text-violet-600 transition-colors shrink-0" />
              </button>
              <button onClick={() => onNavigate('bookings')} className="bg-slate-50/50 rounded-[16px] border border-slate-100 p-4 flex items-center justify-between group hover:shadow-md hover:bg-white transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[12px] text-blue-600 flex items-center justify-center bg-blue-100/50 group-hover:bg-blue-100 transition-colors">
                    <Package size={16} strokeWidth={2} />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-[13px] font-bold text-blue-700 leading-tight mb-1">View Bookings</span>
                    <span className="text-[11px] text-slate-400 font-medium leading-none">Manage bookings</span>
                  </div>
                </div>
                <ArrowRight size={14} className="text-slate-300 group-hover:text-blue-600 transition-colors shrink-0" />
              </button>
              <button onClick={() => onNavigate('earnings')} className="bg-slate-50/50 rounded-[16px] border border-slate-100 p-4 flex items-center justify-between group hover:shadow-md hover:bg-white transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[12px] text-emerald-600 flex items-center justify-center bg-emerald-100/50 group-hover:bg-emerald-100 transition-colors">
                    <Wallet size={16} strokeWidth={2} />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-[13px] font-bold text-emerald-700 leading-tight mb-1">My Earnings</span>
                    <span className="text-[11px] text-slate-400 font-medium leading-none">Check earnings</span>
                  </div>
                </div>
                <ArrowRight size={14} className="text-slate-300 group-hover:text-emerald-600 transition-colors shrink-0" />
              </button>
              <button onClick={() => onNavigate('calendar')} className="bg-slate-50/50 rounded-[16px] border border-slate-100 p-4 flex items-center justify-between group hover:shadow-md hover:bg-white transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[12px] text-amber-500 flex items-center justify-center bg-amber-100/50 group-hover:bg-amber-100 transition-colors">
                    <Calendar size={16} strokeWidth={2} />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-[13px] font-bold text-amber-600 leading-tight mb-1">Calendar</span>
                    <span className="text-[11px] text-slate-400 font-medium leading-none">View schedule</span>
                  </div>
                </div>
                <ArrowRight size={14} className="text-slate-300 group-hover:text-amber-500 transition-colors shrink-0" />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-6 relative overflow-hidden flex items-center justify-between">
            <div className="absolute right-[-20px] top-1/2 -translate-y-1/2 opacity-20 pointer-events-none">
              <Megaphone size={120} className="text-violet-500 -rotate-12" strokeWidth={1} />
            </div>
            <div className="relative z-10">
              <h3 className="text-[16px] font-extrabold text-violet-700 mb-1.5">Boost your visibility</h3>
              <p className="text-[12px] text-slate-500 font-medium mb-4">Advertise your services on Zappyone and reach more customers.</p>
              <a href="/partner/advertise" className="inline-flex items-center gap-2 bg-white border border-slate-200 text-violet-600 hover:bg-slate-50 text-[12px] font-bold px-4 py-2.5 rounded-[12px] transition-colors shadow-sm">
                Advertise Now <ArrowRight size={14} />
              </a>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="col-span-5 flex flex-col">
          <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-6 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-violet-600" />
                <h3 className="text-[16px] font-extrabold text-slate-900">Calendar</h3>
              </div>
              <button onClick={() => onNavigate('calendar')} className="text-[12px] font-bold text-violet-600 hover:underline flex items-center gap-1">
                View Full Calendar <ArrowRight size={12} />
              </button>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center text-center pb-4">
              <div className="w-40 h-32 bg-violet-50 rounded-[20px] flex items-center justify-center mb-6 relative">
                <Calendar size={48} className="text-violet-300 absolute -translate-x-2 -translate-y-2 -rotate-12" strokeWidth={1.5} />
                <Calendar size={56} className="text-violet-500 relative z-10" strokeWidth={1.5} />
              </div>
              <h4 className="text-[16px] font-black text-slate-900 mb-1">No events scheduled</h4>
              <p className="text-[12px] text-slate-400 font-medium mb-6">You have no upcoming events in the next 7 days.</p>
              <button onClick={() => onNavigate('calendar')} className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-violet-600 rounded-[12px] text-[12px] font-bold shadow-sm transition-colors">
                View Calendar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Themes */
function ThemesTab() {
  const { data, isLoading, refetch } = usePartnerThemesQuery();
  const [deleteTheme] = useDeleteEventThemeMutation();
  const [showUpload, setShowUpload] = useState(false);
  const [editTheme, setEditTheme] = useState(null);

  async function handleDelete(id) {
    if (!window.confirm('Delete this theme?')) return;
    try { await deleteTheme(id).unwrap(); toast.success('Deleted'); refetch(); }
    catch (e) { toast.error(e?.data?.error || 'Cannot delete'); }
  }

  const themes = data?.themes || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 font-medium">{themes.length} theme{themes.length !== 1 ? 's' : ''}</p>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setEditTheme(null); setShowUpload(true); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-xl text-xs font-bold shadow-sm shadow-violet-200">
          <Plus size={13} />Add Theme
        </motion.button>
      </div>

      {isLoading ? <Spinner /> : themes.length === 0 ? (
        <EmptyState icon={Sparkles} text="No themes yet"
          sub="Upload your first decoration theme to start getting bookings"
          action={
            <button onClick={() => setShowUpload(true)}
              className="px-5 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-bold">
              Upload First Theme
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {themes.map(theme => (
            <motion.div key={theme._id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="flex gap-3 p-3.5">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                  {theme.coverImage ? (
                    <img src={theme.coverImage} alt=""
                      className="w-full h-full object-cover" onError={e => e.target.style.display = 'none'} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Star size={20} className="text-slate-300" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-sm text-slate-900 leading-tight truncate">{theme.title}</p>
                    <Pill status={theme.status} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{theme.categoryId?.emoji} {theme.categoryId?.name}</p>
                  <p className="text-sm font-black text-violet-600 mt-1">₹{Math.round((theme.startingPricePaise || 0) / 100).toLocaleString('en-IN')}+</p>
                  {theme.status === 'rejected' && theme.adminNote && (
                    <p className="text-[10px] text-red-500 mt-1 bg-red-50 rounded-lg px-2 py-1">⚠️ {theme.adminNote}</p>
                  )}
                  {theme.status === 'pending' && (
                    <p className="text-[10px] text-amber-600 mt-1">⏳ Under admin review</p>
                  )}
                </div>
              </div>
              {['pending', 'rejected'].includes(theme.status) && (
                <div className="flex gap-2 px-3.5 pb-3">
                  <button onClick={() => { setEditTheme(theme); setShowUpload(true); }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-600 transition-colors">
                    <Edit3 size={12} />Edit
                  </button>
                  <button onClick={() => handleDelete(theme._id)}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 bg-red-50 hover:bg-red-100 rounded-xl text-xs font-semibold text-red-500 transition-colors">
                    <Trash2 size={12} />Delete
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showUpload && (
          <ThemeUploadModal theme={editTheme}
            onClose={() => { setShowUpload(false); setEditTheme(null); }}
            onSuccess={() => { setShowUpload(false); setEditTheme(null); refetch(); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* Theme Upload Modal */
function ThemeUploadModal({ theme, onClose, onSuccess }) {
  const { data: catData } = useGetEventCategoriesQuery();
  const [createTheme] = useCreateEventThemeMutation();
  const [updateTheme] = useUpdateEventThemeMutation();
  const [presignUpload] = usePresignUploadMutation();
  const isEdit = !!theme;

  const [form, setForm] = useState({
    title: theme?.title || '',
    description: theme?.description || '',
    categoryId: theme?.categoryId?._id || theme?.categoryId || '',
    startingPricePaise: theme?.startingPricePaise ? Math.round(theme.startingPricePaise / 100) : '',
    coverImage: theme?.coverImage || '',
    gallery: theme?.gallery || [],
    videoUrl: theme?.videoUrl || '',
    includedItems: theme?.includedItems?.join(', ') || '',
    excludedItems: theme?.excludedItems?.join(', ') || '',
    setupDurationMinutes: theme?.setupDurationMinutes || 120,
    cities: theme?.cities?.join(', ') || '',
    guestCapacityMax: theme?.guestCapacity?.max || 200,
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [coverPreview, setCoverPreview] = useState(theme?.coverImage || null);

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function uploadImage(file, multi = false) {
    setUploading(true);
    try {
      const { data: signed } = await presignUpload({ contentType: file.type || 'image/jpeg', folder: 'event-photos' });
      await fetch(signed.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (multi) {
        set('gallery', [...form.gallery, signed.key]);
      } else {
        set('coverImage', signed.key);
        setCoverPreview(URL.createObjectURL(file));
      }
      toast.success('Uploaded');
    } catch { toast.error('Upload failed'); }
    finally { setUploading(false); }
  }

  async function handleSave() {
    if (!form.title || !form.categoryId || !form.startingPricePaise || !form.coverImage) {
      return toast.error('Fill in title, category, price and cover photo');
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title, description: form.description, categoryId: form.categoryId,
        startingPricePaise: Number(form.startingPricePaise) * 100,
        coverImage: form.coverImage, gallery: form.gallery, videoUrl: form.videoUrl || undefined,
        includedItems: form.includedItems.split(',').map(s => s.trim()).filter(Boolean),
        excludedItems: form.excludedItems ? form.excludedItems.split(',').map(s => s.trim()).filter(Boolean) : [],
        setupDurationMinutes: Number(form.setupDurationMinutes),
        cities: form.cities.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
        guestCapacity: { min: 1, max: Number(form.guestCapacityMax) },
      };
      if (isEdit) await updateTheme({ id: theme._id, ...payload }).unwrap();
      else await createTheme(payload).unwrap();
      toast.success(isEdit ? 'Theme updated — pending review' : 'Theme submitted for review! 🎉');
      onSuccess();
    } catch (e) { toast.error(e?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} transition={{ type: 'spring', damping: 25 }}
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h3 className="font-black text-slate-900">{isEdit ? 'Edit Theme' : 'Upload New Theme'}</h3>
            <p className="text-xs text-slate-400 mt-0.5">Admin reviews within 24 hours</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
            <X size={15} className="text-slate-600" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Cover photo */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-2">Cover Photo <span className="text-red-400">*</span></label>
            <label className="block border-2 border-dashed border-slate-200 rounded-2xl overflow-hidden cursor-pointer hover:border-violet-300 transition-all">
              {coverPreview ? (
                <div className="relative h-44">
                  <img src={coverPreview} alt=""
                    className="w-full h-full object-cover" onError={e => e.target.style.display = 'none'} />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <p className="text-white text-xs font-bold">Click to change</p>
                  </div>
                </div>
              ) : (
                <div className="h-36 flex flex-col items-center justify-center text-slate-400 gap-2">
                  {uploading ? <Loader2 size={22} className="animate-spin text-violet-400" /> : (
                    <><Camera size={22} className="text-slate-300" /><span className="text-xs font-medium">Upload cover photo</span></>
                  )}
                </div>
              )}
              <input type="file" accept="image/*" onChange={e => e.target.files[0] && uploadImage(e.target.files[0])} className="hidden" />
            </label>
          </div>

          {/* Core fields */}
          {[
            { k: 'title', label: 'Theme Title *', placeholder: 'e.g. Pastel Birthday Wonderland' },
            { k: 'description', label: 'Description', placeholder: 'Describe the setup, mood, style…', multi: true },
            { k: 'includedItems', label: 'Included (comma separated)', placeholder: 'Balloons, Backdrop, Table setup…' },
            { k: 'excludedItems', label: 'Not Included', placeholder: 'Cake, DJ, Catering…' },
            { k: 'cities', label: 'Cities Served', placeholder: 'bangalore, mumbai, hyderabad' },
            { k: 'videoUrl', label: 'Video URL (optional)', placeholder: 'YouTube / Drive link' },
          ].map(({ k, label, placeholder, multi }) => (
            <div key={k}>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">{label}</label>
              {multi ? (
                <textarea value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder} rows={2}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none resize-none transition-all" />
              ) : (
                <input value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none transition-all" />
              )}
            </div>
          ))}

          {/* Category + Price grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Category *</label>
              <select value={form.categoryId} onChange={e => set('categoryId', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-violet-400 outline-none bg-white">
                <option value="">Select…</option>
                {(catData?.categories || []).map(c => <option key={c._id} value={c._id}>{c.emoji} {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Starting Price (₹) *</label>
              <input type="number" min={0} value={form.startingPricePaise} onChange={e => set('startingPricePaise', e.target.value)}
                placeholder="3500"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-violet-400 outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Setup Duration (min)</label>
              <input type="number" min={30} value={form.setupDurationMinutes} onChange={e => set('setupDurationMinutes', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-violet-400 outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Max Guests</label>
              <input type="number" min={1} value={form.guestCapacityMax} onChange={e => set('guestCapacityMax', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-violet-400 outline-none" />
            </div>
          </div>

          <motion.button whileTap={{ scale: 0.97 }} onClick={handleSave} disabled={saving || uploading}
            className="w-full py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-violet-200">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {saving ? 'Saving…' : isEdit ? 'Update & Resubmit' : 'Submit for Review'}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* Bookings */
function BookingsTab() {
  const [statusFilter, setStatusFilter] = useState('confirmed');
  const [page, setPage] = useState(1);
  const { data, isLoading, refetch } = usePartnerBookingsQuery({ status: statusFilter || undefined, page });
  const [updateStatus] = useUpdatePartnerBookingStatusMutation();
  const [declineBooking] = useDeclineEventBookingMutation();
  // Starting setup at the venue needs the host's code (server: jobs/start-code).
  const gate = useStartCodeGate();

  const NEXT = {
    confirmed: { label: 'On My Way', next: 'partner_assigned', color: 'bg-blue-500' },
    partner_assigned: { label: 'Start Setup', next: 'in_progress', color: 'bg-orange-500' },
    in_progress: { label: 'Mark Done ✓', next: 'completed', color: 'bg-emerald-500' },
  };
  const FILTERS = ['', 'confirmed', 'partner_assigned', 'in_progress', 'completed', 'cancelled'];

  async function handleStatus(id, next) {
    try {
      await gate.run((code) => updateStatus({ id, status: next, code }).unwrap().then((r) => { toast.success('Status updated'); refetch(); return r; }));
    }
    catch (e) { toast.error(e?.data?.error || 'Failed'); }
  }
  async function handleDecline(id) {
    const reason = window.prompt('Reason for declining:');
    if (reason === null) return;
    try { await declineBooking({ id, reason: reason || 'Partner unavailable' }).unwrap(); toast.success('Booking declined'); refetch(); }
    catch (e) { toast.error(e?.data?.error || 'Failed'); }
  }

  return (
    <div className="space-y-4">
      {gate.prompt}
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
        {FILTERS.map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${statusFilter === s ? 'bg-violet-600 text-white border-violet-600 shadow-sm shadow-violet-200' : 'bg-white text-slate-500 border-slate-200'}`}>
            {s.replace(/_/g, ' ') || 'All'}
          </button>
        ))}
      </div>

      {isLoading ? <Spinner /> : !(data?.bookings?.length) ? (
        <EmptyState icon={Package} text="No bookings" sub="Bookings will appear here once customers book your themes" />
      ) : (
        <div className="space-y-3">
          {data.bookings.map(b => (
            <motion.div key={b._id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="font-bold text-sm text-slate-900">{b.themeId?.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{b.userId?.name} · {b.userId?.phone}</p>
                </div>
                <Pill status={b.status} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-50 rounded-xl px-3 py-2">
                  <p className="text-slate-400 text-[10px] font-medium">DATE</p>
                  <p className="font-bold text-slate-700 mt-0.5">
                    {b.eventDate ? new Date(b.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                    {b.eventTimeSlot && ` · ${b.eventTimeSlot}`}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl px-3 py-2">
                  <p className="text-slate-400 text-[10px] font-medium">AMOUNT</p>
                  <p className="font-black text-slate-900 mt-0.5">₹{Math.round((b.pricing?.totalPaise || 0) / 100).toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-slate-50 rounded-xl px-3 py-2 col-span-2">
                  <p className="text-slate-400 text-[10px] font-medium">VENUE</p>
                  <p className="font-bold text-slate-700 mt-0.5 truncate">{b.address?.line1}, {b.address?.city} · 👥 {b.guestCount}</p>
                </div>
              </div>

              {b.notes && (
                <p className="text-xs text-indigo-600 bg-indigo-50 rounded-xl px-3 py-2">📝 {b.notes}</p>
              )}

              <div className="flex gap-2">
                {b.status === 'confirmed' && (
                  <button onClick={() => handleDecline(b._id)}
                    className="flex-1 py-2.5 border border-red-200 text-red-500 rounded-xl text-xs font-bold hover:bg-red-50 transition-colors">
                    Decline
                  </button>
                )}
                {NEXT[b.status] && (
                  <motion.button whileTap={{ scale: 0.96 }} onClick={() => handleStatus(b._id, NEXT[b.status].next)}
                    className={`flex-1 py-2.5 ${NEXT[b.status].color} text-white rounded-xl text-xs font-bold shadow-sm`}>
                    {NEXT[b.status].label}
                  </motion.button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Calendar date action sheet */
function DateActionSheet({ day, isBlocked, booking, onBlock, onUnblock, onClose }) {
  const [loading, setLoading] = useState(false);
  const label = day.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  async function act(fn) {
    setLoading(true);
    try { await fn(); onClose(); }
    catch { /* errors toasted in caller */ }
    finally { setLoading(false); }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="bg-white w-full max-w-sm rounded-t-3xl px-5 pt-5 pb-8 space-y-3">

        {/* Handle */}
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />

        {/* Date header */}
        <div className="flex items-center gap-3 mb-2">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl
            ${booking ? 'bg-blue-100 text-blue-600' : isBlocked ? 'bg-red-100 text-red-500' : 'bg-violet-100 text-violet-600'}`}>
            {day.getDate()}
          </div>
          <div>
            <p className="font-black text-slate-900 text-sm">{label}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {booking ? `Booked · ${booking.themeId?.title}` : isBlocked ? 'Blocked by you' : 'Available'}
            </p>
          </div>
        </div>

        {/* Booking details */}
        {booking && (
          <div className="bg-blue-50 rounded-2xl p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-blue-900">{booking.themeId?.title}</p>
              <Pill status={booking.status} />
            </div>
            <p className="text-xs text-blue-700">{booking.eventTimeSlot || 'Time not set'} · 👥 {booking.guestCount} guests</p>
            <p className="text-xs text-blue-600 truncate">📍 {booking.address?.city || 'Location not set'}</p>
            <p className="text-xs font-black text-blue-900">₹{Math.round((booking.pricing?.totalPaise || 0) / 100).toLocaleString('en-IN')}</p>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2 pt-1">
          {!booking && !isBlocked && (
            <motion.button whileTap={{ scale: 0.97 }} disabled={loading}
              onClick={() => act(onBlock)}
              className="w-full py-3.5 bg-gradient-to-r from-red-500 to-rose-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-50">
              {loading ? <Loader2 size={15} className="animate-spin" /> : '🔒'}
              Block this date
            </motion.button>
          )}
          {!booking && isBlocked && (
            <motion.button whileTap={{ scale: 0.97 }} disabled={loading}
              onClick={() => act(onUnblock)}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-50">
              {loading ? <Loader2 size={15} className="animate-spin" /> : '🔓'}
              Unblock this date
            </motion.button>
          )}
          {booking && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-2">
              <span className="text-sm">⚠️</span>
              <p className="text-xs text-amber-700 font-medium">This date has a confirmed booking. Cancel the booking first to block it.</p>
            </div>
          )}
          <button onClick={onClose}
            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-sm transition-colors">
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* Calendar */
function CalendarTab() {
  const { data, isLoading, refetch } = usePartnerCalendarQuery();
  const [blockDate] = useBlockEventDateMutation();
  const [unblockDate] = useUnblockEventDateMutation();
  const [selected, setSelected] = useState(null); // { day, isBlocked, booking }

  const blocked = (data?.blockedDates || []).map(d => new Date(d).toDateString());
  const bookings = data?.bookings || [];
  const days = Array.from({ length: 60 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });

  function handleDayClick(day) {
    const ds = day.toDateString();
    const isBlk = blocked.includes(ds);
    const booking = bookings.find(b => new Date(b.eventDate).toDateString() === ds);
    setSelected({ day, isBlocked: isBlk, booking });
  }

  async function doBlock() {
    const iso = selected.day.toISOString().split('T')[0];
    await blockDate({ date: iso }).unwrap();
    toast.success('Date blocked');
    refetch();
  }

  async function doUnblock() {
    const iso = selected.day.toISOString().split('T')[0];
    await unblockDate(iso).unwrap();
    toast.success('Date unblocked');
    refetch();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 bg-violet-50 rounded-2xl px-4 py-3">
        <Calendar size={15} className="text-violet-500 shrink-0" />
        <p className="text-xs text-violet-700 font-medium">Tap any date to see options — block, unblock, or view booking details.</p>
      </div>

      {isLoading ? <Spinner /> : (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <div className="grid grid-cols-7 gap-1.5 mb-3">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <div key={d} className="text-center text-[10px] font-black text-slate-400">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: days[0].getDay() }).map((_, i) => <div key={`e${i}`} />)}
            {days.map(day => {
              const ds = day.toDateString();
              const isBlk = blocked.includes(ds);
              const isBkd = !!bookings.find(b => new Date(b.eventDate).toDateString() === ds);
              const isPast = day < new Date(new Date().setHours(0, 0, 0, 0));
              const isToday = day.toDateString() === new Date().toDateString();
              return (
                <motion.button key={ds}
                  whileHover={!isPast ? { scale: 1.08 } : {}}
                  whileTap={!isPast ? { scale: 0.88 } : {}}
                  disabled={isPast}
                  onClick={() => !isPast && handleDayClick(day)}
                  className={`aspect-square rounded-xl text-xs font-bold transition-all flex items-center justify-center relative
                    ${isPast ? 'opacity-20 cursor-not-allowed text-slate-400'
                      : isBkd ? 'bg-blue-500 text-white shadow-sm shadow-blue-200'
                        : isBlk ? 'bg-red-500 text-white shadow-sm shadow-red-200'
                          : isToday ? 'bg-violet-600 text-white shadow-sm shadow-violet-200 ring-2 ring-violet-300'
                            : 'bg-slate-50 text-slate-700 hover:bg-violet-50 hover:text-violet-700'}`}>
                  {day.getDate()}
                  {(isBkd || isBlk) && !isPast && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white/60" />
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 flex-wrap text-xs">
        {[
          ['bg-violet-600', 'Today'],
          ['bg-blue-500', 'Booked'],
          ['bg-red-500', 'Blocked'],
          ['bg-slate-100 border border-slate-200', 'Available'],
        ].map(([cls, lbl]) => (
          <div key={lbl} className="flex items-center gap-1.5">
            <div className={`w-3.5 h-3.5 rounded-md ${cls}`} />
            <span className="text-slate-500 font-medium">{lbl}</span>
          </div>
        ))}
      </div>

      {/* Upcoming events list */}
      {bookings.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Upcoming Bookings</p>
          {bookings.map(b => (
            <div key={b._id} className="flex items-center justify-between bg-blue-50 rounded-2xl px-4 py-3 cursor-pointer hover:bg-blue-100 transition-colors"
              onClick={() => handleDayClick(new Date(b.eventDate))}>
              <div>
                <p className="font-bold text-sm text-slate-900">{b.themeId?.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(b.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  {b.eventTimeSlot && ` · ${b.eventTimeSlot}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Pill status={b.status} />
                <ChevronRight size={14} className="text-slate-300" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action sheet */}
      <AnimatePresence>
        {selected && (
          <DateActionSheet
            day={selected.day}
            isBlocked={selected.isBlocked}
            booking={selected.booking}
            onBlock={doBlock}
            onUnblock={doUnblock}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* Earnings */
function EarningsTab() {
  const { data, isLoading } = usePartnerEarningsQuery();
  if (isLoading) return <Spinner />;
  const d = data || {};
  const gross = d.grossPaise || 0;
  const net = d.netPaise || 0;
  const plat = d.platformPaise || 0;
  const netPct = gross > 0 ? Math.round((net / gross) * 100) : 85;

  return (
    <div className="space-y-4">
      {/* Hero earnings */}
      <div className="rounded-3xl p-6 text-white" style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 60%, #34d399 100%)' }}>
        <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Total Net Earnings</p>
        <p className="text-4xl font-black mt-1">₹{Math.round(net / 100).toLocaleString('en-IN')}</p>
        <p className="text-white/60 text-xs mt-2">From {d.totalJobs || 0} completed events</p>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Gross', value: `₹${Math.round(gross / 100).toLocaleString('en-IN')}`, color: 'text-slate-900', bg: 'bg-white' },
          { label: 'You Keep', value: `100%`, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-2xl border border-slate-100 p-3 text-center`}>
            <p className="text-[10px] text-slate-500 font-bold uppercase">{label}</p>
            <p className={`text-base font-black mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Monthly */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Monthly Breakdown</p>
        {d.monthly?.length ? (
          <div className="space-y-3">
            {d.monthly.map(m => {
              const mGross = m.grossPaise || 0;
              const maxMonth = Math.max(...(d.monthly || []).map(x => x.grossPaise || 0)) || 1;
              const pct = Math.round((mGross / maxMonth) * 100);
              return (
                <div key={`${m._id.year}-${m._id.month}`}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-600 font-medium text-xs">
                      {new Date(m._id.year, m._id.month - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                    </span>
                    <div className="text-right">
                      <span className="font-black text-slate-900">₹{Math.round(mGross / 100).toLocaleString('en-IN')}</span>
                      <span className="text-[10px] text-slate-400 ml-1">({m.count} jobs)</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }}
                      className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full" />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-400 text-center py-4">No completed jobs yet</p>
        )}
      </div>
    </div>
  );
}

/* KYC Doc thumbnail */
function KycDocThumb({ idx, token }) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(false);
  const objRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/events/partner/kyc/stream/${idx}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
      .then(blob => {
        if (cancelled) return;
        if (objRef.current) URL.revokeObjectURL(objRef.current);
        const u = URL.createObjectURL(blob);
        objRef.current = u;
        setUrl(u);
      })
      .catch(() => setUrl(null))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [idx, token]);

  useEffect(() => () => { if (objRef.current) URL.revokeObjectURL(objRef.current); }, []);

  return (
    <>
      {lightbox && url && (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur flex items-center justify-center"
          onClick={() => setLightbox(false)}>
          <img src={url} alt={`Doc ${idx + 1}`} className="max-h-[90vh] max-w-[90vw] rounded-2xl" />
          <button className="absolute top-5 right-5 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white">
            <X size={16} />
          </button>
        </div>
      )}
      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
        onClick={() => url && setLightbox(true)}
        className={`w-16 h-16 rounded-xl border-2 overflow-hidden flex items-center justify-center cursor-pointer
          ${url ? 'border-emerald-300 shadow-sm shadow-emerald-100' : 'border-slate-200 bg-slate-50'}`}>
        {loading ? <Loader2 size={14} className="animate-spin text-slate-300" />
          : url ? <img src={url} alt="" className="w-full h-full object-cover" />
            : <FileText size={16} className="text-slate-300" />}
      </motion.div>
    </>
  );
}

/* KYC Section */
const KYC_FIELDS = [
  { key: 'aadharFront', label: 'Aadhar Card — Front', emoji: '🪪', mandatory: true, hint: 'Front side of your Aadhar card' },
  { key: 'aadharBack', label: 'Aadhar Card — Back', emoji: '🪪', mandatory: true, hint: 'Back side of your Aadhar card' },
  { key: 'panCard', label: 'PAN Card', emoji: '🗂️', mandatory: true, hint: 'Clear photo of your PAN card' },
  { key: 'liveSelfie', label: 'Live Selfie', emoji: '🤳', mandatory: true, hint: 'Take a clear selfie right now', camera: true },
  { key: 'gstCertificate', label: 'GST Certificate', emoji: '📋', mandatory: false, hint: 'GST registration certificate (optional)' },
  { key: 'businessRegistration', label: 'Business Registration', emoji: '📄', mandatory: false, hint: 'Shop act / MSME / any biz registration' },
];

function KycDocUploadField({ field, currentKey, onUploaded, disabled, token }) {
  const [presignUpload] = usePresignUploadMutation();
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  // Load existing doc preview
  useEffect(() => {
    if (!currentKey || !token) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/events/partner/kyc/stream/field/${field.key}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.blob() : null)
      .then(blob => { if (!cancelled && blob) setPreviewUrl(URL.createObjectURL(blob)); })
      .catch(() => { });
    return () => { cancelled = true; };
  }, [currentKey, field.key, token]);

  async function upload(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast.error('Max 10MB');
    setUploading(true);
    try {
      const { data: signed } = await presignUpload({ contentType: file.type || 'image/jpeg', folder: 'kyc-docs' });
      await fetch(signed.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      setPreviewUrl(URL.createObjectURL(file));
      onUploaded(field.key, signed.key);
      toast.success(`${field.label} uploaded`);
    } catch { toast.error('Upload failed'); }
    finally { setUploading(false); }
  }

  async function handleSelfieCapture(blob) {
    setCameraOpen(false);
    const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
    await upload(file);
  }

  const uploaded = !!currentKey;

  return (
    <>
      {cameraOpen && (
        <LiveSelfieCapture
          onCapture={handleSelfieCapture}
          onCancel={() => setCameraOpen(false)}
        />
      )}

      <div className={`rounded-2xl border-2 p-4 transition-all ${uploaded ? 'border-emerald-200 bg-emerald-50/30' : field.mandatory ? 'border-violet-200 bg-violet-50/20' : 'border-slate-200 bg-white'}`}>
        <div className="flex items-center gap-3">
          {/* Preview / icon */}
          <div className={`w-14 h-14 rounded-xl overflow-hidden shrink-0 border-2 flex items-center justify-center relative
            ${uploaded ? 'border-emerald-300' : 'border-slate-200 bg-slate-50'}`}>
            {previewUrl ? (
              <img src={previewUrl} alt={field.label} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl">{field.emoji}</span>
            )}
            {uploaded && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-white">
                <CheckCircle size={10} className="text-white" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold text-slate-900 leading-tight">{field.label}</p>
              {field.mandatory && <span className="text-[10px] text-red-500 font-bold">*</span>}
              {!field.mandatory && <span className="text-[10px] text-slate-400 font-medium">(optional)</span>}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">{field.hint}</p>
            {uploaded && <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">✓ Uploaded</p>}
          </div>

          {/* Action buttons */}
          {!disabled && (
            <div className="flex flex-col gap-1.5 shrink-0">
              {field.camera ? (
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => setCameraOpen(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-violet-600 text-white rounded-xl text-xs font-bold">
                  <Camera size={11} />{uploaded ? 'Retake' : 'Selfie'}
                </motion.button>
              ) : (
                <label className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors">
                  {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                  {uploaded ? 'Replace' : 'Upload'}
                  <input type="file" accept="image/*,.pdf" onChange={e => upload(e.target.files?.[0])} className="hidden" />
                </label>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function KycSection({ partner, token, onRefresh }) {
  const [updateMe] = useUpdatePartnerMeMutation();
  const [saving, setSaving] = useState(false);
  const kycStatus = partner?.kyc?.status || 'not_submitted';
  const kyc = partner?.kyc || {};

  // Track unsaved uploads: fieldKey → s3Key
  const [pending, setPending] = useState({});
  const [showPendingDocs, setShowPendingDocs] = useState(false);

  function handleUploaded(fieldKey, s3Key) {
    setPending(p => ({ ...p, [fieldKey]: s3Key }));
  }

  const mandatoryDone = KYC_FIELDS.filter(f => f.mandatory).every(f => kyc[f.key] || pending[f.key]);
  const hasPending = Object.keys(pending).length > 0;

  async function submitKyc() {
    if (!mandatoryDone) return toast.error('Upload all mandatory documents first');
    setSaving(true);
    try {
      await updateMe({ ...pending, gstNumber: kyc.gstNumber, panNumber: kyc.panNumber }).unwrap();
      setPending({});
      toast.success('KYC documents submitted for review 🎉');
      onRefresh();
    } catch (e) { toast.error(e?.data?.error || 'Submission failed'); }
    finally { setSaving(false); }
  }

  const KYC_STYLE = {
    approved: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    pending: 'bg-amber-100   text-amber-700   border-amber-200',
    rejected: 'bg-red-100     text-red-600     border-red-200',
    not_submitted: 'bg-slate-100   text-slate-500   border-slate-200',
  };

  // Progress
  const totalMandatory = KYC_FIELDS.filter(f => f.mandatory).length;
  const doneMandatory = KYC_FIELDS.filter(f => f.mandatory).filter(f => kyc[f.key] || pending[f.key]).length;
  const progressPct = Math.round((doneMandatory / totalMandatory) * 100);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-violet-500" />
          <p className="font-black text-slate-900">KYC Verification</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${KYC_STYLE[kycStatus]}`}>
          {kycStatus.replace('_', ' ')}
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* Status banners */}
        {kycStatus === 'approved' && (
          <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <BadgeCheck size={16} className="text-emerald-500 shrink-0" />
            <p className="text-xs text-emerald-700 font-semibold">KYC approved — you can upload themes and accept bookings</p>
          </div>
        )}
        {kycStatus === 'pending' && (
          <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <Clock size={16} className="text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700 font-semibold">Documents under review — admin will respond within 24 hours</p>
          </div>
        )}
        {kycStatus === 'rejected' && kyc.reviewNote && (
          <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl p-3">
            <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-600 font-semibold">Rejected: {kyc.reviewNote} — re-upload correct documents</p>
          </div>
        )}

        {/* Toggle button for pending state */}
        {kycStatus === 'pending' && !showPendingDocs && (
          <button onClick={() => setShowPendingDocs(true)}
            className="w-full py-3 bg-violet-50 text-violet-700 font-bold text-[13px] rounded-xl flex items-center justify-center gap-2 hover:bg-violet-100 transition-colors mt-2">
            <FileText size={16} /> View Uploaded Documents
          </button>
        )}

        {/* Progress bar */}
        {(kycStatus !== 'approved' && (kycStatus !== 'pending' || showPendingDocs)) && (
          <div>
            {kycStatus === 'pending' && showPendingDocs && (
              <div className="flex justify-end mb-3">
                <button onClick={() => setShowPendingDocs(false)} className="text-xs text-violet-600 font-bold hover:underline">
                  Hide Documents
                </button>
              </div>
            )}
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-bold text-slate-600">Mandatory documents</p>
              <p className="text-xs font-black text-violet-600">{doneMandatory}/{totalMandatory}</p>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${progressPct}%` }} transition={{ duration: 0.5 }}
                className={`h-full rounded-full ${progressPct === 100 ? 'bg-emerald-500' : 'bg-violet-500'}`} />
            </div>
          </div>
        )}

        {/* Document fields */}
        {(kycStatus !== 'approved' && (kycStatus !== 'pending' || showPendingDocs)) && (
          <div className="space-y-3">
            {KYC_FIELDS.map(field => (
              <KycDocUploadField key={field.key} field={field}
                currentKey={kyc[field.key] || pending[field.key]}
                onUploaded={handleUploaded}
                disabled={kycStatus === 'pending'}
                token={token} />
            ))}
          </div>
        )}

        {/* Text fields */}
        {(kycStatus !== 'approved' && (kycStatus !== 'pending' || showPendingDocs)) && (
          <div className="grid grid-cols-2 gap-3 mt-4">
            {[{ k: 'panNumber', label: 'PAN Number', placeholder: 'ABCDE1234F' },
            { k: 'gstNumber', label: 'GST Number (optional)', placeholder: '22AAAAA0000A1Z5' }
            ].map(({ k, label, placeholder }) => (
              <div key={k}>
                <label className="text-xs font-bold text-slate-600 block mb-1">{label}</label>
                <input defaultValue={kyc[k] || ''} placeholder={placeholder}
                  onChange={e => setPending(p => ({ ...p, [k]: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono focus:border-violet-400 outline-none uppercase" />
              </div>
            ))}
          </div>
        )}

        {/* Submit button */}
        {kycStatus !== 'approved' && kycStatus !== 'pending' && (
          <motion.button whileTap={{ scale: 0.97 }}
            onClick={submitKyc}
            disabled={saving || !mandatoryDone || (!hasPending && kycStatus !== 'rejected')}
            className="w-full py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 disabled:opacity-40 shadow-md shadow-violet-200">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            {saving ? 'Submitting…' : mandatoryDone ? 'Submit for KYC Review' : `Upload ${totalMandatory - doneMandatory} more required doc${totalMandatory - doneMandatory !== 1 ? 's' : ''}`}
          </motion.button>
        )}

        {kycStatus === 'approved' && (
          <div className="space-y-2">
            {KYC_FIELDS.map(f => (
              <div key={f.key} className="flex items-center gap-2 text-xs">
                <span>{f.emoji}</span>
                <span className="font-medium text-slate-600">{f.label}</span>
                <span className="ml-auto">{kyc[f.key] ? '✅' : f.mandatory ? '—' : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* Profile Graphic Helpers */
function EventFloralArchIllustration() {
  return (
    <svg viewBox="0 0 320 125" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* Wedding Arch Frame */}
      <path d="M70 120 V50 C70 15 150 15 150 50 V120" stroke="url(#arch_grad)" strokeWidth="6" strokeLinecap="round" />
      <path d="M80 120 V55 C80 25 140 25 140 55 V120" stroke="#f3e8ff" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />

      {/* Arch Flowers Top */}
      <circle cx="110" cy="22" r="14" fill="#e879f9" opacity="0.85" />
      <circle cx="92" cy="30" r="11" fill="#c084fc" opacity="0.85" />
      <circle cx="128" cy="30" r="11" fill="#f472b6" opacity="0.85" />
      <circle cx="110" cy="22" r="7" fill="#fdf4ff" />
      <circle cx="78" cy="46" r="9" fill="#e879f9" opacity="0.75" />
      <circle cx="142" cy="46" r="9" fill="#c084fc" opacity="0.75" />
      <path d="M98 15 C102 5 118 5 122 15" stroke="#a855f7" strokeWidth="3" strokeLinecap="round" />

      {/* Flower Podiums & Stands */}
      <rect x="35" y="85" width="28" height="35" rx="5" fill="#f3e8ff" stroke="#d8b4fe" strokeWidth="2" />
      <circle cx="49" cy="78" r="12" fill="#e879f9" opacity="0.9" />
      <circle cx="41" cy="82" r="8" fill="#c084fc" opacity="0.8" />
      <circle cx="57" cy="82" r="8" fill="#f472b6" opacity="0.8" />

      <rect x="156" y="85" width="28" height="35" rx="5" fill="#f3e8ff" stroke="#d8b4fe" strokeWidth="2" />
      <circle cx="170" cy="78" r="12" fill="#c084fc" opacity="0.9" />
      <circle cx="162" cy="82" r="8" fill="#e879f9" opacity="0.8" />
      <circle cx="178" cy="82" r="8" fill="#f472b6" opacity="0.8" />

      {/* Welcome Easel Board on the Right */}
      <path d="M225 120 L238 60 L251 120" stroke="#c084fc" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M220 95 H256" stroke="#c084fc" strokeWidth="3" strokeLinecap="round" />
      <rect x="218" y="52" width="40" height="48" rx="6" fill="#ffffff" stroke="#a855f7" strokeWidth="3" shadow="sm" />
      <rect x="223" y="57" width="30" height="38" rx="4" fill="#faf5ff" />
      <circle cx="238" cy="68" r="6" fill="#e879f9" opacity="0.7" />
      <path d="M229 80 H247 M232 86 H244" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <circle cx="218" cy="100" r="10" fill="#f472b6" opacity="0.85" />
      <circle cx="256" cy="103" r="9" fill="#c084fc" opacity="0.85" />

      {/* Decorative Leaves/Petals */}
      <circle cx="85" cy="105" r="5" fill="#d8b4fe" />
      <circle cx="135" cy="108" r="4" fill="#f472b6" />
      <circle cx="195" cy="112" r="5" fill="#e879f9" opacity="0.6" />

      <defs>
        <linearGradient id="arch_grad" x1="70" y1="15" x2="150" y2="120" gradientUnits="userSpaceOnUse">
          <stop stopColor="#c084fc" />
          <stop offset="0.5" stopColor="#e879f9" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function ConfettiStageBackground() {
  return (
    <>
      {/* Colorful Confetti Pieces */}
      <div className="absolute top-4 left-6 w-3 h-3 bg-amber-400 rounded-sm rotate-12 opacity-80 pointer-events-none" />
      <div className="absolute top-12 left-16 w-2.5 h-2.5 bg-pink-400 rounded-full opacity-70 pointer-events-none" />
      <div className="absolute top-8 left-32 w-3 h-2 bg-emerald-400 rotate-45 opacity-80 pointer-events-none" />
      <div className="absolute top-20 left-10 w-2.5 h-3.5 bg-blue-400 -rotate-12 opacity-75 pointer-events-none" />
      <div className="absolute top-24 left-28 w-2 h-2 bg-yellow-300 rotate-45 opacity-85 pointer-events-none" />
      <div className="absolute top-6 right-36 w-3 h-3 bg-fuchsia-300 rounded-sm -rotate-12 opacity-80 pointer-events-none" />
      <div className="absolute top-16 right-48 w-2.5 h-2.5 bg-amber-300 rotate-45 opacity-75 pointer-events-none" />
      <div className="absolute bottom-12 left-14 w-3 h-3 bg-pink-300 rotate-12 opacity-70 pointer-events-none" />
      <div className="absolute bottom-16 left-36 w-2 h-2 bg-purple-300 rounded-full opacity-80 pointer-events-none" />

      {/* Subtle Wedding Event Stage Illustration on Right Side */}
      <div className="absolute right-0 top-0 bottom-0 w-1/2 max-w-[340px] pointer-events-none opacity-25 sm:opacity-30 flex items-center justify-end overflow-hidden">
        <svg viewBox="0 0 300 240" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full object-cover">
          {/* Draped Curtains */}
          <path d="M0 0 C50 40 100 20 150 60 C200 20 250 40 300 0 V240 H0 V0 Z" fill="url(#stage_curtain)" />
          {/* Stage Floral Arch Backdrop */}
          <path d="M60 240 V90 C60 40 240 40 240 90 V240" stroke="#ffffff" strokeWidth="12" strokeLinecap="round" opacity="0.6" />
          <path d="M80 240 V105 C80 65 220 65 220 105 V240" stroke="#fdf4ff" strokeWidth="4" opacity="0.8" />
          {/* Royal Couch/Sofa */}
          <path d="M90 190 C90 175 210 175 210 190 V225 H90 V190 Z" fill="#ffffff" opacity="0.75" />
          <path d="M80 185 C80 170 105 170 105 185 V225 H80 V185 Z" fill="#fdf4ff" opacity="0.9" />
          <path d="M195 185 C195 170 220 170 220 185 V225 H195 V185 Z" fill="#fdf4ff" opacity="0.9" />
          {/* Chandelier Glow */}
          <circle cx="150" cy="55" r="22" fill="#ffffff" opacity="0.5" />
          <circle cx="150" cy="55" r="10" fill="#fef08a" opacity="0.8" />
          <defs>
            <linearGradient id="stage_curtain" x1="0" y1="0" x2="300" y2="240" gradientUnits="userSpaceOnUse">
              <stop stopColor="#ffffff" stopOpacity="0.8" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0.1" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </>
  );
}

/* Profile */
function ProfileTab() {
  const { accessToken: token } = useSelector(selectAuth);
  const { data, refetch } = usePartnerMeQuery();
  const [updateMe] = useUpdatePartnerMeMutation();
  const [presignUpload] = usePresignUploadMutation();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const partner = data?.partner;
  const values = form || partner || {};
  const kycStatus = partner?.kyc?.status || 'not_submitted';
  const docs = partner?.kyc?.documents || [];

  async function handlePhotoUpload(file) {
    if (!file) return;
    setUploading(true);
    try {
      const { data: signed } = await presignUpload({ contentType: file.type, folder: 'event-photos' });
      await fetch(signed.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      await updateMe({ profilePhotoKey: signed.key }).unwrap();
      toast.success('Photo updated');
      refetch();
    } catch { toast.error('Upload failed'); }
    finally { setUploading(false); }
  }

  async function handleKycUpload(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return toast.error('File too large — max 8MB');
    if (docs.length >= 5) return toast.error('Max 5 documents allowed');
    setUploading(true);
    try {
      const { data: signed } = await presignUpload({ contentType: file.type || 'image/jpeg', folder: 'kyc-docs' });
      await fetch(signed.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      await updateMe({ kycDocument: signed.key }).unwrap();
      toast.success('Document submitted for review 🎉');
      refetch();
    } catch { toast.error('Upload failed'); }
    finally { setUploading(false); }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      await updateMe({
        bio: values.bio,
        yearsExperience: Number(values.yearsExperience),
        cities: typeof values.cities === 'string'
          ? values.cities.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
          : values.cities,
        serviceRadiusKm: Number(values.serviceRadiusKm),
      }).unwrap();
      toast.success('Profile saved');
      setForm(null);
      refetch();
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  }

  if (!partner) return <Spinner />;

  return (
    <form onSubmit={handleSave} className="space-y-6 pb-6">
      {/* Vibrant Hero Profile Card */}
      <div className="relative rounded-[36px] overflow-hidden bg-gradient-to-br from-[#6b21a8] via-[#a21caf] to-[#ec4899] p-7 sm:p-10 shadow-2xl shadow-fuchsia-500/20 border border-white/15">
        <ConfettiStageBackground />

        <div className="relative z-10 flex flex-col items-center text-center mt-2">
          <label className="relative cursor-pointer group mb-4 inline-block">
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden bg-gradient-to-tr from-violet-500 to-fuchsia-500 border-[4px] sm:border-[5px] border-white flex items-center justify-center shadow-2xl transition-transform duration-300 group-hover:scale-105">
              {partner.profilePhotoKey ? (
                <img src={partner.profilePhotoKey} alt="" className="w-full h-full object-cover rounded-full"
                  onError={e => e.target.style.display = 'none'} />
              ) : (
                <span className="text-white font-black text-5xl tracking-tighter drop-shadow-md">{partner.businessName?.[0]?.toUpperCase()}</span>
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full bg-white text-[#9333ea] shadow-xl flex items-center justify-center border-2 border-slate-50 group-hover:scale-110 group-hover:bg-violet-50 transition-all duration-300 z-20">
              {uploading ? <Loader2 size={18} className="animate-spin text-fuchsia-600" /> : <Camera size={18} />}
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={e => handlePhotoUpload(e.target.files?.[0])} />
          </label>

          <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight drop-shadow-md mt-2">{partner.businessName}</h2>

          <div className="mt-3">
            <div className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full bg-white/15 hover:bg-white/20 border border-white/25 backdrop-blur-md text-white font-extrabold text-sm sm:text-[15px] shadow-sm transition-all">
              <Phone size={15} className="text-white/90 shrink-0" />
              <span>{partner.phone || partner.email || 'No contact'}</span>
            </div>
          </div>

          <div className="mt-6 mb-1 inline-flex items-center gap-8 sm:gap-14 px-8 sm:px-11 py-4 sm:py-5 rounded-full bg-[#2e1065]/60 backdrop-blur-xl border border-white/15 shadow-2xl">
            <div className="flex items-center gap-3">
              <Star className="w-7 h-7 text-yellow-400 fill-yellow-400 shrink-0 drop-shadow-sm" />
              <div className="text-left">
                <div className="text-xl sm:text-2xl font-black text-white leading-none">{partner.rating?.toFixed(1) || '0.0'}</div>
                <div className="text-[10px] font-extrabold text-white/70 uppercase tracking-widest mt-1">RATING</div>
              </div>
            </div>
            <div className="w-px h-10 bg-white/20 rounded-full" />
            <div className="flex items-center gap-3">
              <Calendar className="w-7 h-7 text-pink-300 shrink-0 drop-shadow-sm" />
              <div className="text-left">
                <div className="text-xl sm:text-2xl font-black text-white leading-none">{partner.completedEvents || 0}</div>
                <div className="text-[10px] font-extrabold text-white/70 uppercase tracking-widest mt-1">EVENTS</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Business Details Card */}
      <div className="bg-white rounded-[36px] p-6 sm:p-9 shadow-xl shadow-slate-200/50 border border-slate-100/80 space-y-7">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-[18px] bg-[#f3e8ff] flex items-center justify-center shadow-inner">
            <FileText size={24} className="text-[#9333ea]" />
          </div>
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Business Details</h3>
            <p className="text-xs font-semibold text-slate-400 mt-0.5">Manage your public profile & service areas</p>
          </div>
        </div>

        <div>
          <span className="text-[11px] font-extrabold text-slate-500 tracking-widest uppercase block mb-3 pl-1">
            ABOUT YOUR BUSINESS
          </span>
          <div className="relative rounded-[28px] border border-violet-200/80 bg-gradient-to-br from-violet-50/70 via-purple-50/40 to-pink-50/50 p-6 sm:p-8 overflow-hidden transition-all group focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-500/15 shadow-sm min-h-[180px] flex flex-col justify-between">
            <div className="text-4xl sm:text-5xl font-serif font-black text-[#9333ea]/70 leading-none mb-3 select-none">
              “
            </div>
            <textarea
              value={values.bio || ''}
              onChange={e => setForm(p => ({ ...(p || values), bio: e.target.value }))}
              placeholder="Tell customers about your work..."
              rows={3}
              className="w-full bg-transparent border-none p-0 text-slate-700 text-[15px] sm:text-[16px] font-semibold placeholder:text-slate-500/80 focus:ring-0 outline-none resize-none relative z-10 leading-relaxed max-w-[75%]"
            />
            <div className="absolute bottom-2 right-3 w-48 sm:w-64 h-auto pointer-events-none opacity-90 z-0 select-none">
              <EventFloralArchIllustration />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-1">
          {[
            { k: 'yearsExperience', label: 'Years of Experience', placeholder: 'e.g. 5', type: 'number', Icon: Award, iconColor: 'text-violet-500' },
            { k: 'cities', label: 'Cities Served', placeholder: 'e.g. bangalore, mumbai', type: 'text', Icon: MapPin, iconColor: 'text-fuchsia-500' },
            { k: 'serviceRadiusKm', label: 'Service Radius (km)', placeholder: 'e.g. 30', type: 'number', Icon: Briefcase, iconColor: 'text-pink-500' },
          ].map(({ k, label, placeholder, type, Icon, iconColor }) => (
            <div key={k} className="relative group">
              <label className="text-[11px] font-extrabold text-slate-500 group-focus-within:text-[#9333ea] uppercase tracking-wider block mb-2 pl-1 transition-colors flex items-center gap-1.5">
                <Icon size={14} className={iconColor} />
                {label}
              </label>
              <input
                type={type}
                value={values[k] || ''}
                onChange={e => setForm(p => ({ ...(p || values), [k]: e.target.value }))}
                placeholder={placeholder}
                className="w-full bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 rounded-[22px] px-5 py-4 text-[15px] font-extrabold text-slate-800 focus:bg-white focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 outline-none transition-all placeholder:text-slate-400 shadow-sm"
              />
            </div>
          ))}
        </div>

        <AnimatePresence>
          {form && (
            <motion.div initial={{ opacity: 0, height: 0, marginTop: 0 }} animate={{ opacity: 1, height: 'auto', marginTop: 24 }} exit={{ opacity: 0, height: 0, marginTop: 0 }} className="pt-2">
              <motion.button type="submit" whileTap={{ scale: 0.98 }} disabled={saving}
                className="w-full py-4 bg-gradient-to-r from-[#7e22ce] via-[#c026d3] to-[#ec4899] text-white rounded-[24px] font-black text-[16px] flex items-center justify-center gap-2.5 shadow-[0_10px_25px_rgba(168,85,247,0.35)] hover:shadow-[0_10px_35px_rgba(168,85,247,0.5)] transition-all disabled:opacity-50 disabled:grayscale-[30%]">
                {saving ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                {saving ? 'Saving Profile…' : 'Save Changes'}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* KYC Section */}
      <KycSection partner={partner} token={token} onRefresh={refetch} />
    </form>
  );
}

/* Notification icon config */
const NOTIF_META = {
  event_booking_new: { icon: '🎉', color: 'bg-violet-100 text-violet-600' },
  event_partner_kyc_approved: { icon: '✅', color: 'bg-emerald-100 text-emerald-600' },
  event_partner_kyc_rejected: { icon: '❌', color: 'bg-red-100 text-red-600' },
  event_booking_cancelled: { icon: '⚠️', color: 'bg-amber-100 text-amber-600' },
  event_completed: { icon: '🏆', color: 'bg-blue-100 text-blue-600' },
  wallet_credited: { icon: '💰', color: 'bg-green-100 text-green-600' },
  system_alert: { icon: '📢', color: 'bg-slate-100 text-slate-600' },
  promotional: { icon: '🎁', color: 'bg-pink-100 text-pink-600' },
};
function notifMeta(type) { return NOTIF_META[type] || { icon: '🔔', color: 'bg-slate-100 text-slate-600' }; }

/* Notification Panel */
function NotificationPanel({ onClose }) {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, isLoading, refetch } = usePartnerNotificationsQuery({ page, unreadOnly });
  const [markRead] = useMarkPartnerNotificationReadMutation();
  const [markAllRead] = useMarkAllPartnerNotificationsReadMutation();

  const notifications = data?.items || [];
  const unreadCount = data?.unread || 0;

  async function handleRead(id) {
    await markRead(id).unwrap().catch(() => { });
    refetch();
  }
  async function handleMarkAll() {
    await markAllRead().unwrap().catch(() => { });
    refetch();
    toast.success('All marked as read');
  }

  function timeAgo(date) {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="bg-white w-full max-w-sm h-full flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-violet-100 rounded-xl flex items-center justify-center">
              <Bell size={16} className="text-violet-600" />
            </div>
            <div>
              <p className="font-black text-slate-900 text-sm">Notifications</p>
              {unreadCount > 0 && <p className="text-[10px] text-violet-500 font-semibold">{unreadCount} unread</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button onClick={handleMarkAll} className="text-xs text-violet-600 font-bold hover:text-violet-800 px-2 py-1 rounded-lg hover:bg-violet-50">
                Mark all read
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
              <X size={15} className="text-slate-600" />
            </button>
          </div>
        </div>

        {/* Filter */}
        <div className="px-5 py-3 border-b border-slate-50 flex gap-2 shrink-0">
          {[false, true].map(val => (
            <button key={String(val)} onClick={() => { setUnreadOnly(val); setPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${unreadOnly === val ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {val ? 'Unread' : 'All'}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-violet-300" /></div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-2xl">🔔</div>
              <p className="font-bold text-slate-700 text-sm">No notifications yet</p>
              <p className="text-xs text-slate-400">Booking updates, KYC status, and earnings will show up here</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {notifications.map(n => {
                const { icon, color } = notifMeta(n.type);
                const unread = !n.readAt;
                return (
                  <motion.div key={n._id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                    onClick={() => unread && handleRead(n._id)}
                    className={`flex gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors ${unread ? 'bg-violet-50/40' : ''}`}>
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg shrink-0 ${color}`}>
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm leading-snug ${unread ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                          {n.title}
                        </p>
                        {unread && <div className="w-2 h-2 bg-violet-500 rounded-full shrink-0 mt-1" />}
                      </div>
                      {n.body && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[10px] text-slate-400 mt-1 font-medium">{timeAgo(n.createdAt)}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {data?.pages > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between shrink-0">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-30 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
              ← Prev
            </button>
            <span className="text-xs text-slate-400">{page} / {data.pages}</span>
            <button disabled={page === data.pages} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-30 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
              Next →
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/* Main Dashboard */
const TABS = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'themes', label: 'Themes', Icon: Star },
  { id: 'bookings', label: 'Bookings', Icon: Package },
  { id: 'calendar', label: 'Calendar', Icon: Calendar },
  { id: 'earnings', label: 'Earnings', Icon: Wallet },
  { id: 'profile', label: 'Profile', Icon: User },
];

export default function PartnerDashboard() {
  const dispatch = useDispatch();
  const { accessToken } = useSelector(selectAuth);
  const [doLogout] = useLogoutMutation();
  const [activeTab, setActiveTab] = useState('overview');
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: overview, refetch: refetchOverview } = usePartnerOverviewQuery();
  const { data: meData } = usePartnerMeQuery();
  const { data: notifData, refetch: refetchNotifs } = usePartnerNotificationsQuery(
    { page: 1, unreadOnly: false },
    { skip: !accessToken }
  );
  const pendingCount = overview?.stats?.pendingConfirmations || 0;
  const partner = meData?.partner || overview?.partner;
  const unreadNotifs = notifData?.unread || 0;

  useEffect(() => {
    const id = setInterval(() => refetchNotifs(), 30000);
    return () => clearInterval(id);
  }, []);

  async function handleLogout() {
    try { await doLogout().unwrap(); } catch { }
    dispatch(logout());
  }

  const kycStatus = partner?.kyc?.status;
  const kycApproved = kycStatus === 'approved';
  const KYC_GATED = ['themes', 'bookings', 'calendar', 'earnings'];

  useEffect(() => {
    if (!kycApproved && KYC_GATED.includes(activeTab)) setActiveTab('profile');
  }, [kycApproved, activeTab]);

  const content = (
    <AnimatePresence mode="wait">
      <motion.div key={activeTab}
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
        {activeTab === 'overview' && <OverviewTab onNavigate={setActiveTab} />}
        {activeTab === 'themes' && <ThemesTab />}
        {activeTab === 'bookings' && <BookingsTab />}
        {activeTab === 'calendar' && <CalendarTab />}
        {activeTab === 'earnings' && <EarningsTab />}
        {activeTab === 'profile' && <ProfileTab />}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <div className="min-h-screen bg-slate-50">

      {/* DESKTOP layout (lg+): sidebar + content */}
      <div className="hidden lg:flex min-h-screen">

        {/* Sidebar */}
        <aside className="w-72 bg-[#100a1f] border-r border-white/5 flex flex-col sticky top-0 h-screen text-slate-300">
          {/* Logo */}
          <div className="px-6 py-8 relative overflow-hidden group">
            <div className="flex items-center gap-4 relative z-10">
              <div className="relative">
                <div className="w-11 h-11 bg-gradient-to-br from-[#7462ff] to-[#984dff] rounded-[16px] flex items-center justify-center shadow-lg shadow-violet-500/20">
                  <PartyPopper size={20} className="text-white drop-shadow-sm" />
                </div>
              </div>
              <div>
                <h1 className="font-black text-white text-[19px] leading-none tracking-tight">Zappyone Partner</h1>
                <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest mt-1.5">Event Portal</p>
              </div>
            </div>
          </div>

          {/* Partner mini profile */}
          {partner && (
            <div className="px-5 pb-5">
              <div className="flex items-center gap-3 bg-white/5 rounded-[18px] px-3.5 py-3.5 border border-white/10">
                <div className="w-10 h-10 rounded-[14px] bg-gradient-to-br from-fuchsia-500 to-violet-500 flex items-center justify-center text-white font-black text-sm shrink-0 shadow-md">
                  {partner.businessName?.[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-white text-[13px] truncate">{partner.businessName}</p>
                  <p className="text-[11px] text-white/50 truncate mt-0.5">{partner.phone || partner.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 px-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                <span className="text-[11px] font-semibold text-white/60">Active Partner</span>
              </div>
            </div>
          )}

          {/* Nav items */}
          <nav className="flex-1 px-4 py-2 space-y-1.5 overflow-y-auto">
            {TABS.map(({ id, label, Icon }) => {
              const active = activeTab === id;
              const badge = id === 'bookings' && pendingCount > 0;
              const locked = !kycApproved && KYC_GATED.includes(id);
              return (
                <motion.button key={id} whileTap={!locked ? { scale: 0.98 } : {}}
                  onClick={() => !locked && setActiveTab(id)}
                  title={locked ? 'Complete KYC to unlock' : ''}
                  className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-[16px] text-[13px] font-semibold transition-all relative
                    ${locked ? 'opacity-40 cursor-not-allowed text-white/40'
                      : active ? 'bg-gradient-to-r from-[#7462ff] to-[#984dff] text-white shadow-lg shadow-violet-500/20'
                        : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
                  <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                  <span className={active ? 'font-bold tracking-wide' : 'tracking-wide'}>{label}</span>
                  {locked && <span className="ml-auto text-xs opacity-50">🔒</span>}
                  {!locked && badge && (
                    <span className="ml-auto w-5 h-5 bg-red-500 rounded-full text-[9px] text-white font-black flex items-center justify-center border-2 border-[#100a1f]">
                      {pendingCount > 9 ? '9+' : pendingCount}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </nav>

          {/* Advertise CTA */}
          <div className="px-4 py-4">
            <a href="/partner/advertise"
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold bg-zappy-gradient text-white shadow-sm shadow-zappy-200 hover:opacity-90 transition-opacity">
              <Sparkles size={15} />Advertise on Zappyone
            </a>
          </div>

          {/* Logout */}
          <div className="px-3 py-3 border-t border-slate-100">
            <button onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:text-red-500 hover:bg-red-50 transition-all">
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </aside>

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {/* Desktop top bar (Clean style) */}
          <div className="px-8 py-6 flex items-center justify-between pointer-events-auto">
            <div>
              <p className="text-[14px] text-slate-500 font-bold mb-1">Welcome to Zappyone</p>
              <h1 className="text-[26px] font-black text-[#0f172a] leading-none tracking-tight capitalize">{partner?.businessName || activeTab}</h1>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => setNotifOpen(true)} className="relative w-11 h-11 bg-white hover:bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-200 shadow-sm transition-colors">
                <Bell size={20} className="text-slate-600" />
                {unreadNotifs > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full text-[10px] text-white font-black flex items-center justify-center border-2 border-white shadow-sm">
                    {unreadNotifs > 9 ? '9+' : unreadNotifs}
                  </span>
                )}
              </button>
              <div className="w-11 h-11 bg-white rounded-2xl border border-slate-200 flex items-center justify-center shadow-sm text-violet-600">
                <PartyPopper size={20} />
              </div>
            </div>
          </div>

          <div className="px-8 pb-8">
            {content}
          </div>
        </main>
      </div>

      {/* MOBILE layout (< lg): top bar + content + bottom tabs */}
      <div className="lg:hidden">
        {/* Mobile top bar */}
        <div className={`px-4 py-3 flex items-center justify-between relative z-50 transition-colors ${activeTab === 'overview' ? 'bg-transparent' : 'bg-white/90 backdrop-blur-md border-b border-slate-100'}`}>
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileMenuOpen(true)} className={`w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${activeTab === 'overview' ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}>
              <Menu size={22} className={activeTab === 'overview' ? 'text-white' : 'text-slate-700'} />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center shadow-sm shadow-violet-200">
                <PartyPopper size={15} className="text-white" />
              </div>
              <div>
                <span className={`font-black text-sm block leading-tight capitalize ${activeTab === 'overview' ? 'text-white' : 'text-slate-900'}`}>
                  {activeTab === 'overview' ? 'Zappyone Partner' : activeTab}
                </span>
                <span className={`text-[9px] font-bold tracking-widest uppercase block leading-none mt-0.5 ${activeTab === 'overview' ? 'text-white/70' : 'text-slate-500'}`}>
                  Event Portal
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setNotifOpen(true)} className={`relative w-9 h-9 flex items-center justify-center rounded-xl transition-colors ${activeTab === 'overview' ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}>
              <Bell size={19} className={activeTab === 'overview' ? 'text-white' : 'text-slate-600'} />
              {unreadNotifs > 0 && (
                <span className={`absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white font-black flex items-center justify-center border-2 ${activeTab === 'overview' ? 'border-[#0f1123]' : 'border-white'}`}>
                  {unreadNotifs > 9 ? '9+' : unreadNotifs}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile content */}
        <div className={`pb-24 ${activeTab === 'overview' ? 'px-0 pt-0' : 'px-4 pt-5 max-w-lg mx-auto'}`}>
          {activeTab === 'overview' ? <MobileOverviewTab onNavigate={setActiveTab} /> : content}
        </div>

        {/* Mobile bottom nav */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 flex pb-safe rounded-t-3xl shadow-[0_-4px_20px_rgba(0,0,0,0.02)] z-40">
          {[
            { id: 'overview', label: 'Overview', Icon: LayoutGrid },
            { id: 'themes', label: 'Themes', Icon: Palette },
            { id: 'bookings', label: 'Bookings', Icon: Package },
            { id: 'calendar', label: 'Calendar', Icon: Calendar },
            { id: 'earnings', label: 'Earnings', Icon: Wallet },
            { id: 'profile', label: 'Profile', Icon: User },
          ].map(({ id, label, Icon }) => {
            const active = activeTab === id;
            const badge = id === 'bookings' && pendingCount > 0;
            const locked = !kycApproved && KYC_GATED.includes(id);
            return (
              <motion.button key={id} onClick={() => !locked && setActiveTab(id)} whileTap={!locked ? { scale: 0.9 } : {}}
                className={`flex-1 flex flex-col items-center gap-1.5 py-4 relative transition-all duration-300
                  ${locked ? 'opacity-35 text-slate-400' : active ? 'text-violet-600' : 'text-slate-400 hover:text-slate-600'}`}>
                <div className="relative">
                  <Icon size={22} strokeWidth={active ? 2.5 : 2} className={active ? 'text-violet-600' : 'text-slate-400'} />
                  {locked && <span className="absolute -top-1 -right-1 text-[8px]">🔒</span>}
                  {!locked && badge && (
                    <span className="absolute -top-1 -right-1.5 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white font-black flex items-center justify-center border-2 border-white shadow-sm">
                      {pendingCount > 9 ? '9+' : pendingCount}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] tracking-wide ${active ? 'font-bold text-violet-600' : 'font-semibold text-slate-500'}`}>{label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Mobile Menu Sidebar */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm lg:hidden flex"
            onClick={e => e.target === e.currentTarget && setMobileMenuOpen(false)}>
            <motion.div initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="bg-white w-64 h-full shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}>

              <div className="px-5 py-5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center shadow-sm shadow-violet-200">
                    <PartyPopper size={16} className="text-white" />
                  </div>
                  <span className="font-black text-slate-900 text-sm">Zappyone Partner</span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
                  <X size={15} className="text-slate-600" />
                </button>
              </div>

              {partner && (
                <div className="px-5 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-3 bg-violet-50 rounded-2xl px-3 py-3 border border-violet-100">
                    <div className="w-9 h-9 rounded-xl bg-violet-500 flex items-center justify-center text-white font-black text-sm shrink-0">
                      {partner.businessName?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 text-xs truncate">{partner.businessName}</p>
                      <p className="text-[10px] text-slate-500 truncate">{partner.email || partner.phone}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex-1"></div>

              <div className="px-3 pb-3 border-t border-slate-100 pt-3">
                <a href="/partner/advertise" className="w-full flex items-center gap-2 px-3 py-3 rounded-xl text-sm font-bold bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors mb-2">
                  <Sparkles size={15} />Advertise on Zappyone
                </a>
                <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold text-slate-500 hover:text-red-500 hover:bg-red-50 transition-all">
                  <LogOut size={16} />Logout
                </button>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notification Panel */}
      <AnimatePresence>
        {notifOpen && <NotificationPanel onClose={() => setNotifOpen(false)} />}
      </AnimatePresence>

    </div>
  );
}
