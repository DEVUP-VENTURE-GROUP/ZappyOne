/**
 * A few quick questions, one at a time from the server's diagnostic tree (the
 * website's DiagnoseStep). The answers travel with the booking twice: as ids
 * for the engine, and as the questions and the customer's own words for the
 * technician at the door. A problem with no questions moves straight on.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { useSubmitRepairDiagnosticMutation } from '@zappy/core/api';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { RIPPLE, errText } from '@zappy/ui/lib/feedback';
import { ink, success, zappy } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import { Shell, Spinner, flow } from './FlowChrome';

interface Option { id: string; label: string; description?: string; priceHint?: string }
interface Question { id: string; text: string; subtitle?: string; type?: string; options?: Option[] }
interface DiagState { complete?: boolean; nextQuestion?: Question | null; diagnosis?: Diagnosis | null }
export interface Diagnosis {
  summary?: string; flowCode?: string; primaryRepairCode?: string; requiresDiagnosis?: boolean; recommendedQuality?: string;
  recommendations?: { repairCode?: string; repairName?: string; name?: string; allowedServiceModes?: string[] }[];
}
export interface QA { questionId: string; question: string; answer: string }
type Answers = Record<string, string | string[]>;

export function DiagnoseStep({ vertical, problem, onResolved }: {
  vertical: string; problem: { code: string }; onResolved: (d: Diagnosis | null, answers: Answers, transcript: QA[]) => void;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [transcript, setTranscript] = useState<QA[]>([]);
  const [submit, { isLoading }] = useSubmitRepairDiagnosticMutation();
  const [state, setState] = useState<DiagState | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef<{ answers: Answers; transcript: QA[] }>({ answers: {}, transcript: [] });
  latest.current = { answers, transcript };

  // Start with no answers to get the first question.
  useEffect(() => {
    setFailed(false);
    submit({ vertical, problemCode: problem.code, answers: {} }).unwrap().then(setState).catch(() => setFailed(true));
  }, [problem.code, vertical, submit, attempt]);

  // Nothing left to ask: hand the diagnosis back exactly once, driven by state so no path leaves a spinner.
  const resolved = useRef(false);
  const done = !!state && (state.complete || !state.nextQuestion);
  useEffect(() => {
    if (!done || resolved.current) return;
    resolved.current = true;
    onResolved(state!.diagnosis || null, latest.current.answers, latest.current.transcript);
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  // Last resort if moving on did not take: let the customer continue themselves.
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => setStuck(true), 4000);
    return () => clearTimeout(t);
  }, [done]);

  async function answer(q: Question, option: Option) {
    const multi = q.type === 'multi';
    const prev = answers[q.id];
    const nextAnswers: Answers = multi ? { ...answers, [q.id]: [...(Array.isArray(prev) ? prev : []), option.id] } : { ...answers, [q.id]: option.id };
    // The readable pair, captured before the next question replaces this one.
    const nextTranscript = [...transcript.filter((t) => t.questionId !== q.id || multi), { questionId: q.id, question: q.text || q.id, answer: option.label || option.id }];
    setAnswers(nextAnswers);
    setTranscript(nextTranscript);
    latest.current = { answers: nextAnswers, transcript: nextTranscript };
    try { setState(await submit({ vertical, problemCode: problem.code, answers: nextAnswers }).unwrap()); }
    catch (err) { toast.error(errText(err, 'That did not go through. Please try again.')); }
  }

  if (failed) {
    return (
      <Shell>
        <View style={[flow.card, styles.center]}>
          <Text variant="body" weight="semibold">We could not load the questions</Text>
          <Text variant="caption" color={ink[500]} style={styles.text}>Check your connection, then try again. You can also skip and the technician will check it on site.</Text>
          <View style={styles.actions}>
            <Button label="Try again" onPress={() => setAttempt((n) => n + 1)} />
            <Button label="Skip" variant="outline" onPress={() => onResolved(null, {}, [])} />
          </View>
        </View>
      </Shell>
    );
  }
  if (!state) return <Spinner />;

  const q = state.nextQuestion;
  if (!q) {
    return (
      <Shell>
        <View style={[flow.card, styles.center]}>
          <ActivityIndicator color={zappy[400]} />
          <Text variant="bodySmall" color={ink[500]}>Working out the likely repair…</Text>
          {stuck ? <Button label="Continue" onPress={() => onResolved(state.diagnosis || null, latest.current.answers, latest.current.transcript)} /> : null}
        </View>
      </Shell>
    );
  }

  return (
    <Shell>
      <Animated.View key={q.id} entering={FadeInRight.duration(200)} style={styles.gap}>
        <View style={flow.card}>
          <Text variant="body" weight="bold">{q.text}</Text>
          {q.subtitle ? <Text variant="caption" color={ink[400]}>{q.subtitle}</Text> : null}
        </View>
        {(q.options || []).map((opt) => (
          <Pressable key={opt.id} onPress={() => answer(q, opt)} disabled={isLoading} android_ripple={RIPPLE} accessibilityRole="button" style={[flow.card, isLoading && styles.dim]}>
            <Text variant="bodySmall" weight="semibold">{opt.label}</Text>
            {opt.description ? <Text variant="caption" color={ink[400]}>{opt.description}</Text> : null}
            {opt.priceHint ? <Text variant="caption" weight="semibold" color={success[600]}>{opt.priceHint}</Text> : null}
          </Pressable>
        ))}
      </Animated.View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  text: { textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  gap: { gap: spacing.sm },
  dim: { opacity: 0.6 },
});
