/** The new services this partner asked for, with the photos, jobs and prices exactly as sent (the website's MyServiceRequests). */
import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useProviderMyLineRequestsQuery } from '@zappy/core/api';
import { Text } from '../../../components';
import { accent, colors, danger, ink, slate, success } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';

interface Pkg { name: string; minutes: number; pricePaise: number; photoUrl?: string | null }
interface Req { _id: string; proposedName: string; description?: string; status: string; reviewNote?: string; createdAt: string; updatedAt?: string; photoUrls?: string[]; packages?: Pkg[] }

const STATE: Record<string, { label: string; bg: string; fg: string }> = {
  pending: { label: 'Waiting for ZappyOne', bg: accent[50], fg: accent[700] },
  approved: { label: 'Approved', bg: success[50], fg: success[700] },
  rejected: { label: 'Not approved', bg: danger[50], fg: danger[600] },
};
const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

export function MyServiceRequests() {
  const { data } = useProviderMyLineRequestsQuery(undefined);
  const [viewing, setViewing] = useState<string | null>(null);
  const requests: Req[] = data?.requests || [];
  if (!requests.length) return null;
  return (
    <View style={styles.wrap}>
      <Text variant="caption" weight="bold" color={ink[500]}>SERVICES YOU ASKED FOR</Text>
      {requests.map((r) => {
        const st = STATE[r.status] || STATE.pending;
        return (
          <View key={r._id} style={styles.card}>
            <View style={styles.top}>
              <View style={styles.flex}>
                <Text variant="bodySmall" weight="bold" numberOfLines={1}>{r.proposedName}</Text>
                <Text variant="caption" color={ink[400]}>Sent {new Date(r.updatedAt || r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: st.bg }]}><Text variant="caption" weight="bold" color={st.fg}>{st.label}</Text></View>
            </View>
            {r.status === 'rejected' && r.reviewNote ? <Text variant="caption" color={danger[600]}>{r.reviewNote}</Text> : null}
            {r.description ? <Text variant="caption" color={ink[700]}>{r.description}</Text> : null}
            {r.photoUrls?.length ? (
              <View style={styles.grid}>
                {r.photoUrls.map((src) => (
                  <Pressable key={src} onPress={() => setViewing(src)} accessibilityRole="imagebutton" accessibilityLabel="View photo" style={styles.thumb}>
                    <Image source={{ uri: src }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  </Pressable>
                ))}
              </View>
            ) : null}
            {r.packages?.map((p) => (
              <View key={p.name} style={styles.pkg}>
                {p.photoUrl ? <Pressable onPress={() => setViewing(p.photoUrl || null)} style={styles.pkgPhoto}><Image source={{ uri: p.photoUrl }} style={StyleSheet.absoluteFill} /></Pressable> : null}
                <View style={styles.flex}>
                  <Text variant="caption" weight="semibold" numberOfLines={1}>{p.name}</Text>
                  <Text variant="caption" color={ink[400]}>{p.minutes} min</Text>
                </View>
                <Text variant="bodySmall" weight="bold">{rupees(p.pricePaise)}</Text>
              </View>
            ))}
          </View>
        );
      })}
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewing(null)} accessibilityLabel="Close photo">
          {viewing ? <Image source={{ uri: viewing }} style={styles.full} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, padding: spacing.base },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumb: { width: '31.5%', aspectRatio: 1, overflow: 'hidden', borderRadius: radius.medium, backgroundColor: slate[100] },
  pkg: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  pkgPhoto: { width: 40, height: 40, overflow: 'hidden', borderRadius: radius.small, backgroundColor: slate[100] },
  viewer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.88)', padding: spacing.base },
  full: { width: '100%', height: '80%' },
});
