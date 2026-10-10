/**
 * Who is on site to meet the provider, with a call button (the websites' OnSiteCard).
 */
import React from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Phone, UserRound } from 'lucide-react-native';
import { Text } from '../components';
import { JobCard } from '../components/jobs/JobCard';
import { RIPPLE } from '../lib/feedback';
import { ink, accent } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

/* Someone else meets them at the door (booked for a relative). */
export function OnSiteCard({ onSite }: { onSite?: { name?: string; phone?: string } | null }) {
  if (!onSite?.name) return null;
  return (
    <JobCard tone="amber" style={styles.row}>
      <View style={[styles.circle, { backgroundColor: '#fff' }]}><UserRound size={17} color={accent[700]} /></View>
      <View style={styles.flex}>
        <Text variant="caption" weight="semibold" color={accent[700]}>MEET AT THE DOOR</Text>
        <Text variant="body" weight="semibold" numberOfLines={1}>{onSite.name}</Text>
        <Text variant="caption" color={ink[500]}>Booked for them by the customer</Text>
      </View>
      {onSite.phone ? (
        <Pressable onPress={() => Linking.openURL(`tel:+91${onSite.phone}`)} android_ripple={RIPPLE} accessibilityRole="button" accessibilityLabel={`Call ${onSite.name}`} style={styles.callBtn}>
          <Phone size={15} color="#fff" /><Text variant="bodySmall" weight="semibold" color="#fff">Call</Text>
        </Pressable>
      ) : null}
    </JobCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  circle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: ink[900], borderRadius: radius.button, paddingHorizontal: spacing.md, minHeight: 40 },
});
