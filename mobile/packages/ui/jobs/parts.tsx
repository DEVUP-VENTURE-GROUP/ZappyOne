/**
 * Pieces every provider job screen shares (repair, pet care, helping), the
 * app's versions of the websites' OnSiteCard, TripSharingBanner, JobMapCard,
 * ArrivalProximity, OtpEntry, StartCodePrompt, CollectPaymentCard and
 * JobEarningsCard. Rules come from the shared jobFlows/money logic.
 */
import React, { useRef, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Check, Heart, KeyRound, MapPin, Navigation, Phone, UserRound, Wallet, X } from 'lucide-react-native';
import { formatPaise } from '@zappy/core/shared/money';
import { useJobEarningsQuery } from '@zappy/core/api';
import { useMyPosition, type SharingState } from '@zappy/core/hooks/useJobTrip';
import { Button, Skeleton, Text } from '../components';
import { colors, zappy, ink, slate, success, accent, danger } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

const RIPPLE = { color: 'rgba(16,24,40,0.08)' };
const directions = (lat: number, lng: number) => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`);

/* A plain card. */
export function JobCard({ children, tone, style }: { children: React.ReactNode; tone?: 'amber' | 'green' | 'red'; style?: object }) {
  const t = tone === 'amber' ? { backgroundColor: accent[50], borderColor: accent[100] }
    : tone === 'green' ? { backgroundColor: success[50], borderColor: success[100] }
      : tone === 'red' ? { backgroundColor: danger[50], borderColor: danger[100] } : null;
  return <View style={[styles.card, t, style]}>{children}</View>;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <Text variant="caption" weight="bold" color={ink[500]} style={styles.eyebrow}>{children}</Text>;
}

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

/* While on a trip leg: is the customer seeing them? */
export function TripBanner({ sharing, to, toCustomer = true }: { sharing: SharingState; to?: { lat: number; lng: number } | null; toCustomer?: boolean }) {
  const live = sharing === 'sharing';
  return (
    <View style={styles.trip}>
      <View style={[styles.dot, { backgroundColor: live ? zappy[600] : slate[300] }]} />
      <View style={styles.flex}>
        <Text variant="bodySmall" weight="bold" color={zappy[800]}>
          {live ? 'Customer can see you on the map' : sharing === 'denied' ? 'Location access is blocked' : 'Getting your location…'}
        </Text>
        <Text variant="caption" color={zappy[700]}>
          {live ? (toCustomer ? 'It stops by itself the moment you mark yourself arrived.' : 'It stops by itself when this leg of the trip ends.')
            : sharing === 'denied' ? 'Allow location for ZappyOne in Settings so the customer can follow your trip.'
              : 'Waiting for the first GPS fix. This can take a few seconds.'}
        </Text>
      </View>
      {to ? (
        <Pressable onPress={() => directions(to.lat, to.lng)} android_ripple={RIPPLE} accessibilityRole="link" style={styles.dirBtn}>
          <Navigation size={12} color="#fff" /><Text variant="caption" weight="bold" color="#fff">Directions</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const hasMapsKey = !!(Constants.expoConfig?.android?.config?.googleMaps?.apiKey);
const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

/* Where to go: the customer's pin and their own position, and one tap into navigation. */
export function JobMapCard({ to, label = 'Customer location', live = true }: { to: { lat: number; lng: number; address?: string } | null; label?: string; live?: boolean }) {
  const me = useMyPosition(live && !!to);
  if (!to) return null;
  const distance = me ? kmBetween(me, to) : null;
  return (
    <View style={styles.mapCard}>
      {/* A Google map needs the build's Maps key; without it Android cannot draw one, so the card stays useful without. */}
      {hasMapsKey ? (
        <MapView provider={PROVIDER_GOOGLE} style={styles.map} initialRegion={{ latitude: to.lat, longitude: to.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
          showsUserLocation={live} toolbarEnabled={false} accessibilityLabel={`Map: ${label}`}>
          <Marker coordinate={{ latitude: to.lat, longitude: to.lng }} title={label} pinColor={zappy[600]} />
        </MapView>
      ) : null}
      <View style={styles.row}>
        <MapPin size={18} color={zappy[600]} />
        <View style={styles.flex}>
          <Text variant="caption" weight="bold" color={ink[400]}>
            {label.toUpperCase()}{distance != null ? ` · ${distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`} away` : ''}
          </Text>
          <Text variant="bodySmall" weight="semibold" numberOfLines={2}>{to.address || `${to.lat.toFixed(5)}, ${to.lng.toFixed(5)}`}</Text>
        </View>
        <Pressable onPress={() => directions(to.lat, to.lng)} android_ripple={RIPPLE} accessibilityRole="link" style={styles.navBtn}>
          <Navigation size={14} color="#fff" /><Text variant="bodySmall" weight="bold" color="#fff">Navigate</Text>
        </Pressable>
      </View>
    </View>
  );
}

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

/* Six boxes over one hidden field: the customer's handover or start code. */
export function CodeBoxes({ value, onChange, length = 6, title, hint }: { value: string; onChange: (v: string) => void; length?: number; title: string; hint: string }) {
  const ref = useRef<TextInput>(null);
  return (
    <View style={styles.codeWrap}>
      <View style={styles.row}>
        <View style={[styles.circleSm, { backgroundColor: accent[50] }]}><KeyRound size={15} color={accent[600]} /></View>
        <View style={styles.flex}>
          <Text variant="caption" weight="extrabold" color={accent[700]}>{title.toUpperCase()}</Text>
          <Text variant="caption" color={ink[500]}>{hint}</Text>
        </View>
      </View>
      <Pressable onPress={() => ref.current?.focus()} style={styles.boxes} accessibilityLabel={`${title}, ${value.length} of ${length} digits`}>
        {Array.from({ length }).map((_, i) => (
          <View key={i} style={[styles.box, value[i] ? styles.boxOn : null]}>
            <Text variant="heading2" weight="black" color={value[i] ? accent[700] : ink[300]}>{value[i] ? '●' : '–'}</Text>
          </View>
        ))}
      </Pressable>
      <TextInput ref={ref} value={value} onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={length} autoFocus style={styles.hidden} />
    </View>
  );
}

/**
 * Runs a step; if the server answers "ask for the start code", asks for it
 * and runs the step again with the code (the websites' useStartCodeGate).
 */
export function useStartCodeGate() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const pending = useRef<((code?: string) => Promise<unknown>) | null>(null);

  async function run<T>(attempt: (code?: string) => Promise<T>): Promise<T | null> {
    try {
      return await attempt(undefined);
    } catch (err) {
      const c = (err as { data?: { code?: string } })?.data?.code;
      if (c !== 'START_CODE_REQUIRED' && c !== 'START_CODE_INVALID') throw err;
      pending.current = attempt;
      setError(''); setCode(''); setOpen(true);
      return null;
    }
  }

  async function submit() {
    if (!/^[0-9]{4,6}$/.test(code)) { setError('Enter the code the customer reads out'); return; }
    setBusy(true);
    try { await pending.current?.(code); setOpen(false); }
    catch (err) { setError((err as { data?: { error?: string } })?.data?.error || 'That did not work. Try again.'); }
    finally { setBusy(false); }
  }

  const prompt = (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <View style={styles.between}>
            <View style={styles.flex}>
              <View style={styles.row}><KeyRound size={17} color={zappy[600]} /><Text variant="heading3" weight="bold">Ask for the code</Text></View>
              <Text variant="bodySmall" color={ink[700]} style={styles.mtXs}>The customer sees a code in their app. Type what they read out to you.</Text>
            </View>
            <Pressable onPress={() => setOpen(false)} accessibilityLabel="Close" hitSlop={10}><X size={18} color={ink[400]} /></Pressable>
          </View>
          <TextInput value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad"
            textContentType="oneTimeCode" autoFocus accessibilityLabel="Start code" style={styles.codeInput} />
          {error ? <Text variant="bodySmall" weight="medium" color={danger[600]}>{error}</Text> : null}
          <Button label="Confirm" onPress={submit} loading={busy} fullWidth size="large" />
        </View>
      </View>
    </Modal>
  );
  return { run, prompt };
}

/* The money step: collect cash and record it, or wait for the online payment. */
export function CollectPaymentCard({ amountPaise, paymentMethod, paid, collecting, onCollect, what = 'payment', tipPaise = 0, carriedPaise = 0 }: {
  amountPaise: number; paymentMethod?: string; paid?: boolean; collecting?: boolean; onCollect: () => void; what?: string; tipPaise?: number; carriedPaise?: number;
}) {
  if (!amountPaise || amountPaise <= 0) return null;
  const amount = formatPaise(amountPaise);
  const tip = tipPaise > 0 ? (
    <View style={styles.tip}><Heart size={13} color={danger[500]} fill={danger[500]} />
      <Text variant="caption" weight="bold" color={danger[600]}>Includes a {formatPaise(tipPaise)} tip from the customer. All yours.</Text></View>
  ) : null;
  if (paid) {
    return (
      <JobCard tone="green">
        <View style={styles.row}><Check size={15} color={success[700]} /><Text variant="bodySmall" weight="bold" color={success[700]}>{amount} {paymentMethod === 'cash' ? 'collected in cash' : 'paid online'}</Text></View>
        {tip}
      </JobCard>
    );
  }
  const cash = paymentMethod === 'cash';
  return (
    <JobCard tone="amber">
      <Text variant="body" weight="bold">{cash ? `Collect ${amount} in cash` : `Waiting for ${amount} online`}</Text>
      <Text variant="caption" color={ink[700]} style={styles.mtXs}>
        {cash
          ? `Take the ${what} from the customer, then record it here. The platform's share is deducted from your wallet.${carriedPaise > 0 ? ` This includes ${formatPaise(carriedPaise)} the customer owed from an earlier cancelled booking; it comes off your wallet too.` : ''}`
          : 'The customer chose to pay online and can pay from their booking screen. If they cannot, take cash and record it here.'}
      </Text>
      {tip}
      <Button label={`I've collected ${amount} in cash`} variant={cash ? 'primary' : 'outline'} onPress={onCollect} loading={collecting} fullWidth style={styles.mtSm} />
    </JobCard>
  );
}

type Line = { label: string; paise: number; note?: string };
function Block({ title, total, rows, you }: { title: string; total: number; rows: Line[]; you?: boolean }) {
  return (
    <View style={[styles.block, you ? styles.blockYou : null]}>
      <View style={styles.between}>
        <Text variant="bodySmall" weight="bold" color={you ? success[700] : ink[900]}>{title}</Text>
        <Text variant="body" weight="black" color={you ? success[700] : ink[900]}>{formatPaise(total)}</Text>
      </View>
      {rows.map((r) => (
        <View key={r.label} style={styles.between}>
          <View style={styles.flex}>
            <Text variant="caption" color={ink[700]}>{r.label}</Text>
            {r.note ? <Text variant="caption" color={ink[400]}>{r.note}</Text> : null}
          </View>
          <Text variant="caption" weight="semibold">{r.paise < 0 ? `− ${formatPaise(-r.paise)}` : formatPaise(r.paise)}</Text>
        </View>
      ))}
    </View>
  );
}

/* After the job: what the customer paid, what ZappyOne keeps, what is theirs. */
export function JobEarningsCard({ jobId }: { jobId: string }) {
  const { data, isLoading } = useJobEarningsQuery(jobId);
  const e = data?.earnings;
  if (isLoading) return <Skeleton height={160} />;
  if (!e) return null;
  return (
    <JobCard>
      <View style={styles.row}><Wallet size={14} color={ink[500]} /><Eyebrow>PAYMENT BREAKDOWN</Eyebrow></View>
      <Block title="Customer paid" total={e.customerPaidPaise} rows={e.bill} />
      <Block title="ZappyOne keeps" total={e.zappyKeepsPaise} rows={e.zappy} />
      <Block title="You earn" total={e.youEarnPaise} rows={e.yours} you />
      <Text variant="caption" color={ink[700]}>
        {e.cash
          ? `You collected ${formatPaise(e.customerPaidPaise)} in cash. ZappyOne's ${formatPaise(e.zappyKeepsPaise)} comes off your wallet, so you keep ${formatPaise(e.youEarnPaise)}.`
          : `The customer paid online. Your ${formatPaise(e.youEarnPaise)} goes to your wallet.`}
      </Text>
    </JobCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  between: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  mtXs: { marginTop: 2 },
  mtSm: { marginTop: spacing.sm },
  eyebrow: { letterSpacing: 0.8 },
  card: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.sm },
  circle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  circleSm: { width: 32, height: 32, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: ink[900], borderRadius: radius.button, paddingHorizontal: spacing.md, minHeight: 40 },
  trip: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, backgroundColor: zappy[50], borderRadius: radius.medium, borderWidth: 1, borderColor: zappy[100], padding: spacing.md },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  dirBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: zappy[600], borderRadius: radius.button, paddingHorizontal: spacing.sm, minHeight: 32 },
  mapCard: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', paddingBottom: spacing.md, gap: spacing.md },
  map: { height: 220 },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.button, paddingHorizontal: spacing.md, minHeight: 40, marginRight: spacing.md },
  codeWrap: { gap: spacing.md },
  boxes: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  box: { flex: 1, maxWidth: 52, aspectRatio: 1, borderRadius: radius.medium, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  boxOn: { borderColor: accent[500], backgroundColor: accent[50] },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(16,24,40,0.5)', justifyContent: 'center', padding: spacing.base },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.extraLarge, padding: spacing.lg, gap: spacing.base },
  codeInput: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.medium, paddingVertical: spacing.md, textAlign: 'center', fontSize: 30, letterSpacing: 12, fontFamily: 'Figtree-Bold', color: ink[900] },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: danger[50], borderRadius: radius.button, paddingHorizontal: spacing.sm, paddingVertical: 6, marginTop: spacing.sm },
  block: { backgroundColor: slate[50], borderRadius: radius.button, padding: spacing.md, gap: 6 },
  blockYou: { backgroundColor: success[50], borderWidth: 1, borderColor: success[100] },
});
