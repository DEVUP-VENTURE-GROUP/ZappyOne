/**
 * Returning an item for the customer: collect, return, hand back the refund
 * (the website's ReturnExecution).
 */
import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useAddHelpingProofMutation, useRecordHelpingHandoverMutation } from '@zappy/core/api';
import { HELPING_HANDED } from '@zappy/core/shared/jobFlows';
import { Button, Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { ProofPhotos, readyKeys, type ProofPhoto } from '../../../components/common/ProofPhotos';
import { JobCard, Eyebrow } from '../../../components/jobs/JobCard';
import { errText } from '../../../lib/feedback';
import { colors, ink, slate, success } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import type { Task } from './types';

export function ReturnExecution({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const [proofs, setProofs] = useState<ProofPhoto[]>([]);
  const [tracking, setTracking] = useState('');
  const [ack, setAck] = useState('');
  const [handover, { isLoading }] = useRecordHelpingHandoverMutation();
  const [addProof] = useAddHelpingProofMutation();

  async function submit() {
    const keys = readyKeys(proofs);
    if (!keys.length) { toast.error('At least one photo of the handover is needed'); return; }
    try {
      await Promise.all(keys.map((k) => addProof({ id: task._id, kind: 'merchant_acknowledgement', key: k }).unwrap()));
      await handover({ id: task._id, trackingNumber: tracking, acknowledgement: ack, proofKeys: keys }).unwrap();
      toast.success('Handover recorded'); onChanged();
    } catch (err) { toast.error(errText(err, 'Could not record the handover')); }
  }

  if (HELPING_HANDED.includes(task.status)) {
    return <JobCard tone="green"><Text variant="bodySmall" color={success[700]}>Handover recorded — the merchant's own process takes it from here.</Text></JobCard>;
  }
  if (!['RETURNING', 'AT_DROPOFF'].includes(task.status)) return null;
  return (
    <JobCard>
      <Eyebrow>HANDOVER</Eyebrow>
      {task.returnDetail?.merchantInstructions ? <View style={styles.soft}><Text variant="caption" color={ink[500]}>{task.returnDetail.merchantInstructions}</Text></View> : null}
      <ProofPhotos photos={proofs} onChange={setProofs} folder="helping/handover" max={3} title="Handover / receipt photo" hint="A courier receipt, store acknowledgement, or clear handover photo." />
      <TextInput value={tracking} onChangeText={setTracking} placeholder="Tracking / AWB number (if any)" placeholderTextColor={ink[400]} style={styles.input} />
      <TextInput value={ack} onChangeText={setAck} placeholder="Merchant acknowledgement (if any)" placeholderTextColor={ink[400]} style={styles.input} />
      <Button label="Confirm handover" onPress={submit} loading={isLoading} fullWidth />
    </JobCard>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 14, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  soft: { backgroundColor: slate[50], borderRadius: radius.button, padding: spacing.md },
});
