/**
 * The quality checks before handing a repaired device back (the website's QAPanel).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AlertTriangle, Check, ClipboardCheck, X } from 'lucide-react-native';
import { useRepairQaChecklistQuery, useSubmitRepairQaMutation } from '@zappy/core/api';
import { qaState, qaPayload } from '@zappy/core/shared/jobFlows';
import { Button, LoadingState, Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { JobCard } from '../../../components/jobs/JobCard';
import { errText } from '../../../lib/feedback';
import { zappy, ink, slate, success, danger } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';

export function QAPanel({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const { data, isLoading } = useRepairQaChecklistQuery(bookingId);
  const [submit, { isLoading: submitting }] = useSubmitRepairQaMutation();
  const [results, setResults] = useState<Record<string, string>>({});
  if (isLoading) return <LoadingState />;
  const checklist = data?.checklist;
  if (!checklist) return null;
  const items: { code: string; label: string; required?: boolean }[] = checklist.items || [];
  const { requiredUntested, failedRequired } = qaState(items, results);

  async function send() {
    try {
      const res = await submit({ id: bookingId, ...qaPayload(checklist, results) }).unwrap();
      if (res.passed) { toast.success('QA passed - you can complete the job'); onDone(); }
      else toast.error('QA failed - fix the failed checks and re-run');
    } catch (err) { toast.error(errText(err, 'Could not submit QA')); }
  }

  return (
    <JobCard>
      <View style={styles.row}><ClipboardCheck size={16} color={zappy[600]} /><Text variant="body" weight="bold">{checklist.name}</Text></View>
      <Text variant="caption" color={ink[400]}>Required checks must pass before the job can be completed.</Text>
      {items.map((item) => {
        const val = results[item.code];
        return (
          <View key={item.code} style={styles.qaRow}>
            <View style={styles.flex}>
              <Text variant="bodySmall">{item.label}</Text>
              {item.required ? <Text variant="caption" weight="bold" color={danger[500]}>REQUIRED</Text> : null}
            </View>
            {([['pass', success[600]], ['fail', danger[600]], ['not_applicable', ink[700]]] as const).map(([r, tone]) => (
              <Pressable key={r} onPress={() => setResults((s) => ({ ...s, [item.code]: r }))} accessibilityRole="radio" accessibilityState={{ selected: val === r }}
                accessibilityLabel={`${item.label}: ${r === 'not_applicable' ? 'not applicable' : r}`} style={[styles.qaBtn, val === r && { backgroundColor: tone }]}>
                {r === 'pass' ? <Check size={13} color={val === r ? '#fff' : ink[500]} /> : r === 'fail' ? <X size={13} color={val === r ? '#fff' : ink[500]} />
                  : <Text variant="caption" weight="bold" color={val === r ? '#fff' : ink[500]}>N/A</Text>}
              </Pressable>
            ))}
          </View>
        );
      })}
      {failedRequired.length ? (
        <View style={[styles.row, styles.alert]}><AlertTriangle size={14} color={danger[600]} />
          <Text variant="caption" color={danger[600]} style={styles.flex}>{failedRequired.length} required check{failedRequired.length > 1 ? 's' : ''} failed. Completion is blocked until resolved.</Text></View>
      ) : null}
      <Button label={requiredUntested.length ? `${requiredUntested.length} required check(s) left` : 'Submit QA'} onPress={send} loading={submitting} disabled={requiredUntested.length > 0} fullWidth />
    </JobCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  qaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: slate[100] },
  qaBtn: { width: 38, height: 34, borderRadius: radius.button, backgroundColor: slate[100], alignItems: 'center', justifyContent: 'center' },
  alert: { backgroundColor: danger[50], borderRadius: radius.button, padding: spacing.sm },
});
