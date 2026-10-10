/**
 * Money and growth screens from the menu, ported from the websites:
 *   GoalsScreen     (WorkerGoalsPage)     daily and weekly earning targets
 *   TrainingScreen  (WorkerTrainingPage)  modules, video, quiz, certificates
 *   BankScreen      (WorkerBankPage)      bank accounts and UPI IDs
 *   WithdrawScreen  (WorkerWithdrawPage)  payout from the wallet
 * Bank and payout changes go through the same OTP check as the websites.
 */
import React, { useState } from 'react';
import { Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import {
  AlertCircle, Award, Banknote, BookOpen, Building2, CheckCircle2, ChevronRight, Clock, Pencil, PlayCircle, Plus,
  ShieldCheck, Smartphone, Star, Target, Trash2, TrendingUp, Trophy, X, Zap,
} from 'lucide-react-native';
import {
  useGetWorkerGoalsQuery, useSetWorkerGoalMutation, useGetZoneBenchmarkQuery,
  useGetTrainingModulesQuery, useGetTrainingModuleQuery, useSubmitTrainingQuizMutation,
  useGetWorkerBankAccountsQuery, useAddWorkerBankAccountMutation, useDeleteWorkerBankAccountMutation, useSetDefaultWorkerBankAccountMutation,
  useGetWalletQuery, useRequestPayoutMutation,
} from '@zappy/core/api';
import { Button, EmptyState, LoadingState, ScreenHeader, Text } from '../../components';
import { toast } from '../../components/Toast';
import { useOtpGate } from '../../components/OtpGate';
import { colors, zappy, ink, slate, success, accent, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { DuesCard } from '../cards';

type ApiErr = { data?: { error?: string; message?: string; passed?: boolean; score?: number }; message?: string };
const errText = (e: unknown, f: string) => (e as ApiErr)?.data?.error || f;
const rs = (paise: number) => `₹${(paise / 100).toFixed(0)}`;

function SheetFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <View style={[styles.between, styles.sheetHead]}>
          <Text variant="heading3" weight="black" style={styles.flex} numberOfLines={1}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close"><X size={20} color={ink[700]} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}

const Label = ({ children }: { children: string }) => <Text variant="caption" weight="black" color={ink[400]}>{children}</Text>;

/* ── Goals ───────────────────────────────────────────────────────────── */

function ProgressRing({ pct, color, size = 84, stroke = 7 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={slate[100]} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${(Math.min(pct, 100) / 100) * circ} ${circ}`} />
      </Svg>
      <Text variant="bodySmall" weight="black">{pct}%</Text>
    </View>
  );
}

type Goal = { period: 'daily' | 'weekly'; earnedPaise?: number; targetPaise?: number };

function GoalCard({ goal, onEdit }: { goal: Goal; onEdit: () => void }) {
  const earned = goal.earnedPaise ?? 0;
  const target = goal.targetPaise ?? 0;
  const pct = target > 0 ? Math.round((earned / target) * 100) : 0;
  const color = pct >= 100 ? success[500] : pct >= 60 ? zappy[500] : accent[500];
  return (
    <View style={[styles.card, pct >= 100 && { borderColor: success[100] }]}>
      <View style={styles.row}>
        <ProgressRing pct={pct} color={color} />
        <View style={styles.flex}>
          <View style={styles.between}>
            <View style={styles.row}>
              <Text variant="body" weight="black">{goal.period === 'daily' ? 'Daily goal' : 'Weekly goal'}</Text>
              {pct >= 100 ? <View style={[styles.tag, { backgroundColor: success[50] }]}><Trophy size={10} color={success[700]} /><Text variant="caption" weight="black" color={success[700]}>Achieved</Text></View> : null}
            </View>
            <Pressable onPress={onEdit} hitSlop={8} accessibilityLabel={`Change ${goal.period} goal`} style={styles.iconBtn}><Pencil size={13} color={ink[500]} /></Pressable>
          </View>
          <View style={[styles.row, { alignItems: 'flex-end', gap: 4 }]}>
            <Text variant="heading2" weight="black">{rs(earned)}</Text>
            <Text variant="caption" weight="bold" color={ink[400]}>/ {rs(target)}</Text>
          </View>
          <Text variant="caption" weight="bold" color={earned > target ? success[700] : ink[500]}>
            {earned > target ? `+${rs(earned - target)} over target` : `${rs(Math.max(0, target - earned))} more to go`}
          </Text>
        </View>
      </View>
      <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} /></View>
    </View>
  );
}

function SetGoalSheet({ period, currentTarget, onClose }: { period: 'daily' | 'weekly'; currentTarget?: number; onClose: () => void }) {
  const [val, setVal] = useState(currentTarget ? String(currentTarget / 100) : '');
  const [setGoal, { isLoading }] = useSetWorkerGoalMutation();
  const presets = period === 'daily' ? [500, 1000, 1500, 2000] : [5000, 10000, 20000, 30000];
  async function submit() {
    const amtPaise = Math.round(parseFloat(val) * 100);
    if (!amtPaise || amtPaise < 100) { toast.error('Set at least ₹1 as goal'); return; }
    try { await setGoal({ period, targetPaise: amtPaise }).unwrap(); toast.success(`${period === 'daily' ? 'Daily' : 'Weekly'} goal set`); onClose(); }
    catch (err) { toast.error(errText(err, 'Failed to set goal')); }
  }
  return (
    <SheetFrame title={`Set ${period} goal`} onClose={onClose}>
      <View style={[styles.amountBox]}>
        <Text variant="heading1" weight="black" color={val ? zappy[600] : ink[300]}>₹</Text>
        <TextInput value={val} onChangeText={(v) => setVal(v.replace(/[^\d]/g, ''))} keyboardType="number-pad" placeholder="0" placeholderTextColor={ink[300]}
          autoFocus style={styles.amountInput} accessibilityLabel="Goal amount in rupees" />
      </View>
      <Label>QUICK PRESETS</Label>
      <View style={styles.row}>
        {presets.map((p) => (
          <Pressable key={p} onPress={() => setVal(String(p))} style={[styles.preset, styles.flex]} android_ripple={{ color: 'rgba(16,24,40,0.08)' }}>
            <Text variant="bodySmall" weight="bold" color={ink[700]}>₹{p >= 1000 ? `${p / 1000}K` : p}</Text>
          </Pressable>
        ))}
      </View>
      <Button label="Save target" onPress={submit} loading={isLoading} fullWidth size="large" />
    </SheetFrame>
  );
}

export function GoalsScreen() {
  const router = useRouter();
  const { data, isLoading } = useGetWorkerGoalsQuery();
  const { data: benchmark } = useGetZoneBenchmarkQuery();
  const [editPeriod, setEditPeriod] = useState<'daily' | 'weekly' | null>(null);
  const goals: Goal[] = data?.goals ?? [];
  const byPeriod = { daily: goals.find((g) => g.period === 'daily'), weekly: goals.find((g) => g.period === 'weekly') };

  return (
    <View style={styles.page}>
      <ScreenHeader title="Earnings goals" safeArea />
      <ScrollView contentContainerStyle={styles.body}>
        {benchmark ? (
          <View style={[styles.card, { backgroundColor: zappy[600], borderColor: zappy[600] }]}>
            <View style={styles.row}><TrendingUp size={14} color="#fff" /><Text variant="caption" weight="black" color={zappy[100]}>ZONE BENCHMARK</Text></View>
            <View style={[styles.row, { alignItems: 'flex-end' }]}>
              <Text variant="heading1" weight="black" color="#fff">Top {Math.round(100 - benchmark.percentile)}%</Text>
              <Text variant="caption" weight="bold" color={zappy[100]}>in your zone</Text>
            </View>
            <Text variant="caption" color={zappy[100]}>Avg earning: {rs(benchmark.zoneAvgPaise)} / week</Text>
            <View style={[styles.bar, { backgroundColor: zappy[800] }]}><View style={[styles.barFill, { width: `${benchmark.percentile}%`, backgroundColor: '#5EEAD4' }]} /></View>
          </View>
        ) : null}
        {isLoading ? <LoadingState /> : (['daily', 'weekly'] as const).map((p) => (
          <View key={p} style={styles.gap}>
            <Label>{p === 'daily' ? 'DAILY GOAL' : 'WEEKLY GOAL'}</Label>
            {byPeriod[p] ? <GoalCard goal={byPeriod[p]!} onEdit={() => setEditPeriod(p)} /> : (
              <Pressable onPress={() => setEditPeriod(p)} style={styles.dashed} accessibilityRole="button" android_ripple={{ color: 'rgba(16,24,40,0.06)' }}>
                <Target size={24} color={ink[300]} />
                <Text variant="body" weight="bold" color={ink[700]}>{p === 'daily' ? 'Set daily target' : 'Set weekly target'}</Text>
                <Text variant="caption" color={ink[500]}>{p === 'daily' ? 'Boost your daily motivation' : 'Plan your weekly income'}</Text>
              </Pressable>
            )}
          </View>
        ))}
        <Pressable onPress={() => router.push('/worker/earnings' as never)} style={[styles.card, styles.row, { backgroundColor: accent[50], borderColor: accent[100] }]}>
          <Zap size={18} color={accent[600]} />
          <View style={styles.flex}><Text variant="bodySmall" weight="bold" color={accent[700]}>Track your hustle</Text><Text variant="caption" color={accent[700]}>View detailed job-by-job breakdown</Text></View>
          <ChevronRight size={18} color={accent[500]} />
        </Pressable>
      </ScrollView>
      {editPeriod ? <SetGoalSheet period={editPeriod} currentTarget={byPeriod[editPeriod]?.targetPaise} onClose={() => setEditPeriod(null)} /> : null}
    </View>
  );
}

/* ── Training ────────────────────────────────────────────────────────── */

const DIFF: Record<string, { label: string; bg: string }> = {
  beginner: { label: 'Beginner', bg: success[500] },
  intermediate: { label: 'Intermediate', bg: accent[500] },
  advanced: { label: 'Advanced', bg: danger[500] },
};
type Module = { _id: string; title: string; description?: string; difficulty: string; durationMin?: number; thumbnail?: string; xpReward?: number; bonusRupees?: number; certified?: boolean };
type QuizResult = { passed: boolean; score?: number; passingScore?: number; bonusAdded?: number; unlockedService?: string; xpAdded?: number };

function QuizSheet({ moduleId, onClose }: { moduleId: string; onClose: () => void }) {
  const { data: mod, isLoading } = useGetTrainingModuleQuery(moduleId);
  const [submit, { isLoading: submitting }] = useSubmitTrainingQuizMutation();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [videoWatched, setVideoWatched] = useState(false);
  const quiz: { question: string; options: string[] }[] = mod?.quiz ?? [];

  async function handleSubmit() {
    const picked = quiz.map((_, i) => answers[i] ?? -1);
    if (picked.includes(-1)) { toast.error('Please answer all questions before submitting'); return; }
    try { setResult(await submit({ id: moduleId, answers: picked }).unwrap()); }
    catch (err) {
      const d = (err as ApiErr)?.data;
      if (d?.passed === false) setResult({ passed: false, score: d.score, passingScore: mod?.passingScore });
      else toast.error(d?.error || d?.message || 'Submission failed. Try again.');
    }
  }

  return (
    <SheetFrame title={mod?.title ?? 'Training module'} onClose={onClose}>
      {isLoading ? <LoadingState /> : result ? (
        <View style={[styles.centerCol, { paddingVertical: spacing.xl }]}>
          {result.passed ? (
            <>
              <View style={[styles.bigIcon, { backgroundColor: success[50] }]}><Award size={44} color={success[500]} /></View>
              <Text variant="heading2" weight="black">Congratulations!</Text>
              <Text variant="bodySmall" color={ink[500]}>You passed with a score of {result.score}%</Text>
              <View style={[styles.card, styles.centerCol, { alignSelf: 'stretch' }]}>
                {result.bonusAdded ? <Text variant="bodySmall" weight="bold" color={success[600]}>+₹{result.bonusAdded / 100} bonus credited to wallet</Text> : null}
                {result.unlockedService ? <Text variant="bodySmall" weight="bold" color={zappy[600]}>Unlocked: {result.unlockedService}</Text> : null}
                {result.xpAdded ? <Text variant="bodySmall" weight="bold" color={accent[600]}>+{result.xpAdded} XP earned</Text> : null}
              </View>
              <Button label="Continue" onPress={onClose} fullWidth size="large" />
            </>
          ) : (
            <>
              <View style={[styles.bigIcon, { backgroundColor: danger[50] }]}><AlertCircle size={44} color={danger[500]} /></View>
              <Text variant="heading2" weight="black">Not quite there</Text>
              <Text variant="bodySmall" color={ink[500]} style={styles.centerText}>You scored {result.score}%. You need {result.passingScore ?? mod?.passingScore}% to pass and earn your certification.</Text>
              <Button label="Review and try again" onPress={() => { setResult(null); setAnswers({}); setVideoWatched(false); }} fullWidth size="large" />
            </>
          )}
        </View>
      ) : (
        <>
          {mod?.videoUrl && !videoWatched ? (
            <View style={styles.gap}>
              <Text variant="caption" weight="black" color={zappy[600]}>STEP 1: WATCH TRAINING</Text>
              <Pressable onPress={() => Linking.openURL(mod.videoUrl)} style={styles.video} accessibilityRole="button" accessibilityLabel="Play the training video">
                <PlayCircle size={48} color="#fff" />
                <Text variant="bodySmall" weight="bold" color="#fff">Play the video</Text>
              </Pressable>
              <Button label="I've finished watching, take the quiz" variant="outline" onPress={() => setVideoWatched(true)} fullWidth size="large" />
            </View>
          ) : null}
          {(videoWatched || !mod?.videoUrl) && quiz.length > 0 ? (
            <View style={styles.gap}>
              <View style={styles.between}>
                <Text variant="caption" weight="black" color={zappy[600]}>STEP 2: CERTIFICATION QUIZ</Text>
                <Text variant="caption" weight="bold" color={ink[400]}>{Object.keys(answers).length} / {quiz.length} answered</Text>
              </View>
              {quiz.map((q, qi) => (
                <View key={qi} style={styles.card}>
                  <Text variant="body" weight="black">{qi + 1}. {q.question}</Text>
                  {q.options.map((opt, ai) => {
                    const on = answers[qi] === ai;
                    return (
                      <Pressable key={ai} onPress={() => setAnswers((p) => ({ ...p, [qi]: ai }))} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.option, on && styles.optionOn]}>
                        <View style={[styles.letter, on && { backgroundColor: zappy[600], borderColor: zappy[600] }]}><Text variant="caption" weight="bold" color={on ? '#fff' : ink[400]}>{String.fromCharCode(65 + ai)}</Text></View>
                        <Text variant="bodySmall" weight={on ? 'bold' : 'medium'} style={styles.flex}>{opt}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
              <Button label={submitting ? 'Evaluating…' : 'Submit answers and finish'} onPress={handleSubmit} loading={submitting} disabled={Object.keys(answers).length < quiz.length} fullWidth size="large" />
            </View>
          ) : null}
        </>
      )}
    </SheetFrame>
  );
}

export function TrainingScreen() {
  const { data, isLoading } = useGetTrainingModulesQuery();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const modules: Module[] = data?.modules ?? [];
  const visible = filter === 'all' ? modules : modules.filter((m) => m.difficulty === filter);
  const certified = modules.filter((m) => m.certified).length;

  return (
    <View style={styles.page}>
      <ScreenHeader title="Training center" safeArea />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.card, styles.row]}>
          <Award size={28} color={zappy[500]} />
          <View style={styles.flex}>
            <Text variant="body" weight="bold">Level up your skills</Text>
            <Text variant="caption" color={certified ? success[700] : ink[500]}>
              {certified ? `${certified} certificate${certified === 1 ? '' : 's'} earned` : 'Watch videos and pass quizzes to unlock premium jobs and earn bonuses.'}
            </Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {['all', 'beginner', 'intermediate', 'advanced'].map((f) => (
            <Pressable key={f} onPress={() => setFilter(f)} accessibilityRole="tab" accessibilityState={{ selected: filter === f }} style={[styles.choice, filter === f && styles.choiceDark]}>
              <Text variant="bodySmall" weight="bold" color={filter === f ? '#fff' : ink[700]}>{f === 'all' ? 'All' : DIFF[f].label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {isLoading ? <LoadingState /> : visible.length === 0 ? (
          <EmptyState title="No modules found" message="Check back later for new training content." icon={<BookOpen size={24} color={ink[400]} />} />
        ) : visible.map((m) => (
          <View key={m._id} style={[styles.card, m.certified && { borderColor: success[500], borderWidth: 2 }]}>
            <Pressable onPress={() => setOpen(m._id)} style={styles.thumb} accessibilityLabel={`Open ${m.title}`}>
              {m.thumbnail ? <Image source={{ uri: m.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <BookOpen size={40} color={zappy[200]} />}
              <View style={[styles.row, styles.thumbTags]}>
                {DIFF[m.difficulty] ? <View style={[styles.tag, { backgroundColor: DIFF[m.difficulty].bg }]}><Text variant="caption" weight="black" color="#fff">{DIFF[m.difficulty].label}</Text></View> : null}
                <View style={[styles.tag, { backgroundColor: 'rgba(0,0,0,0.55)' }]}><Clock size={10} color="#fff" /><Text variant="caption" weight="bold" color="#fff">{m.durationMin}m</Text></View>
              </View>
              {m.certified ? <View style={[styles.tag, styles.certified]}><Award size={10} color="#fff" /><Text variant="caption" weight="black" color="#fff">Certified</Text></View> : null}
            </Pressable>
            <Text variant="body" weight="black">{m.title}</Text>
            {m.description ? <Text variant="caption" color={ink[500]} numberOfLines={2}>{m.description}</Text> : null}
            <View style={styles.between}>
              <View style={styles.row}>
                {m.xpReward ? <View style={[styles.tag, { backgroundColor: zappy[50] }]}><Text variant="caption" weight="black" color={zappy[700]}>+{m.xpReward} XP</Text></View> : null}
                {m.bonusRupees ? <View style={[styles.tag, { backgroundColor: success[50] }]}><Text variant="caption" weight="black" color={success[700]}>+₹{m.bonusRupees}</Text></View> : null}
              </View>
              <Button label={m.certified ? 'Review' : 'Start'} size="small" variant={m.certified ? 'outline' : 'primary'} onPress={() => setOpen(m._id)} />
            </View>
          </View>
        ))}
      </ScrollView>
      {open ? <QuizSheet moduleId={open} onClose={() => setOpen(null)} /> : null}
    </View>
  );
}

/* ── Bank & UPI ──────────────────────────────────────────────────────── */

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.gapXs}>
      <Label>{label}</Label>
      <TextInput placeholderTextColor={ink[400]} style={styles.input} {...props} />
    </View>
  );
}

function AddMethodSheet({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'bank' | 'upi'>('bank');
  const [form, setForm] = useState({ label: '', accountName: '', accountNumber: '', bankName: '', ifsc: '', upiId: '', upiLabel: '' });
  const [add, { isLoading }] = useAddWorkerBankAccountMutation();
  const otp = useOtpGate();
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const ready = tab === 'upi' ? form.upiId.trim() : form.accountName.trim() && form.accountNumber.trim() && form.ifsc.trim();

  async function submit() {
    if (!ready) { toast.error('Fill in the required details'); return; }
    try {
      await otp.run(() => add({ type: tab, ...form }).unwrap());
      toast.success(tab === 'upi' ? 'UPI ID added' : 'Bank account added');
      onClose();
    } catch (err) { if ((err as ApiErr)?.message !== 'cancelled') toast.error(errText(err, 'Failed to add payment method')); }
  }

  return (
    <SheetFrame title="Add destination" onClose={onClose}>
      {otp.modal}
      <View style={styles.segment}>
        {(['bank', 'upi'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} style={[styles.segmentBtn, tab === t && styles.segmentOn]}>
            {t === 'bank' ? <Building2 size={16} color={tab === t ? zappy[600] : ink[500]} /> : <Smartphone size={16} color={tab === t ? zappy[600] : ink[500]} />}
            <Text variant="bodySmall" weight="bold" color={tab === t ? zappy[600] : ink[500]}>{t === 'bank' ? 'Bank transfer' : 'UPI ID'}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'bank' ? (
        <>
          <Field label="ACCOUNT HOLDER" placeholder="Name as per bank record" value={form.accountName} onChangeText={(v) => set('accountName', v)} />
          <Field label="ACCOUNT NUMBER" placeholder="0000 0000 0000" keyboardType="number-pad" value={form.accountNumber} onChangeText={(v) => set('accountNumber', v.replace(/\D/g, ''))} />
          <Field label="IFSC CODE" placeholder="SBIN0001234" autoCapitalize="characters" maxLength={11} value={form.ifsc} onChangeText={(v) => set('ifsc', v.toUpperCase())} />
          <Field label="BANK NAME" placeholder="e.g. State Bank" value={form.bankName} onChangeText={(v) => set('bankName', v)} />
          <Field label="NICKNAME (OPTIONAL)" placeholder="e.g. Main salary account" value={form.label} onChangeText={(v) => set('label', v)} />
        </>
      ) : (
        <>
          <Field label="UPI ID" placeholder="username@bank" autoCapitalize="none" keyboardType="email-address" value={form.upiId} onChangeText={(v) => set('upiId', v.trim())} />
          <Field label="NICKNAME (OPTIONAL)" placeholder="e.g. PhonePe / GPay" value={form.upiLabel} onChangeText={(v) => set('upiLabel', v)} />
        </>
      )}
      <Button label="Save securely" onPress={submit} loading={isLoading} disabled={!ready} fullWidth size="large" />
      <View style={[styles.row, { justifyContent: 'center' }]}><ShieldCheck size={12} color={success[500]} /><Text variant="caption" color={ink[400]}>Information is securely encrypted</Text></View>
    </SheetFrame>
  );
}

type Bank = { _id: string; bankName?: string; accountName: string; accountNumber: string; ifsc: string; label?: string; isDefault?: boolean };
type Upi = { _id: string; upiId: string; label?: string; isDefault?: boolean };

export function BankScreen() {
  const { data, isLoading } = useGetWorkerBankAccountsQuery();
  const [deleteAcc] = useDeleteWorkerBankAccountMutation();
  const [setDefault] = useSetDefaultWorkerBankAccountMutation();
  const [showAdd, setShowAdd] = useState(false);
  const banks: Bank[] = data?.banks ?? [];
  const upiIds: Upi[] = data?.upiIds ?? [];

  function remove(id: string, type: 'bank' | 'upi') {
    Alert.alert('Remove this payment method?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await deleteAcc({ id, type }).unwrap(); toast.success('Removed'); } catch { toast.error('Failed to remove'); }
      } },
    ]);
  }
  async function makeDefault(id: string, type: 'bank' | 'upi') {
    try { await setDefault({ id, type }).unwrap(); toast.success('Set as default'); } catch { toast.error('Failed'); }
  }

  return (
    <View style={styles.page}>
      <ScreenHeader title="Bank & UPI" safeArea right={<Button label="Add" size="small" icon={<Plus size={14} color="#fff" />} onPress={() => setShowAdd(true)} />} />
      {isLoading ? <LoadingState /> : (
        <ScrollView contentContainerStyle={styles.body}>
          {banks.length === 0 && upiIds.length === 0 ? (
            <EmptyState title="No payment methods" message="Add a bank account or UPI ID to withdraw your earnings securely." actionLabel="Add method now" onAction={() => setShowAdd(true)}
              icon={<ShieldCheck size={26} color={zappy[400]} />} />
          ) : null}
          {banks.length ? <Label>BANK ACCOUNTS</Label> : null}
          {banks.map((b) => (
            <View key={b._id} style={[styles.card, b.isDefault && styles.defaultCard]}>
              <View style={styles.between}>
                <View style={styles.flex}>
                  <Text variant="caption" weight="bold" color={ink[400]}>{(b.bankName || 'Bank account').toUpperCase()}</Text>
                  <Text variant="body" weight="black">{b.accountName}</Text>
                </View>
                {b.isDefault ? <View style={[styles.tag, { backgroundColor: zappy[500] }]}><CheckCircle2 size={10} color="#fff" /><Text variant="caption" weight="black" color="#fff">Default</Text></View> : null}
              </View>
              <View style={[styles.between, styles.sunken]}>
                <View><Text variant="caption" weight="bold" color={ink[400]}>A/C NUMBER</Text><Text variant="bodySmall" weight="bold">•••• {b.accountNumber.slice(-4)}</Text></View>
                <View style={{ alignItems: 'flex-end' }}><Text variant="caption" weight="bold" color={ink[400]}>IFSC</Text><Text variant="bodySmall" weight="bold">{b.ifsc}</Text></View>
              </View>
              <View style={styles.between}>
                <View style={styles.tag}><Text variant="caption" weight="bold" color={ink[500]}>{b.label || 'Saved'}</Text></View>
                <View style={styles.row}>
                  {!b.isDefault ? <Button label="Make default" size="small" variant="outline" onPress={() => makeDefault(b._id, 'bank')} /> : null}
                  <Pressable onPress={() => remove(b._id, 'bank')} accessibilityLabel="Remove bank account" hitSlop={6} style={[styles.iconBtn, { backgroundColor: danger[50] }]}><Trash2 size={14} color={danger[500]} /></Pressable>
                </View>
              </View>
            </View>
          ))}
          {upiIds.length ? <Label>UPI IDS</Label> : null}
          {upiIds.map((u) => (
            <View key={u._id} style={[styles.card, styles.row, u.isDefault && styles.defaultCard]}>
              <View style={[styles.iconBox]}><Smartphone size={20} color={zappy[500]} /></View>
              <View style={styles.flex}>
                <Text variant="body" weight="black">{u.upiId}</Text>
                <View style={styles.row}>
                  <View style={styles.tag}><Text variant="caption" weight="bold" color={ink[500]}>{u.label || 'Saved'}</Text></View>
                  {u.isDefault ? <Text variant="caption" weight="bold" color={zappy[600]}>Default</Text> : null}
                </View>
              </View>
              {!u.isDefault ? <Pressable onPress={() => makeDefault(u._id, 'upi')} accessibilityLabel="Make default" hitSlop={6} style={[styles.iconBtn, { backgroundColor: zappy[50] }]}><Star size={14} color={zappy[600]} fill={zappy[600]} /></Pressable> : null}
              <Pressable onPress={() => remove(u._id, 'upi')} accessibilityLabel="Remove UPI ID" hitSlop={6} style={[styles.iconBtn, { backgroundColor: danger[50] }]}><Trash2 size={14} color={danger[500]} /></Pressable>
            </View>
          ))}
          {banks.length || upiIds.length ? (
            <View style={[styles.card, styles.row, { backgroundColor: success[50], borderColor: success[100] }]}>
              <AlertCircle size={16} color={success[600]} />
              <Text variant="caption" color={success[700]} style={styles.flex}>Your default account will be pre-filled when you request a withdrawal from your wallet.</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
      {showAdd ? <AddMethodSheet onClose={() => setShowAdd(false)} /> : null}
    </View>
  );
}

/* ── Withdraw ────────────────────────────────────────────────────────── */

const MIN_PAISE = 5000;    // ₹50, must match server payout.service.js
const MAX_PAISE = 2500000; // ₹25,000
const SETTLE_OPTS = [
  { id: 'instant', label: 'Instant transfer', desc: 'Within 30 minutes', feeRs: 9, Icon: Zap },
  { id: 'next_day', label: 'Next day transfer', desc: 'By 9 AM tomorrow', feeRs: 0, Icon: Clock },
];

export function WithdrawScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: walletData, isLoading: walletLoading } = useGetWalletQuery();
  const { data: bankData, isLoading: bankLoading } = useGetWorkerBankAccountsQuery();
  const [requestPayout, { isLoading: submitting }] = useRequestPayoutMutation();
  const otp = useOtpGate();
  const [amountRs, setAmountRs] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [settlementType, setSettlementType] = useState('next_day');

  const balancePaise: number = walletData?.balance ?? 0;
  const banks: Bank[] = bankData?.banks ?? [];
  const upiIds: Upi[] = bankData?.upiIds ?? [];
  const methods = [
    ...banks.map((b) => ({ id: b._id, type: 'bank' as const, label: b.label || b.bankName || 'Bank account', sub: b.accountNumber, isDefault: b.isDefault, accountName: b.accountName, ifsc: b.ifsc })),
    ...upiIds.map((u) => ({ id: u._id, type: 'upi' as const, label: u.label || 'UPI', sub: u.upiId, isDefault: u.isDefault, accountName: '', ifsc: '' })),
  ];
  const selected = methods.find((m) => m.id === selectedId) ?? methods.find((m) => m.isDefault) ?? methods[0];

  const amtRs = parseFloat(amountRs) || 0;
  const feeRs = SETTLE_OPTS.find((o) => o.id === settlementType)?.feeRs ?? 0;
  const netRs = Math.max(0, amtRs - feeRs);
  const amtPaise = Math.round(amtRs * 100);
  const validationError = amtPaise < MIN_PAISE && amtRs > 0 ? `Minimum withdrawal is ₹${MIN_PAISE / 100}`
    : amtPaise > MAX_PAISE ? `Maximum withdrawal is ₹${MAX_PAISE / 100}`
    : amtPaise > balancePaise ? 'Insufficient wallet balance'
    : !selected ? 'Add a bank account or UPI ID first' : null;

  async function submit() {
    if (validationError) { toast.error(validationError); return; }
    if (!amtRs || !selected) { toast.error('Enter an amount'); return; }
    const body: Record<string, unknown> = { amountPaise: amtPaise, method: selected.type };
    if (selected.type === 'upi') body.upiId = selected.sub;
    else { body.bankAccount = selected.sub; body.bankIfsc = selected.ifsc ?? ''; body.accountName = selected.accountName ?? ''; }
    try {
      await otp.run(() => requestPayout(body).unwrap());
      toast.success('Withdrawal requested');
      router.replace('/worker' as never);
    } catch (err) { if ((err as ApiErr)?.message !== 'cancelled') toast.error(errText(err, 'Failed to request withdrawal. Try again.')); }
  }

  return (
    <View style={styles.page}>
      {otp.modal}
      <ScreenHeader title="Withdraw funds" safeArea />
      {walletLoading || bankLoading ? <LoadingState /> : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, styles.centerCol, { backgroundColor: ink[900], borderColor: ink[900] }]}>
            <Text variant="caption" weight="bold" color={slate[400]}>AVAILABLE BALANCE</Text>
            <Text variant="display" weight="black" color="#fff">₹{(balancePaise / 100).toFixed(2)}</Text>
            {balancePaise < MIN_PAISE ? <View style={[styles.tag, { backgroundColor: 'rgba(245,158,11,0.2)' }]}><AlertCircle size={12} color={'#FCD34D'} /><Text variant="caption" weight="bold" color={'#FCD34D'}>Min. withdrawal ₹{MIN_PAISE / 100}</Text></View> : null}
          </View>

          {/* Owing from cash jobs comes first: only what is left over can be withdrawn. */}
          <DuesCard />

          <View style={styles.card}>
            <View style={styles.between}>
              <Label>AMOUNT TO WITHDRAW</Label>
              <Pressable onPress={() => setAmountRs(String(Math.min(Math.floor(balancePaise / 100), MAX_PAISE / 100)))} hitSlop={6}><Text variant="caption" weight="bold" color={zappy[600]}>USE MAX</Text></Pressable>
            </View>
            <View style={[styles.amountBox, validationError && amtRs > 0 ? { borderColor: danger[400], backgroundColor: danger[50] } : null]}>
              <Text variant="heading1" weight="black" color={amtRs ? zappy[600] : ink[300]}>₹</Text>
              <TextInput value={amountRs} onChangeText={(v) => setAmountRs(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={ink[300]}
                style={[styles.amountInput, validationError && amtRs > 0 ? { color: danger[600] } : null]} accessibilityLabel="Amount in rupees" />
            </View>
            {validationError && amtRs > 0 ? <View style={styles.row}><AlertCircle size={12} color={danger[500]} /><Text variant="caption" weight="bold" color={danger[500]}>{validationError}</Text></View> : null}
            <View style={styles.row}>
              {[500, 1000, 2000, 5000].map((v) => (
                <Pressable key={v} onPress={() => setAmountRs(String(v))} style={[styles.preset, styles.flex]}><Text variant="caption" weight="bold" color={ink[700]}>₹{v}</Text></Pressable>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.between}>
              <Label>SEND TO</Label>
              <Pressable onPress={() => router.push('/worker/bank' as never)} hitSlop={6}><Text variant="caption" weight="bold" color={zappy[600]}>+ ADD NEW</Text></Pressable>
            </View>
            {methods.length === 0 ? (
              <Pressable onPress={() => router.push('/worker/bank' as never)} style={styles.dashed}>
                <Banknote size={22} color={zappy[500]} />
                <Text variant="bodySmall" weight="bold" color={zappy[600]}>Add bank account or UPI</Text>
                <Text variant="caption" color={zappy[400]}>Required to withdraw</Text>
              </Pressable>
            ) : methods.map((m) => {
              const on = selected?.id === m.id;
              return (
                <Pressable key={m.id} onPress={() => setSelectedId(m.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.option, on && styles.optionOn]}>
                  <View style={[styles.iconBox, on && { backgroundColor: zappy[600] }]}>{m.type === 'upi' ? <Smartphone size={18} color={on ? '#fff' : ink[500]} /> : <Building2 size={18} color={on ? '#fff' : ink[500]} />}</View>
                  <View style={styles.flex}>
                    <Text variant="bodySmall" weight="black" numberOfLines={1}>{m.label}</Text>
                    <Text variant="caption" color={ink[400]} numberOfLines={1}>{m.type === 'bank' ? `•••• ${m.sub.slice(-4)}` : m.sub}</Text>
                  </View>
                  {m.isDefault && !on ? <View style={styles.tag}><Text variant="caption" weight="bold" color={ink[500]}>Default</Text></View> : null}
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.card}>
            <Label>TRANSFER SPEED</Label>
            {SETTLE_OPTS.map(({ id, label, desc, feeRs: fee, Icon }) => {
              const on = settlementType === id;
              return (
                <Pressable key={id} onPress={() => setSettlementType(id)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.option, on && styles.optionOn]}>
                  <View style={[styles.iconBox, on && { backgroundColor: zappy[600] }]}><Icon size={18} color={on ? '#fff' : ink[500]} /></View>
                  <View style={styles.flex}><Text variant="bodySmall" weight="black">{label}</Text><Text variant="caption" color={ink[400]}>{desc}</Text></View>
                  <View style={[styles.tag, { backgroundColor: fee ? accent[50] : success[50] }]}><Text variant="caption" weight="black" color={fee ? accent[700] : success[700]}>{fee ? `₹${fee} fee` : 'Free'}</Text></View>
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                </Pressable>
              );
            })}
          </View>

          {amtRs > 0 && !validationError ? (
            <View style={[styles.card, { backgroundColor: ink[900], borderColor: ink[900] }]}>
              <View style={styles.between}><Text variant="bodySmall" color={slate[400]}>Withdrawal amount</Text><Text variant="bodySmall" weight="bold" color="#fff">₹{amtRs.toFixed(2)}</Text></View>
              <View style={styles.between}><Text variant="bodySmall" color={slate[400]}>Transfer fee</Text><Text variant="bodySmall" weight="bold" color={feeRs ? '#FCD34D' : '#86EFAC'}>-₹{feeRs.toFixed(2)}</Text></View>
              <View style={[styles.between, styles.topRule]}><Text variant="body" weight="black" color="#fff">You receive</Text><Text variant="heading2" weight="black" color={'#86EFAC'}>₹{netRs.toFixed(2)}</Text></View>
            </View>
          ) : null}

          <View style={[styles.row, styles.sunken, { alignItems: 'flex-start' }]}>
            <ShieldCheck size={16} color={success[500]} />
            <Text variant="caption" color={ink[500]} style={styles.flex}>All withdrawals are securely processed. Instant transfers may take up to 30 mins depending on your bank's IMPS network status.</Text>
          </View>
        </ScrollView>
      )}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label={submitting ? 'Processing request…' : `Withdraw ₹${netRs > 0 ? netRs.toFixed(2) : '0.00'}`} onPress={submit} loading={submitting}
          disabled={!!validationError || !amtRs || methods.length === 0 || balancePaise < MIN_PAISE} fullWidth size="large" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  gap: { gap: spacing.sm },
  gapXs: { gap: 6 },
  centerCol: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  centerText: { textAlign: 'center' },
  body: { padding: spacing.base, gap: spacing.md, paddingBottom: 140 },
  card: { backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.sm },
  defaultCard: { borderColor: zappy[500], borderWidth: 2 },
  sunken: { backgroundColor: slate[50], borderRadius: radius.medium, padding: spacing.md, borderWidth: 1, borderColor: slate[100] },
  sheetHead: { paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: slate[100], borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  iconBtn: { width: 32, height: 32, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  iconBox: { width: 40, height: 40, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  bar: { height: 8, borderRadius: radius.pill, backgroundColor: slate[100], overflow: 'hidden' },
  barFill: { height: 8, borderRadius: radius.pill },
  dashed: { borderWidth: 2, borderStyle: 'dashed', borderColor: slate[200], borderRadius: radius.large, padding: spacing.xl, alignItems: 'center', gap: 4, backgroundColor: colors.surface },
  amountBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 2, borderColor: slate[100], borderRadius: radius.large, paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  amountInput: { flex: 1, fontSize: 34, fontFamily: 'Figtree-Black', color: ink[900], paddingVertical: 4 },
  preset: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, backgroundColor: slate[50] },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.base, minHeight: 40, justifyContent: 'center', backgroundColor: colors.surface },
  choiceDark: { backgroundColor: zappy[600], borderColor: zappy[600] },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 2, borderColor: slate[100], borderRadius: radius.large, padding: spacing.md, backgroundColor: colors.surface },
  optionOn: { borderColor: zappy[500], backgroundColor: zappy[50] },
  letter: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: slate[200], alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: slate[300], alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: zappy[600], backgroundColor: zappy[600] },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  thumb: { height: 160, borderRadius: radius.large, backgroundColor: zappy[50], overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbTags: { position: 'absolute', left: spacing.md, bottom: spacing.md },
  certified: { position: 'absolute', top: spacing.sm, right: spacing.sm, backgroundColor: success[500] },
  video: { height: 190, borderRadius: radius.large, backgroundColor: ink[900], alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  bigIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', gap: 6, backgroundColor: slate[100], borderRadius: radius.large, padding: 6 },
  segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: radius.medium },
  segmentOn: { backgroundColor: colors.surface },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-SemiBold', color: ink[900], backgroundColor: colors.surface },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.base, paddingTop: spacing.md },
  topRule: { borderTopWidth: 1, borderTopColor: ink[700], paddingTop: spacing.sm },
});
