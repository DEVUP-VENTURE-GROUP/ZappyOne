import { useState } from 'react';
import { Plus, Edit2, Eye, EyeOff, Loader2, GraduationCap, X, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAdminGetTrainingModulesQuery, useAdminCreateTrainingModuleMutation, useAdminUpdateTrainingModuleMutation } from '@shared/services/api';

const DIFF_OPTS = ['beginner', 'intermediate', 'advanced'];
const DIFF_COLOR = { beginner: 'bg-emerald-100 text-emerald-700', intermediate: 'bg-amber-100 text-amber-700', advanced: 'bg-red-100 text-red-700' };

const BLANK = { title: '', description: '', category: '', difficulty: 'beginner', durationMin: 30, videoUrl: '', passingScore: 80, xpReward: 50, bonusRupees: 0, unlockService: '', isActive: true, quiz: [] };

function ModuleForm({ initial = BLANK, onSave, onCancel, isSaving }) {
  const [form, setForm] = useState(initial);
  const [quizQ, setQuizQ] = useState('');
  const [quizOpts, setQuizOpts] = useState(['', '', '', '']);
  const [quizCorrect, setQuizCorrect] = useState(0);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function addQuestion() {
    if (!quizQ.trim() || quizOpts.some(o => !o.trim())) return toast.error('Fill question and all 4 options');
    set('quiz', [...form.quiz, { question: quizQ.trim(), options: quizOpts.map(o => o.trim()), correct: quizCorrect }]);
    setQuizQ(''); setQuizOpts(['', '', '', '']); setQuizCorrect(0);
  }
  function removeQ(i) { set('quiz', form.quiz.filter((_, idx) => idx !== i)); }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-bold text-slate-500">TITLE *</label>
          <input value={form.title} onChange={e => set('title', e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300" placeholder="e.g. AC Servicing Fundamentals" />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-bold text-slate-500">DESCRIPTION</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none resize-none" placeholder="What will workers learn?" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500">CATEGORY</label>
          <input value={form.category} onChange={e => set('category', e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" placeholder="e.g. hvac" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500">DIFFICULTY</label>
          <select value={form.difficulty} onChange={e => set('difficulty', e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none bg-white capitalize">
            {DIFF_OPTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500">DURATION (min)</label>
          <input type="number" value={form.durationMin} onChange={e => set('durationMin', Number(e.target.value))} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500">PASSING SCORE (%)</label>
          <input type="number" min={50} max={100} value={form.passingScore} onChange={e => set('passingScore', Number(e.target.value))} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500">BONUS (₹)</label>
          <input type="number" min={0} value={form.bonusRupees} onChange={e => set('bonusRupees', Number(e.target.value))} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500">XP REWARD</label>
          <input type="number" min={0} value={form.xpReward} onChange={e => set('xpReward', Number(e.target.value))} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-bold text-slate-500">VIDEO URL</label>
          <input value={form.videoUrl} onChange={e => set('videoUrl', e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" placeholder="YouTube embed or direct video URL" />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-bold text-slate-500">UNLOCK SERVICE (optional)</label>
          <input value={form.unlockService} onChange={e => set('unlockService', e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" placeholder="Service slug unlocked on certification, e.g. pest_control" />
        </div>
      </div>

      {/* Quiz builder */}
      <div>
        <p className="text-xs font-bold text-slate-500 mb-2">QUIZ ({form.quiz.length} questions)</p>
        {form.quiz.map((q, i) => (
          <div key={i} className="flex items-start gap-2 mb-1.5 bg-slate-50 rounded-lg p-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-700">{i + 1}. {q.question}</p>
              {q.options.map((o, oi) => (
                <p key={oi} className={`text-[10px] ${oi === q.correct ? 'text-emerald-600 font-bold' : 'text-slate-500'}`}>
                  {String.fromCharCode(65 + oi)}. {o} {oi === q.correct ? '✓' : ''}
                </p>
              ))}
            </div>
            <button onClick={() => removeQ(i)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 shrink-0"><X size={12} /></button>
          </div>
        ))}
        <div className="bg-slate-50 rounded-lg p-3 space-y-2 mt-2">
          <input value={quizQ} onChange={e => setQuizQ(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none" placeholder="Question text" />
          {quizOpts.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name="correct" checked={quizCorrect === i} onChange={() => setQuizCorrect(i)} className="shrink-0" />
              <input value={o} onChange={e => { const n = [...quizOpts]; n[i] = e.target.value; setQuizOpts(n); }}
                className="flex-1 border border-slate-200 rounded-lg px-3 py-1 text-sm outline-none" placeholder={`Option ${String.fromCharCode(65 + i)}`} />
            </div>
          ))}
          <p className="text-[10px] text-slate-400">Radio = correct answer</p>
          <button onClick={addQuestion} className="w-full py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-lg hover:bg-indigo-100">
            + Add Question
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} className="rounded" />
          Active (visible to workers)
        </label>
      </div>

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
        <button onClick={() => onSave(form)} disabled={isSaving || !form.title.trim()}
          className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
          {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save Module
        </button>
      </div>
    </div>
  );
}

export default function Training() {
  const { data, isLoading } = useAdminGetTrainingModulesQuery();
  const [create, { isLoading: creating }] = useAdminCreateTrainingModuleMutation();
  const [update, { isLoading: updating }] = useAdminUpdateTrainingModuleMutation();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);

  const modules = data?.modules ?? [];

  async function handleCreate(form) {
    try { await create(form).unwrap(); toast.success('Module created'); setShowNew(false); }
    catch (err) { toast.error(err?.data?.error || 'Failed to create'); }
  }

  async function handleUpdate(id, form) {
    try { await update({ id, ...form }).unwrap(); toast.success('Module updated'); setEditing(null); }
    catch (err) { toast.error(err?.data?.error || 'Failed to update'); }
  }

  async function toggleActive(mod) {
    try { await update({ id: mod._id, isActive: !mod.isActive }).unwrap(); toast.success(mod.isActive ? 'Module hidden' : 'Module published'); }
    catch { toast.error('Failed'); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Training & Certification</h2>
          <p className="text-xs text-slate-500 mt-0.5">Manage video courses and quiz modules for workers</p>
        </div>
        <button onClick={() => setShowNew(v => !v)}
          className="flex items-center gap-1.5 text-xs font-bold bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 transition">
          <Plus size={13} /> New Module
        </button>
      </div>

      {showNew && <ModuleForm onSave={handleCreate} onCancel={() => setShowNew(false)} isSaving={creating} />}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
      ) : modules.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-xl p-12 text-center">
          <GraduationCap size={28} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm text-slate-500">No training modules yet. Create the first one!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {modules.map(m => (
            <div key={m._id}>
              {editing === m._id ? (
                <ModuleForm initial={m} onSave={form => handleUpdate(m._id, form)} onCancel={() => setEditing(null)} isSaving={updating} />
              ) : (
                <div className={`bg-white border rounded-xl p-4 ${!m.isActive ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${DIFF_COLOR[m.difficulty] ?? 'bg-slate-100 text-slate-600'}`}>{m.difficulty}</span>
                        {m.isActive ? <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">Live</span>
                          : <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full">Hidden</span>}
                        {m.bonusRupees > 0 && <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">+₹{m.bonusRupees}</span>}
                      </div>
                      <p className="font-semibold text-slate-800">{m.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{m.description}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{(m.quiz || []).length} questions · Pass: {m.passingScore}% · {m.durationMin}min</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => toggleActive(m)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400" title={m.isActive ? 'Hide' : 'Publish'}>
                        {m.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button onClick={() => setEditing(m._id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                        <Edit2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
