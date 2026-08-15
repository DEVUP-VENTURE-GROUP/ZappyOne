import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Play, CheckCircle, Lock, Award, ChevronRight, Loader2, X, AlertCircle, PlayCircle, Clock, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { useGetTrainingModulesQuery, useGetTrainingModuleQuery, useSubmitTrainingQuizMutation } from '../services/api';

const DIFF_COLOR = { beginner: 'emerald', intermediate: 'amber', advanced: 'rose' };
const DIFF_LABEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

function ModuleCard({ mod, onOpen, index }) {
  const dc = DIFF_COLOR[mod.difficulty] ?? 'indigo';
  const isCertified = mod.certified;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`bg-white rounded-[1.5rem] p-4 relative overflow-hidden transition-all duration-300 ${isCertified ? 'border-2 border-emerald-400 ring-4 ring-emerald-50 shadow-md' : 'border border-slate-200 hover:border-indigo-300 hover:shadow-lg shadow-sm'}`}
    >
      {isCertified && (
        <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[9px] font-black px-3 py-1 rounded-bl-xl tracking-widest uppercase flex items-center gap-1 z-10 shadow-sm">
          <Award size={10} /> Certified
        </div>
      )}

      {/* Thumbnail */}
      <div className="relative w-full h-40 bg-slate-100 rounded-[1.25rem] overflow-hidden mb-4 group cursor-pointer" onClick={() => onOpen(mod._id)}>
        {mod.thumbnail ? (
          <img src={mod.thumbnail} alt={mod.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
            <BookOpen size={40} className="text-indigo-200" />
          </div>
        )}
        
        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[2px]">
          <div className="w-12 h-12 rounded-full bg-white/90 shadow-lg flex items-center justify-center text-indigo-600 pl-1">
            <Play size={20} className="fill-indigo-600" />
          </div>
        </div>

        {/* Badges */}
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest shadow-sm bg-${dc}-500 text-white`}>
            {DIFF_LABEL[mod.difficulty]}
          </span>
          <span className="text-[10px] bg-black/50 backdrop-blur-md text-white font-bold px-2 py-1 rounded-full shadow-sm flex items-center gap-1">
            <Clock size={10} /> {mod.durationMin}m
          </span>
        </div>
      </div>

      <div className="px-1">
        <h3 className="font-black text-slate-800 text-[16px] leading-tight mb-1.5">{mod.title}</h3>
        <p className="text-[13px] text-slate-500 line-clamp-2 leading-relaxed mb-4">{mod.description}</p>
        
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div className="flex flex-wrap gap-1.5">
            {mod.xpReward > 0 && <span className="text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 font-black px-2 py-1 rounded flex items-center gap-1"><Award size={10} className="text-indigo-500" /> +{mod.xpReward} XP</span>}
            {mod.bonusRupees > 0 && <span className="text-[10px] bg-emerald-50 border border-emerald-100 text-emerald-700 font-black px-2 py-1 rounded">+₹{mod.bonusRupees}</span>}
          </div>
          
          <button onClick={() => onOpen(mod._id)}
            className={`flex items-center gap-1.5 text-xs font-black px-4 py-2 rounded-xl transition-all shadow-sm active:scale-95 ${isCertified ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
            {isCertified ? <CheckCircle size={14} /> : <PlayCircle size={14} />}
            {isCertified ? 'Review' : 'Start'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function QuizModal({ moduleId, onClose }) {
  const { data: mod, isLoading } = useGetTrainingModuleQuery(moduleId);
  const [submit, { isLoading: submitting }] = useSubmitTrainingQuizMutation();
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [videoWatched, setVideoWatched] = useState(false);

  function selectAnswer(qi, ai) { setAnswers(p => ({ ...p, [qi]: ai })); }

  async function handleSubmit() {
    const quizAnswers = mod.quiz.map((_, i) => answers[i] ?? -1);
    if (quizAnswers.includes(-1)) return toast.error('Please answer all questions before submitting');
    try {
      const res = await submit({ id: moduleId, answers: quizAnswers }).unwrap();
      setResult(res);
    } catch (err) {
      const errData = err?.data;
      if (errData?.passed === false) {
        setResult({ passed: false, score: errData.score, passingScore: mod.passingScore });
      } else {
        toast.error(errData?.error || errData?.message || 'Submission failed. Try again.');
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center sm:items-center sm:p-4 bg-black/60 backdrop-blur-md transition-opacity">
      <motion.div initial={{ opacity: 0, y: '100%' }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: '100%' }} transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-white rounded-t-[2rem] sm:rounded-[2rem] w-full max-w-2xl max-h-[95vh] sm:h-auto flex flex-col overflow-hidden shadow-2xl absolute bottom-0 sm:relative" 
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 px-6 border-b border-slate-100 bg-white/80 backdrop-blur-xl z-10 sticky top-0">
          <h2 className="font-black text-slate-800 text-[15px] truncate pr-4">{mod?.title ?? 'Training Module'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors shrink-0"><X size={16} strokeWidth={2.5} /></button>
        </div>

        <div className="overflow-y-auto flex-1 custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <Loader2 size={32} className="animate-spin text-indigo-500 mb-4" />
              <p className="text-slate-400 font-bold">Loading content...</p>
            </div>
          ) : result ? (
            <div className="p-8 text-center space-y-6">
              {result.passed ? (
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                  <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6 shadow-inner relative">
                    <div className="absolute inset-0 rounded-full animate-ping bg-emerald-400 opacity-20" />
                    <Award size={48} className="text-emerald-500" />
                  </div>
                  <h3 className="text-3xl font-black text-slate-800 mb-2">Congratulations!</h3>
                  <p className="text-slate-500 text-sm mb-6">You passed with a score of <span className="font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">{result.score}%</span></p>
                  
                  <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-3 mb-8">
                    {result.bonusAdded > 0 && <p className="text-[13px] font-bold text-emerald-600 flex items-center justify-center gap-1.5"><CheckCircle size={14} /> +₹{result.bonusAdded / 100} bonus credited to wallet</p>}
                    {result.unlockedService && <p className="text-[13px] font-bold text-indigo-600 flex items-center justify-center gap-1.5"><Lock size={14} className="opacity-50" /> Unlocked: {result.unlockedService}</p>}
                    {result.xpAdded > 0 && <p className="text-[13px] font-bold text-amber-600 flex items-center justify-center gap-1.5"><Award size={14} /> +{result.xpAdded} XP Earned</p>}
                  </div>
                  
                  <button onClick={onClose} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[1.25rem] font-black shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-all">Continue to Dashboard</button>
                </motion.div>
              ) : (
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                  <div className="w-24 h-24 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-6 shadow-inner">
                    <AlertCircle size={48} className="text-rose-500" />
                  </div>
                  <h3 className="text-3xl font-black text-slate-800 mb-2">Not Quite There</h3>
                  <p className="text-slate-500 text-sm mb-2">You scored <span className="font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">{result.score}%</span>.</p>
                  <p className="text-slate-500 text-sm mb-8">You need <span className="font-bold">{result.passingScore ?? mod?.passingScore}%</span> to pass and earn your certification.</p>
                  
                  <button onClick={() => { setResult(null); setAnswers({}); setVideoWatched(false); }} className="w-full py-4 bg-slate-800 hover:bg-slate-900 text-white rounded-[1.25rem] font-black shadow-lg shadow-slate-900/20 active:scale-[0.98] transition-all">Review & Try Again</button>
                </motion.div>
              )}
            </div>
          ) : (
            <div className="p-5 sm:p-6 space-y-8">
              {/* Video Section */}
              {mod?.videoUrl && !videoWatched && (
                <div className="space-y-3">
                  <p className="text-[11px] font-black text-indigo-600 uppercase tracking-widest px-1">Step 1: Watch Training</p>
                  <div className="relative bg-slate-900 rounded-[1.5rem] overflow-hidden shadow-xl ring-1 ring-slate-900/10" style={{ paddingTop: '56.25%' }}>
                    <iframe className="absolute inset-0 w-full h-full" src={mod.videoUrl} allow="accelerometer; autoplay; encrypted-media; gyroscope" allowFullScreen title={mod.title} />
                  </div>
                  <div className="pt-4">
                    <button onClick={() => setVideoWatched(true)} className="w-full py-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[15px] font-black rounded-[1.25rem] border border-indigo-200 transition-colors active:scale-[0.98]">
                      I've finished watching — Take Quiz
                    </button>
                  </div>
                </div>
              )}

              {/* Quiz Section */}
              {(videoWatched || !mod?.videoUrl) && mod?.quiz?.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <p className="text-[11px] font-black text-indigo-600 uppercase tracking-widest px-1">Step 2: Certification Quiz</p>
                    <span className="text-[11px] font-bold text-slate-400">{Object.keys(answers).length} / {mod.quiz.length} Answered</span>
                  </div>
                  
                  {mod.quiz.map((q, qi) => (
                    <div key={qi} className="space-y-4 bg-slate-50/50 p-5 rounded-[1.5rem] border border-slate-100">
                      <p className="text-[15px] font-black text-slate-800 leading-snug"><span className="text-indigo-400 mr-1">{qi + 1}.</span> {q.question}</p>
                      <div className="space-y-2.5">
                        {q.options.map((opt, ai) => {
                          const isSelected = answers[qi] === ai;
                          return (
                            <button key={ai} onClick={() => selectAnswer(qi, ai)}
                              className={`w-full text-left px-4 py-3.5 rounded-xl border-2 transition-all duration-200 flex gap-3 ${isSelected ? 'border-indigo-500 bg-indigo-50 text-indigo-900 shadow-[0_2px_10px_rgba(99,102,241,0.1)]' : 'border-slate-200 text-slate-600 bg-white hover:border-indigo-300 hover:bg-slate-50'}`}>
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border transition-colors ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-100 border-slate-200 text-slate-400'}`}>
                                {String.fromCharCode(65 + ai)}
                              </span>
                              <span className={`text-[14px] leading-snug pt-0.5 ${isSelected ? 'font-bold' : 'font-medium'}`}>{opt}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  
                  <div className="pt-4 pb-8">
                    <button onClick={handleSubmit} disabled={submitting || Object.keys(answers).length < mod.quiz.length}
                      className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[1.25rem] font-black text-[15px] shadow-lg shadow-indigo-600/20 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                      {submitting ? <Loader2 size={18} className="animate-spin" /> : <Award size={18} />} 
                      {submitting ? 'Evaluating...' : 'Submit Answers & Finish'}
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function WorkerTrainingPage() {
  const nav = useNavigate();
  const { data, isLoading } = useGetTrainingModulesQuery();
  const [openModule, setOpenModule] = useState(null);
  const [filter, setFilter] = useState('all');

  const modules = data?.modules ?? [];
  const filters = ['all', 'beginner', 'intermediate', 'advanced'];
  const visible = filter === 'all' ? modules : modules.filter(m => m.difficulty === filter);

  const certified = modules.filter(m => m.certified).length;

  return (
    <div className="min-h-screen bg-slate-50 md:flex md:justify-center md:bg-gradient-to-br md:from-slate-100 md:to-indigo-50/40">
      <div className="w-full max-w-lg lg:max-w-2xl bg-slate-50 min-h-screen relative shadow-[0_0_40px_rgba(0,0,0,0.05)] lg:shadow-[0_0_60px_rgba(0,0,0,0.08)] md:border-x border-slate-200/60 pb-8">
        
        {/* Cinematic Header */}
        <header className="relative pt-6 pb-28 overflow-hidden rounded-b-[2.5rem] shadow-sm z-10" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #1e3a5f 100%)' }}>
          <motion.div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }} transition={{ duration: 5, repeat: Infinity }} />
          <motion.div className="absolute bottom-0 left-0 w-48 h-48 bg-rose-500/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 6, repeat: Infinity, delay: 1 }} />
          
          <div className="relative z-10 px-5">
            <div className="flex items-center justify-between mb-8">
              <motion.button onClick={() => nav(-1)} whileTap={{ scale: 0.9 }} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center text-white shadow-sm">
                <ArrowLeft size={20} strokeWidth={2.5} />
              </motion.button>
              <h1 className="text-white font-black tracking-wide text-lg">Training Center</h1>
              <div className="w-10 h-10" />
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-3 border border-white/20 shadow-inner">
                <Award size={32} className="text-indigo-300 fill-indigo-400/20" strokeWidth={1.5} />
              </div>
              <p className="text-white font-bold text-lg tracking-tight mb-1">Level Up Your Skills</p>
              
              {certified > 0 ? (
                <div className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 px-3 py-1.5 rounded-full border border-emerald-500/30 text-xs font-bold backdrop-blur-sm mt-1">
                  <CheckCircle size={12} strokeWidth={3} /> {certified} Certificates Earned
                </div>
              ) : (
                <p className="text-white/60 text-xs font-medium px-4">Watch videos and pass quizzes to unlock premium jobs and earn bonuses.</p>
              )}
            </div>
          </div>
        </header>

        <div className="relative z-20 px-4 -mt-10 space-y-6">
          
          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar snap-x">
            {filters.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`shrink-0 snap-start text-[13px] font-bold px-4 py-2.5 rounded-xl border-2 transition-all duration-200 capitalize shadow-sm ${filter === f ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-600/20' : 'border-white bg-white/80 backdrop-blur-md text-slate-600 hover:border-indigo-200 hover:text-indigo-600'}`}>
                {f}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 bg-white rounded-[1.5rem] shadow-sm">
              <Loader2 size={28} className="animate-spin text-indigo-400 mb-3" />
              <p className="text-sm font-semibold text-slate-400">Loading modules...</p>
            </div>
          ) : visible.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-[1.5rem] border border-dashed border-slate-200 p-12 text-center shadow-sm">
              <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4">
                <BookOpen size={24} className="text-slate-300" />
              </div>
              <p className="font-bold text-slate-500">No Modules Found</p>
              <p className="text-sm text-slate-400 mt-1">Check back later for new training content.</p>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {visible.map((m, i) => <ModuleCard key={m._id} mod={m} index={i} onOpen={setOpenModule} />)}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {openModule && <QuizModal moduleId={openModule} onClose={() => setOpenModule(null)} />}
      </AnimatePresence>
    </div>
  );
}
