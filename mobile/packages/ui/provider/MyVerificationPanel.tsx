/**
 * What the provider gave us, and where each service stands (the websites'
 * MyVerificationPanel). A verified identity does not bring work by itself:
 * jobs come only for services marked Approved.
 */
import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Camera, Clock, FileText, PauseCircle, PencilLine, ShieldCheck, X, XCircle } from 'lucide-react-native';
import { useProviderMyDocumentsQuery } from '@zappy/core/api';
import { Button, LoadingState, Text } from '../components';
import { colors, zappy, ink, slate, success, accent, danger } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';
import { InstantIdCheck } from './InstantIdCheck';

const STATUS: Record<string, { label: string; Icon: typeof ShieldCheck; bg: string; fg: string }> = {
  approved: { label: 'Approved · you get jobs', Icon: ShieldCheck, bg: success[50], fg: success[700] },
  pending_review: { label: 'Under review', Icon: Clock, bg: accent[50], fg: accent[700] },
  draft: { label: 'Not submitted yet', Icon: PencilLine, bg: slate[100], fg: ink[500] },
  rejected: { label: 'Needs changes', Icon: XCircle, bg: danger[50], fg: danger[600] },
  suspended: { label: 'Paused by ZappyOne', Icon: PauseCircle, bg: slate[100], fg: ink[700] },
  not_submitted: { label: 'Not submitted yet', Icon: PencilLine, bg: slate[100], fg: ink[500] },
};

export const when = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

type Doc = { code: string; label: string; url?: string; live?: boolean; uploadedAt?: string };

type Svc = { lineCode: string; name: string; status: string; reviewedAt?: string; submittedAt?: string; reviewNote?: string; documents: Doc[]; fields: { code: string; label: string; value: string }[] };

function StatusChip({ status, identity = false }: { status: string; identity?: boolean }) {
  const m = STATUS[status] || STATUS.draft;
  return (
    <View style={[styles.tag, { backgroundColor: m.bg }]}>
      <m.Icon size={12} color={m.fg} />
      <Text variant="caption" weight="semibold" color={m.fg}>{identity && status === 'approved' ? 'Verified' : m.label}</Text>
    </View>
  );
}

function DocTile({ doc, onOpen }: { doc: Doc; onOpen: () => void }) {
  const Icon = doc.live ? Camera : FileText;
  return (
    <Pressable onPress={() => doc.url && onOpen()} disabled={!doc.url} style={styles.docTile} accessibilityLabel={doc.label}>
      <View style={styles.docImg}>
        {doc.url ? <Image source={{ uri: doc.url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Icon size={18} color={ink[400]} />}
        {doc.live ? <View style={styles.liveTag}><Text variant="caption" weight="bold" color="#fff">Live</Text></View> : null}
      </View>
      <Text variant="caption" weight="semibold" color={ink[700]} numberOfLines={1} style={{ padding: 6 }}>{doc.label}</Text>
    </Pressable>
  );
}

/**
 * What you gave us, and where each service stands. Identity is shown once
 * (reused for every service), then each service's application with its
 * documents, answers and the reviewer's note. Jobs come only for services
 * marked Approved.
 */
export function MyVerificationPanel({ isShop = false, addServiceHref = '/provider/onboarding' }: { isShop?: boolean; addServiceHref?: string }) {
  const router = useRouter();
  const { data, isLoading, isError } = useProviderMyDocumentsQuery();
  const [open, setOpen] = useState<Doc | null>(null);
  const addService = () => router.push(addServiceHref as never);
  if (isLoading) return <LoadingState />;
  if (isError || !data) return null;
  const services: Svc[] = data.services ?? [];
  const approved = services.filter((s) => s.status === 'approved');

  return (
    <View style={styles.panel}>
      {/* The rule, said once, where it cannot be missed. */}
      <View style={[styles.card, approved.length ? { backgroundColor: success[50], borderColor: success[100] } : { backgroundColor: accent[50], borderColor: accent[100] }]}>
        <Text variant="bodySmall" weight="bold" color={approved.length ? success[700] : accent[700]}>
          {approved.length ? `You get jobs for ${approved.map((s) => s.name).join(', ')}` : 'No service approved yet, so no jobs come to you'}
        </Text>
        <Text variant="caption" color={approved.length ? success[700] : accent[700]}>
          {isShop ? 'Your shop' : 'Your'} ID is checked once and reused for every service. Each service is approved on its own; only approved services bring jobs.
        </Text>
      </View>

      <InstantIdCheck />

      <View style={styles.card}>
        <View style={styles.between}><Text variant="bodySmall" weight="bold">{isShop ? 'Shop identity' : 'Your identity'}</Text><StatusChip status={data.identity.status} identity /></View>
        <Text variant="caption" color={ink[500]}>Given once. Used for every service you add.</Text>
        {data.identity.documents.length ? (
          <View style={styles.docGrid}>{data.identity.documents.map((d: Doc) => <DocTile key={d.code} doc={d} onOpen={() => setOpen(d)} />)}</View>
        ) : <View style={styles.sunken}><Text variant="caption" color={ink[500]}>Nothing uploaded yet.</Text></View>}
      </View>

      <View style={styles.between}>
        <Text variant="bodySmall" weight="bold">Your services</Text>
        <Pressable onPress={addService} hitSlop={8}><Text variant="caption" weight="semibold" color={zappy[600]}>Add a service</Text></Pressable>
      </View>
      {!services.length ? <View style={styles.card}><Text variant="caption" color={ink[500]}>You have not applied for a service yet.</Text></View> : null}
      {services.map((s) => (
        <View key={s.lineCode} style={styles.card}>
          <View style={[styles.between, { alignItems: 'flex-start' }]}>
            <View style={styles.flex}>
              <Text variant="bodySmall" weight="semibold" numberOfLines={1}>{s.name}</Text>
              <Text variant="caption" color={ink[500]}>{s.status === 'approved' && s.reviewedAt ? `Approved ${when(s.reviewedAt)}` : s.submittedAt ? `Sent ${when(s.submittedAt)}` : 'Started, not sent for review'}</Text>
            </View>
            <StatusChip status={s.status} />
          </View>
          {s.reviewNote && ['rejected', 'suspended', 'pending_review'].includes(s.status) ? (
            <View style={[styles.sunken, { backgroundColor: danger[50], borderColor: danger[100] }]}><Text variant="caption" color={danger[600]}>Reviewer: {s.reviewNote}</Text></View>
          ) : null}
          {s.documents.length ? <View style={styles.docGrid}>{s.documents.map((d) => <DocTile key={d.code} doc={d} onOpen={() => setOpen(d)} />)}</View> : null}
          {s.fields.map((f) => (
            <View key={f.code} style={[styles.between, styles.dashRow]}>
              <Text variant="caption" color={ink[500]}>{f.label}</Text>
              <Text variant="caption" weight="medium" numberOfLines={1} style={{ flexShrink: 1, textAlign: 'right' }}>{f.value}</Text>
            </View>
          ))}
          {['draft', 'rejected'].includes(s.status) ? <Button label={s.status === 'draft' ? 'Finish and send for review' : 'Fix and send again'} onPress={addService} fullWidth /> : null}
        </View>
      ))}
      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.viewer} onPress={() => setOpen(null)} accessibilityLabel="Close">
          {open?.url ? <Image source={{ uri: open.url }} style={styles.viewerImg} resizeMode="contain" /> : null}
          <Text variant="bodySmall" weight="semibold" color="#fff">{open?.label}{open?.uploadedAt ? ` · ${when(open.uploadedAt)}` : ''}</Text>
          <View style={styles.viewerClose}><X size={18} color={ink[900]} /></View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  panel: { gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.sm },
  sunken: { backgroundColor: slate[50], borderRadius: radius.medium, padding: spacing.md, borderWidth: 1, borderColor: slate[100] },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  docGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  docTile: { width: '31%', borderRadius: radius.medium, backgroundColor: slate[50], borderWidth: 1, borderColor: slate[100], overflow: 'hidden' },
  docImg: { aspectRatio: 4 / 3, backgroundColor: slate[100], alignItems: 'center', justifyContent: 'center' },
  liveTag: { position: 'absolute', left: 6, top: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.pill, paddingHorizontal: 6 },
  dashRow: { borderBottomWidth: 1, borderStyle: 'dashed', borderBottomColor: slate[100], paddingVertical: 4 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: spacing.base, gap: spacing.sm },
  viewerImg: { width: '100%', height: '75%', borderRadius: radius.large },
  viewerClose: { position: 'absolute', top: 56, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
