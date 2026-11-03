/** Pros who cannot come now but can by a time (server jobs/offers; the website's LaterOffersCard): OK to one, or keep waiting for someone sooner. */
import { Image, StyleSheet, View } from 'react-native';
import { Clock3, Star } from 'lucide-react-native';
import { useChooseJobOfferMutation, useJobOffersQuery } from '@zappy/core/api';
import { useLivePoll } from '@zappy/core/hooks/useLivePoll';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

interface Offer { by: string; name: string; rating: number | null; completedJobs: number; minutes: number; arriveBy: string; photoUrl: string | null }
const clockOf = (d: string) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export function LaterOffersCard({ jobId }: { jobId: string }) {
  const { data } = useJobOffersQuery(jobId, { pollingInterval: useLivePoll(20000) });
  const [choose, { isLoading, originalArgs }] = useChooseJobOfferMutation();
  const offers: Offer[] = data?.offers || [];
  if (!data?.waiting || !offers.length) return null;

  async function ok(o: Offer) {
    try { await choose({ id: jobId, by: o.by }).unwrap(); toast.success(`${o.name.split(' ')[0]} is coming. Be ready by ${clockOf(o.arriveBy)}.`); }
    catch (err) { toast.error(errText(err, 'That offer is no longer open. Pick another.')); }
  }

  return (
    <View style={styles.card} accessibilityLabel="Pros who can come a little later">
      <Text variant="bodySmall" weight="bold">{offers.length === 1 ? 'A pro can come a little later' : `${offers.length} pros can come a little later`}</Text>
      <Text variant="caption" color={ink[500]}>We keep looking for someone sooner while you decide.</Text>
      {offers.map((o) => (
        <View key={o.by} style={styles.row}>
          <View style={styles.avatar}>
            {o.photoUrl ? <Image source={{ uri: o.photoUrl }} style={StyleSheet.absoluteFill} /> : <Text variant="bodySmall" weight="bold" color={zappy[700]}>{o.name[0]?.toUpperCase()}</Text>}
          </View>
          <View style={styles.flex}>
            <Text variant="bodySmall" weight="bold" numberOfLines={1}>{o.name}</Text>
            <View style={styles.meta}>
              <Clock3 size={12} color={ink[700]} />
              <Text variant="caption" weight="semibold" color={ink[700]}>by {clockOf(o.arriveBy)} (in {Math.max(1, Math.round((new Date(o.arriveBy).getTime() - Date.now()) / 60000))} min)</Text>
              {o.rating != null ? <><Star size={11} color="#F59E0B" fill="#F59E0B" /><Text variant="caption" color={ink[500]}>{Number(o.rating).toFixed(1)}</Text></> : null}
            </View>
          </View>
          <Button label="OK" size="small" loading={isLoading && originalArgs?.by === o.by} disabled={isLoading} onPress={() => ok(o)} />
        </View>
      ))}
      {data.decideBy ? (
        <Text variant="caption" color={ink[500]}>
          {data.autoTakes ? `If you do not answer, we book ${offers[0].name.split(' ')[0]} for you at ${clockOf(data.decideBy)}.` : 'Nothing is booked until you tap OK.'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  flex: { flex: 1, minWidth: 0 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
});
