/**
 * Before booking: how soon the nearest verified provider for this service can
 * reach this spot (the website's NearestArrival). Said plainly when nobody is
 * free right now: the booking still goes out and the customer is told later.
 */
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useJobArrivalQuery } from '@zappy/core/api';
import { Text } from '../Text';
import { ArrivalBadge } from './ArrivalBadge';
import { accent, ink, slate, success } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export function NearestArrival({ line, loc, noun = 'provider' }: { line?: string; loc?: { lat?: number; lng?: number } | null; noun?: string }) {
  const skip = !line || typeof loc?.lat !== 'number';
  const { data, isFetching } = useJobArrivalQuery({ line, lat: loc?.lat, lng: loc?.lng }, { skip });
  if (skip) return null;
  if (isFetching && !data) return <View style={styles.row}><ActivityIndicator size="small" color={slate[400]} /><Text variant="caption" color={ink[500]}>Checking who is near…</Text></View>;
  const a = data?.arrival;
  if (!a) return <View style={[styles.box, { backgroundColor: accent[50] }]}><Text variant="caption" color={accent[700]}>No {noun} is free near here right now. Book anyway: we keep looking and tell you the moment someone is near.</Text></View>;
  return (
    <View style={[styles.box, styles.row, { backgroundColor: success[50] }]}>
      <ArrivalBadge minutes={a.minutes} withinPromise={a.withinPromise} busy={a.busy} />
      <Text variant="caption" color={ink[700]}>{a.busy ? `The nearest ${noun} is finishing a job.` : `Nearest ${noun} ~${a.km} km away`}{a.nearby > 1 ? `, ${a.nearby} nearby` : ''}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  box: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.medium },
});
