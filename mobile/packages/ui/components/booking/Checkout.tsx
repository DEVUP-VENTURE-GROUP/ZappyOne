/**
 * The checkout pieces every booking shares (the websites' TipAtCheckout,
 * SomeoneElse, PendingFeeNotice and PayMethodPicker):
 *   TipAtCheckout     an optional tip, in the total before paying (amounts from Economics)
 *   SomeoneElse       the person the provider meets, when it is not the customer
 *   PendingFeeNotice  a cancellation fee still owed, added to this booking as its own line
 *   PayMethodPicker   how the job is paid
 *
 * The app pays in cash: online payment needs a payment SDK in the app, and an
 * option that cannot work is never shown. It is the same statement the
 * websites make whenever the gateway is off.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Banknote, Heart, Info, UserRound } from 'lucide-react-native';
import { useGetPricingConfigQuery, useMyPendingCancelFeeQuery } from '@zappy/core/api';
import { useAppSelector } from '@zappy/core/store/hooks';
import { Text } from '..';
import { accent, colors, danger, ink, slate, success } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

/** value / onChange: rupees (0 = no tip). */
export function TipAtCheckout({ value = 0, onChange }: { value?: number; onChange: (rupees: number) => void }) {
  const { data } = useGetPricingConfigQuery();
  const max = data?.pricing?.tipMaxPaise ?? 50000;
  const options: number[] = ((data?.pricing?.tipOptions || [20, 50, 100]) as number[]).filter((r) => r > 0 && r * 100 <= max);
  if (!options.length) return null;
  const pill = (on: boolean, rose = false) => [styles.pill, on && (rose ? styles.pillRose : styles.pillOn)];
  return (
    <View style={[styles.card, styles.tip]}>
      <View style={styles.row}><Heart size={15} color="#F43F5E" fill={value ? '#F43F5E' : 'none'} /><Text variant="bodySmall" weight="bold">Add a tip for your pro?</Text></View>
      <Text variant="caption" color={ink[500]}>Optional. Added to your total; every rupee goes to them.</Text>
      <View style={styles.wrap}>
        <Pressable onPress={() => onChange(0)} accessibilityRole="radio" accessibilityState={{ selected: !value }} style={pill(!value)}><Text variant="caption" weight="semibold" color={ink[700]}>No tip</Text></Pressable>
        {options.map((r) => (
          <Pressable key={r} onPress={() => onChange(r)} accessibilityRole="radio" accessibilityState={{ selected: value === r }} style={pill(value === r, true)}>
            <Text variant="caption" weight="bold" color={value === r ? '#fff' : ink[700]}>₹{r}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const PHONE = /^[6-9]\d{9}$/;

/** onChange gets { name, phone } when both are right, 'incomplete' while typing, null when off. */
export function SomeoneElse({ onChange }: { onChange: (v: { name: string; phone: string } | 'incomplete' | null) => void }) {
  const [on, setOn] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const digits = phone.replace(/\D/g, '').slice(-10);
  const ok = name.trim().length >= 2 && PHONE.test(digits);
  useEffect(() => { onChange(on ? (ok ? { name: name.trim(), phone: digits } : 'incomplete') : null); }, [on, name, digits, ok]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}><UserRound size={17} color={ink[700]} /></View>
        <View style={styles.flex}>
          <Text variant="bodySmall" weight="semibold">This is for someone else</Text>
          <Text variant="caption" color={ink[500]}>The provider will call them, not you</Text>
        </View>
        <Switch value={on} onValueChange={setOn} accessibilityLabel="This is for someone else" />
      </View>
      {on ? (
        <View style={styles.gap}>
          <TextInput value={name} onChangeText={setName} maxLength={60} placeholder="Their name" placeholderTextColor={ink[400]} style={styles.input} accessibilityLabel="Their name" />
          <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={14} placeholder="Their mobile number" placeholderTextColor={ink[400]} style={styles.input} accessibilityLabel="Their mobile number" />
          {phone && !PHONE.test(digits) ? <Text variant="caption" weight="semibold" color={danger[600]}>Enter their 10-digit mobile number</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const rupees = (p: number) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;

export function PendingFeeNotice() {
  const signedIn = useAppSelector((s) => s.auth.isAuthenticated);
  const { data } = useMyPendingCancelFeeQuery(undefined, { skip: !signedIn });
  if (!data?.totalPaise) return null;
  const when = data.since ? new Date(data.since).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null;
  return (
    <View style={[styles.row, styles.notice]}>
      <Info size={16} color={accent[600]} />
      <Text variant="caption" color={accent[700]} style={styles.flex}>
        <Text variant="caption" weight="bold" color={accent[700]}>{rupees(data.totalPaise)}</Text> from {data.count > 1 ? `${data.count} cancelled bookings` : 'a cancelled booking'}{when ? ` (since ${when})` : ''} is added to this booking as its own line. It goes to the providers whose trips were cancelled.
      </Text>
    </View>
  );
}

/** The app pays in cash, said plainly before the button so nobody is surprised at the door. */
export function PayMethodPicker({ cashNote = 'Pay the provider directly once the job is done.' }: { cashNote?: string }) {
  return (
    <View style={[styles.card, styles.cash]}>
      <View style={[styles.row, styles.top]}>
        <Banknote size={16} color={success[700]} />
        <View style={styles.flex}>
          <Text variant="bodySmall" weight="bold" color={success[700]}>Pay in cash</Text>
          <Text variant="caption" color={success[700]}>{cashNote} Nothing is charged now.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  top: { alignItems: 'flex-start' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  gap: { gap: spacing.sm, marginTop: spacing.sm },
  card: { gap: 4, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tip: { borderWidth: 2, borderColor: '#FFE4E6', backgroundColor: '#FFF7F8' },
  cash: { borderColor: success[100], backgroundColor: success[50] },
  pill: { borderRadius: radius.pill, borderWidth: 1, borderColor: slate[200], backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 6 },
  pillOn: { borderColor: slate[400] },
  pillRose: { borderColor: '#F43F5E', backgroundColor: '#F43F5E' },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  notice: { alignItems: 'flex-start', padding: spacing.base, borderRadius: radius.large, backgroundColor: accent[50] },
});
