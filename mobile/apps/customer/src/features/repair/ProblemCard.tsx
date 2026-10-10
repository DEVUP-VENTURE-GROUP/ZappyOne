/**
 * One problem as a picture card, or as a plain row when a heading's problems
 * have no photos (the website's ProblemCard and ProblemLayout). A problem
 * priced only after inspection says so; an urgent one is marked.
 */
import { memo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { AlertTriangle, ChevronRight, Wrench } from 'lucide-react-native';
import { problemPhotoIn } from '@zappy/core/shared/problemArt';
import { Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { accent, colors, danger, ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface Problem { code: string; name: string; severity?: string; requiresDiagnosis?: boolean }

const Urgent = () => <View style={styles.urgent}><AlertTriangle size={12} color={danger[600]} /><Text variant="caption" weight="semibold" color={danger[600]}>Urgent</Text></View>;

const ProblemCard = memo(function ProblemCard({ photo, problem, onPick }: { photo: string | null; problem: Problem; onPick: (p: Problem) => void }) {
  return (
    <Pressable onPress={() => onPick(problem)} accessibilityRole="button" accessibilityLabel={problem.name} style={styles.card}>
      <View style={styles.art}>
        {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Wrench size={28} color={ink[400]} strokeWidth={1.5} />}
        {problem.severity === 'critical' ? <View style={styles.badge}><Urgent /></View> : null}
      </View>
      <View style={styles.body}>
        <Text variant="bodySmall" weight="semibold" numberOfLines={2}>{problem.name}</Text>
        {problem.requiresDiagnosis ? <Text variant="caption" weight="medium" color={accent[700]}>Priced after inspection</Text> : null}
      </View>
    </Pressable>
  );
});

const ProblemRow = memo(function ProblemRow({ problem, onPick }: { problem: Problem; onPick: (p: Problem) => void }) {
  return (
    <Pressable onPress={() => onPick(problem)} accessibilityRole="button" style={styles.row}>
      <View style={styles.flex}>
        <Text variant="body" weight="semibold">{problem.name}</Text>
        {problem.requiresDiagnosis ? <Text variant="caption" weight="medium" color={accent[700]}>Priced after inspection</Text> : null}
      </View>
      {problem.severity === 'critical' ? <Urgent /> : null}
      <ChevronRight size={18} color={slate[300]} />
    </Pressable>
  );
});

/** Photo cards when this heading's problems have photos, rows when none do (vehicles). */
export function ProblemLayout({ vertical, problems, category, onPick }: { vertical: string; problems: Problem[]; category: { code: string }; onPick: (p: Problem) => void }) {
  const photos = problems.map((p) => webAsset(problemPhotoIn(vertical, p, category)));
  if (!photos.some(Boolean)) return <View style={styles.list}>{problems.map((p) => <ProblemRow key={p.code} problem={p} onPick={onPick} />)}</View>;
  return <View style={styles.grid}>{problems.map((p, i) => <ProblemCard key={p.code} photo={photos[i]} problem={p} onPick={onPick} />)}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  list: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: { width: '47.5%', overflow: 'hidden', borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  art: { aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  badge: { position: 'absolute', top: 8, left: 8, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#fff' },
  body: { gap: 2, padding: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  urgent: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
