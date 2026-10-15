/**
 * Customers near the shop asking its price on a repair it has not priced for
 * their device (the website's ShopPriceRequestsPage). The answer reaches the
 * customer at once and is saved as the shop's price for that device, so the
 * next customer sees it without asking. New requests arrive live.
 */
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { CheckCircle2, Clock, Inbox, MapPin, Send } from 'lucide-react-native';
import { useOfferPriceMutation, useShopPriceRequestsQuery } from '@zappy/core/api';
import { useSocketEvent } from '@zappy/core/hooks/useSocketEvent';
import { Button, EmptyState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const GRADES = [{ code: 'oem', label: 'Original' }, { code: 'premium', label: 'Premium' }, { code: 'standard', label: 'Standard' }];
const MODE: Record<string, string> = { doorstep: 'At the customer', pickup_repair: 'Pickup & return', workshop: 'At your shop', roadside: 'Roadside' };

interface Offer { totalPaise: number; qualityCode?: string | null; warrantyDays?: number; note?: string }
interface Request { _id: string; repairName: string; deviceName: string; serviceMode: string; distanceKm?: number | null; area?: string; expiresAt: string; answers?: number; needsGrade?: boolean; myOffer?: Offer | null }

function left(at: string) {
  const m = Math.max(0, Math.round((new Date(at).getTime() - Date.now()) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min left` : `${m} min left`;
}

function RequestCard({ r }: { r: Request }) {
  const [offer, { isLoading }] = useOfferPriceMutation();
  const mine = r.myOffer;
  const [rupees, setRupees] = useState(mine ? String(Math.round(mine.totalPaise / 100)) : '');
  const [grade, setGrade] = useState<string | null>(mine?.qualityCode || (r.needsGrade ? 'premium' : null));
  const [warranty, setWarranty] = useState(String(mine?.warrantyDays ?? 90));
  const [note, setNote] = useState(mine?.note || '');

  async function send() {
    const total = Math.round(Number(rupees) * 100);
    if (!(total >= 5000)) { toast.error('Enter your price in rupees (at least ₹50)'); return; }
    try {
      await offer({ id: r._id, totalPaise: total, qualityCode: r.needsGrade ? grade : null, warrantyDays: Number(warranty) || 0, note }).unwrap();
      toast.success(mine ? 'Price updated. The customer sees it now.' : 'Price sent. The customer sees it now.');
    } catch (err) { toast.error(errText(err, 'Could not send your price')); }
  }

  return (
    <View style={styles.card}>
      <View>
        <Text variant="bodySmall" weight="bold">{r.repairName}</Text>
        <Text variant="caption" color={ink[700]}>{r.deviceName}</Text>
        <View style={styles.meta}>
          <Text variant="caption" color={ink[500]}>{MODE[r.serviceMode] || r.serviceMode}</Text>
          {r.distanceKm != null ? <View style={styles.inline}><MapPin size={11} color={ink[500]} /><Text variant="caption" color={ink[500]}>{r.distanceKm} km{r.area ? `, ${r.area}` : ''}</Text></View> : null}
          <View style={styles.inline}><Clock size={11} color={ink[500]} /><Text variant="caption" color={ink[500]}>{left(r.expiresAt)}</Text></View>
          {r.answers ? <Text variant="caption" color={ink[500]}>{r.answers} {r.answers === 1 ? 'shop has' : 'shops have'} answered</Text> : null}
        </View>
      </View>
      {mine ? (
        <View style={styles.sent}><CheckCircle2 size={13} color={success[700]} /><Text variant="caption" weight="semibold" color={success[700]} style={styles.flex}>You sent ₹{Math.round(mine.totalPaise / 100).toLocaleString('en-IN')}. You can change it until they book.</Text></View>
      ) : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text variant="caption" weight="semibold" color={ink[500]}>Your price (₹, all-in)</Text>
          <TextInput value={rupees} onChangeText={(v) => setRupees(v.replace(/[^\d]/g, ''))} keyboardType="number-pad" placeholder="e.g. 1450" placeholderTextColor={ink[400]} style={styles.input} />
        </View>
        <View style={styles.flex}>
          <Text variant="caption" weight="semibold" color={ink[500]}>Warranty (days)</Text>
          <TextInput value={warranty} onChangeText={(v) => setWarranty(v.replace(/[^\d]/g, ''))} keyboardType="number-pad" style={styles.input} />
        </View>
      </View>
      {r.needsGrade ? (
        <View>
          <Text variant="caption" weight="semibold" color={ink[500]}>Part you will fit</Text>
          <View style={styles.row}>
            {GRADES.map((g) => (
              <Pressable key={g.code} onPress={() => setGrade(g.code)} accessibilityRole="radio" accessibilityState={{ selected: grade === g.code }} style={[styles.grade, grade === g.code && styles.gradeOn]}>
                <Text variant="caption" weight="bold" color={grade === g.code ? zappy[700] : ink[700]}>{g.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <TextInput value={note} onChangeText={setNote} maxLength={300} placeholder="A line for the customer (optional), e.g. done in 1 hour" placeholderTextColor={ink[400]} style={styles.input} />
      <Button label={mine ? 'Update my price' : 'Send my price'} icon={<Send size={14} color="#fff" />} onPress={send} loading={isLoading} fullWidth />
    </View>
  );
}

export function ShopPriceRequestsPage() {
  const { data, isLoading, refetch } = useShopPriceRequestsQuery(undefined, { pollingInterval: 60000 });
  // A new request arrives live.
  useSocketEvent('price_request.new', () => { refetch(); toast('A customer near you asked for your price'); });
  const rows: Request[] = data?.requests || [];
  return (
    <View style={styles.page}>
      <ScreenHeader title="Price requests" subtitle="Customers near you asking what you charge" safeArea />
      {isLoading ? <LoadingState /> : (
        <FlatList data={rows} keyExtractor={(r) => r._id} contentContainerStyle={styles.body} ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => <RequestCard r={item} />} keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<EmptyState title="No requests right now" message="When a customer nearby needs a repair you have not priced, it shows here and you get a notification." icon={<Inbox size={22} color={slate[300]} />} />} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  body: { padding: spacing.base, paddingBottom: 120 },
  sep: { height: spacing.md },
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, marginTop: 4 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sent: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.sm, borderRadius: radius.medium, backgroundColor: success[50] },
  row: { flexDirection: 'row', gap: spacing.sm },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface, marginTop: 4 },
  grade: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.medium, borderWidth: 1, borderColor: slate[200], marginTop: 4 },
  gradeOn: { borderColor: zappy[600], backgroundColor: zappy[50] },
});
