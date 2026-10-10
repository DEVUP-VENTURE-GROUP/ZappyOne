/**
 * How close the provider is to the job, until they are near enough to arrive.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { Text } from '..';
import { success, accent } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { JobCard } from '../jobs/JobCard';

/* How close they are while heading to the customer; "arrived" unlocks inside the radius. */
export function ArrivalBar({ metres, radius: r }: { metres: number | null; radius: number }) {
  if (metres == null) return null;
  const within = metres <= r;
  return (
    <JobCard tone={within ? 'green' : 'amber'} style={styles.row}>
      <MapPin size={18} color={within ? success[600] : accent[600]} />
      <View style={styles.flex}>
        <Text variant="bodySmall" weight="extrabold" color={within ? success[700] : accent[700]}>{within ? "You're at the location" : `${Math.round(metres)} m away`}</Text>
        <Text variant="caption" color={within ? success[600] : accent[600]}>{within ? `${Math.round(metres)} m · tap to confirm arrival` : `Get within ${r} m to mark arrived`}</Text>
      </View>
    </JobCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
