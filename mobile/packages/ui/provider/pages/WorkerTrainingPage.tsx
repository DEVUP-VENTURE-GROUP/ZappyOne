/**
 * Training modules: watch the video, pass the quiz, earn the certificate
 * (the websites' WorkerTrainingPage).
 */
import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AlertCircle, Award, BookOpen, Clock, PlayCircle } from 'lucide-react-native';
import { useGetTrainingModulesQuery, useGetTrainingModuleQuery, useSubmitTrainingQuizMutation } from '@zappy/core/api';
import { Button, EmptyState, LoadingState, ScreenHeader, Text } from '../../components';
import { toast } from '../../components/Toast';
import { FullScreenSheet } from '../../components/common/FullScreenSheet';
import type { ApiErr } from '../../lib/feedback';
import { colors, zappy, ink, slate, success, accent, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { openLink } from '../../lib/openLink';

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
    <FullScreenSheet title={mod?.title ?? 'Training module'} onClose={onClose}>
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
              <Pressable onPress={() => openLink(mod.videoUrl, 'Could not play the video on this phone.')} style={styles.video} accessibilityRole="button" accessibilityLabel="Play the training video">
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
    </FullScreenSheet>
  );
}

export function WorkerTrainingPage() {
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

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  gap: { gap: spacing.sm },
  centerCol: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  centerText: { textAlign: 'center' },
  body: { padding: spacing.base, gap: spacing.md, paddingBottom: 140 },
  card: { backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.sm },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: slate[100], borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.base, minHeight: 40, justifyContent: 'center', backgroundColor: colors.surface },
  choiceDark: { backgroundColor: zappy[600], borderColor: zappy[600] },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 2, borderColor: slate[100], borderRadius: radius.large, padding: spacing.md, backgroundColor: colors.surface },
  optionOn: { borderColor: zappy[500], backgroundColor: zappy[50] },
  letter: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: slate[200], alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  thumb: { height: 160, borderRadius: radius.large, backgroundColor: zappy[50], overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbTags: { position: 'absolute', left: spacing.md, bottom: spacing.md },
  certified: { position: 'absolute', top: spacing.sm, right: spacing.sm, backgroundColor: success[500] },
  video: { height: 190, borderRadius: radius.large, backgroundColor: ink[900], alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  bigIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
});
