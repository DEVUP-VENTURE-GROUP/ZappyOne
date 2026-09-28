import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import {
  Copy, Check, Share2, MessageCircle, Link2, Gift,
  Users, Clock, IndianRupee, ChevronRight, ArrowLeft,
  UserCheck, Sparkles, CircleDot, Trophy, Flame, Wallet
} from 'lucide-react';
import toast from 'react-hot-toast';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { useGetReferralCodeQuery, useGetReferralHistoryQuery } from '@shared/services/api';

// helpers

function rupees(paise) {
  return Math.floor((paise || 0) / 100);
}

function maskName(name = '') {
  if (!name || name.length <= 2) return name || '---';
  return name[0] + '*'.repeat(Math.max(name.length - 2, 3)) + name[name.length - 1];
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}

// Confetti Particle Emitter
function Confetti({ active }) {
  if (!active) return null;
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden flex items-center justify-center">
      {Array.from({ length: 40 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-3 h-3 rounded-sm"
          style={{
            backgroundColor: ['#6366f1', '#a855f7', '#ec4899', '#eab308'][Math.floor(Math.random() * 4)],
          }}
          initial={{ x: 0, y: 0, scale: 0 }}
          animate={{
            x: (Math.random() - 0.5) * window.innerWidth,
            y: (Math.random() - 0.5) * window.innerHeight,
            scale: Math.random() * 1.5 + 0.5,
            rotate: Math.random() * 360 * 3,
            opacity: [1, 1, 0]
          }}
          transition={{ duration: 1.5 + Math.random(), ease: "easeOut" }}
        />
      ))}
    </div>
  )
}

// 3D Tilt Card
function TiltCard({ code, isLoading, copied, handleCopyCode }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-100, 100], [15, -15]);
  const rotateY = useTransform(x, [-100, 100], [-15, 15]);

  function handleMouseMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    x.set(event.clientX - rect.left - rect.width / 2);
    y.set(event.clientY - rect.top - rect.height / 2);
  }

  function handleMouseLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      style={{ rotateX, rotateY, perspective: 1000 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative w-full max-w-sm mx-auto aspect-[1.6/1] rounded-[2rem] p-[1px] cursor-pointer group"
      onClick={handleCopyCode}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Animated gradient border */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-amber-500 rounded-[2rem] opacity-70 group-hover:opacity-100 transition-opacity" />
      
      {/* Inner card */}
      <div className="absolute inset-[2px] bg-slate-950 rounded-[calc(2rem-2px)] overflow-hidden shadow-2xl">
         {/* Glossy overlay */}
         <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50" />
         
         <div className="relative h-full flex flex-col items-center justify-center p-6 text-center z-10">
            <Sparkles className="text-amber-400 mb-2" size={24} />
            <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-[0.3em] mb-4">Your VIP Code</p>
            
            {isLoading ? (
               <div className="h-10 w-32 bg-slate-800/50 rounded-lg animate-pulse" />
            ) : (
               <div className="relative">
                 <AnimatePresence mode="wait">
                    {copied ? (
                      <motion.div key="copied" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }} className="flex items-center gap-2 text-emerald-400">
                        <Check size={32} />
                        <span className="text-2xl sm:text-3xl font-black tracking-widest">COPIED</span>
                      </motion.div>
                    ) : (
                      <motion.div key="code" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}>
                         <span className="text-3xl sm:text-5xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-br from-white to-indigo-200 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                           {code}
                         </span>
                      </motion.div>
                    )}
                 </AnimatePresence>
               </div>
            )}
            
            <p className="absolute bottom-4 text-[9px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1">
               <Copy size={12} /> Tap card to copy
            </p>
         </div>
         
         {/* Decorative background blur inside card */}
         <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-fuchsia-500/30 rounded-full blur-3xl pointer-events-none" />
         <div className="absolute -top-20 -left-20 w-40 h-40 bg-indigo-500/30 rounded-full blur-3xl pointer-events-none" />
      </div>
    </motion.div>
  )
}

// Main Page
export default function ReferralPage() {
  const navigate = useNavigate();
  const auth = useSelector(selectAuth);

  const { data: referralData, isLoading } = useGetReferralCodeQuery(undefined, {
    skip: !auth.accessToken,
  });
  const { data: historyData } = useGetReferralHistoryQuery(undefined, {
    skip: !auth.accessToken,
  });

  const code = referralData?.code ?? 'LOADING';
  const stats = referralData?.stats ?? { totalReferrals: 0, pendingReferrals: 0, earnedPaise: 0 };
  const history = historyData?.referrals ?? [];

  const [copied, setCopied] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const copyTimerRef = useRef(null);
  const linkTimerRef = useRef(null);

  const referralLink = `${window.location.origin}/signup?ref=${code}`;

  function handleCopyCode() {
    if (!code || code === 'LOADING') return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setShowConfetti(true);
      toast.success('VIP Code copied! Let the magic begin ✨', { style: { background: '#1e1b4b', color: '#fff', borderRadius: '1rem' } });
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopied(false);
        setShowConfetti(false);
      }, 2500);
    });
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(referralLink).then(() => {
      setLinkCopied(true);
      toast.success('Link copied!');
      clearTimeout(linkTimerRef.current);
      linkTimerRef.current = setTimeout(() => setLinkCopied(false), 2200);
    });
  }

  function handleWebShare() {
    if (navigator.share) {
      navigator.share({
        title: 'Join Zappy & Get ₹50',
        text: `Use my VIP code ${code} on Zappy and get ₹50 off your first home service booking!`,
        url: referralLink,
      }).catch(() => {});
    } else {
      handleCopyLink();
    }
  }

  function handleWhatsApp() {
    const msg = encodeURIComponent(
      `Hey! Use my Zappy VIP code *${code}* and get ₹50 off your first booking!\n${referralLink}`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  }

  const earned = rupees(stats.earnedPaise);

  return (
    <div className="min-h-screen bg-[#030712] text-white pb-32 font-sans overflow-x-hidden selection:bg-indigo-500/30">
      <Confetti active={showConfetti} />
      
      {/* Immersive Hero Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] md:w-[800px] h-[600px] bg-indigo-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] md:w-[600px] h-[600px] bg-fuchsia-900/10 rounded-full blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="px-4 pt-12 pb-6 flex items-center justify-between">
          <motion.button 
            onClick={() => navigate(-1)} 
            className="w-10 h-10 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-slate-300 hover:bg-white/10 backdrop-blur-md transition-colors"
            whileTap={{ scale: 0.9 }}
          >
            <ArrowLeft size={20} />
          </motion.button>
          <div className="px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full flex items-center gap-1.5 backdrop-blur-md shadow-[0_0_15px_rgba(99,102,241,0.2)]">
            <Flame size={14} className="text-amber-500 fill-amber-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Rewards Program</span>
          </div>
          <div className="w-10" />
        </div>

        <div className="max-w-md mx-auto px-4">
          
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight leading-[1.1]">
              Give ₹50.<br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-amber-400">Get ₹100.</span>
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed max-w-[280px] mx-auto font-medium">
              Invite friends to Zappy. They get a discount, and you earn real wallet cash when they book.
            </p>
          </motion.div>

          {/* 3D VIP Card */}
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 20 }}>
            <TiltCard code={code} isLoading={isLoading} copied={copied} handleCopyCode={handleCopyCode} />
          </motion.div>

          {/* Bento Stats Grid */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="grid grid-cols-3 gap-3 mt-8">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md flex flex-col items-center justify-center text-center relative overflow-hidden group hover:bg-white/10 transition-colors">
              <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/20 rounded-full blur-xl transition-all group-hover:scale-150" />
              <Users size={20} className="text-indigo-400 mb-2 relative z-10" />
              <span className="font-black text-2xl text-white relative z-10">{stats.totalReferrals}</span>
              <span className="text-[9px] uppercase tracking-widest font-bold text-slate-500 relative z-10 mt-1">Invited</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md flex flex-col items-center justify-center text-center relative overflow-hidden group hover:bg-white/10 transition-colors">
              <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/20 rounded-full blur-xl transition-all group-hover:scale-150" />
              <Wallet size={20} className="text-emerald-400 mb-2 relative z-10" />
              <span className="font-black text-2xl text-emerald-400 relative z-10">₹{earned}</span>
              <span className="text-[9px] uppercase tracking-widest font-bold text-slate-500 relative z-10 mt-1">Earned</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md flex flex-col items-center justify-center text-center relative overflow-hidden group hover:bg-white/10 transition-colors">
              <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/20 rounded-full blur-xl transition-all group-hover:scale-150" />
              <Clock size={20} className="text-amber-400 mb-2 relative z-10" />
              <span className="font-black text-2xl text-white relative z-10">{stats.pendingReferrals}</span>
              <span className="text-[9px] uppercase tracking-widest font-bold text-slate-500 relative z-10 mt-1">Pending</span>
            </div>
          </motion.div>

          {stats.pendingReferrals > 0 && (
             <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 backdrop-blur-md flex gap-3 items-start shadow-[0_0_20px_rgba(245,158,11,0.1)]">
                <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                   <Clock size={16} className="text-amber-400" />
                </div>
                <div>
                   <p className="text-sm font-bold text-amber-100">Unlock ₹{stats.pendingReferrals * 100} Cash</p>
                   <p className="text-xs text-amber-200/60 mt-0.5">{stats.pendingReferrals} friend(s) signed up. Cash unlocks when they book!</p>
                </div>
             </motion.div>
          )}

          {/* Share Actions */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-8">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 pl-1">Share the wealth</p>
            <div className="grid grid-cols-2 gap-3">
               <motion.button onClick={handleWhatsApp} whileTap={{ scale: 0.95 }} className="bg-[#1f4a31]/80 hover:bg-[#1f4a31] border border-green-500/30 text-green-400 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 backdrop-blur-md transition-colors shadow-lg">
                  <MessageCircle size={24} />
                  <span className="text-[11px] font-black uppercase tracking-wider">WhatsApp</span>
               </motion.button>
               <motion.button onClick={handleWebShare} whileTap={{ scale: 0.95 }} className="bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-300 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 backdrop-blur-md transition-colors shadow-lg">
                  <Share2 size={24} />
                  <span className="text-[11px] font-black uppercase tracking-wider">Share App</span>
               </motion.button>
            </div>
            <motion.button onClick={handleCopyLink} whileTap={{ scale: 0.98 }} className="w-full mt-3 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-2xl p-4 flex items-center justify-center gap-2 backdrop-blur-md transition-colors">
               <AnimatePresence mode="wait">
                 {linkCopied ? <Check size={18} className="text-emerald-400" key="check" /> : <Link2 size={18} key="link" />}
               </AnimatePresence>
               <span className="text-sm font-bold">{linkCopied ? 'Link Copied!' : 'Copy Referral Link'}</span>
            </motion.button>
          </motion.div>

          {/* Recent Activity */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mt-10 mb-8">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 pl-1">Activity Log</p>
            
            {history.length === 0 ? (
               <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8 backdrop-blur-md text-center border-dashed">
                 <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                   <Trophy size={24} className="text-slate-500" />
                 </div>
                 <p className="text-base font-black text-slate-300 mb-1">Your network is empty</p>
                 <p className="text-xs text-slate-500 font-medium">Invite friends and watch the cash flow in.</p>
               </div>
            ) : (
               <div className="space-y-3">
                 {history.map((item, i) => (
                   <div key={item._id ?? i} className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md flex items-center gap-4 hover:bg-white/10 transition-colors">
                     <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 p-[1px] shadow-sm">
                       <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
                         <span className="text-sm font-black text-white">{maskName(item.name)[0].toUpperCase()}</span>
                       </div>
                     </div>
                     <div className="flex-1">
                       <p className="text-sm font-bold text-slate-200">{maskName(item.name)}</p>
                       <p className="text-[9px] uppercase font-bold tracking-widest text-slate-500 mt-0.5">Joined {item.joinedAt ? timeAgo(item.joinedAt) : 'recently'}</p>
                     </div>
                     <div>
                       {item.earnedPaise > 0 ? (
                         <div className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 font-black text-xs shadow-[0_0_10px_rgba(52,211,153,0.1)]">
                           +₹{rupees(item.earnedPaise)}
                         </div>
                       ) : (
                         <div className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400 font-bold text-[10px] uppercase tracking-wider">
                           Pending
                         </div>
                       )}
                     </div>
                   </div>
                 ))}
               </div>
            )}
          </motion.div>

        </div>
      </div>
    </div>
  );
}
