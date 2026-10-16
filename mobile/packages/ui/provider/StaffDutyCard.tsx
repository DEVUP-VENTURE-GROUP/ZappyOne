/**
 * For ZappyOne's own staff, at the top of the Rakshak home (the website's
 * StaffDutyCard; server workforce/): today's shift and the one button that
 * matters (check in at the hub with a selfie, or check out), this month's
 * salary so far, and cash to deposit.
 */
import { useState } from 'react';
import { timeOf } from '@zappy/core/shared/clock';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Building2, CalendarDays, ChevronRight, LogIn, LogOut } from 'lucide-react-native';
import { useCheckInShiftMutation, useCheckOutShiftMutation, useStaffSalaryQuery } from '@zappy/core/api';
import { getBestPosition } from '@zappy/core/hooks/useBestPosition';
import { pickPhoto, uploadPhoto } from '@zappy/core/lib/upload';
import { formatPaise } from '@zappy/core/shared/money';
import { Button, Text } from '../components';
import { toast } from '../components/Toast';
import { errText } from '../lib/feedback';
import { accent, colors, ink, success, zappy } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const time = (d: string) => timeOf(d);

export function StaffDutyCard({ me }: { me: Any }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [checkIn] = useCheckInShiftMutation();
  const [checkOut, { isLoading: leaving }] = useCheckOutShiftMutation();
  const { data } = useStaffSalaryQuery(undefined);
  const salary = data?.salary;
  const shift = me.current;
  const onDuty = shift?.status === 'checked_in';

  async function start() {
    setBusy(true);
    try {
      const photo = await pickPhoto({ camera: true, front: true });
      if (!photo) { setBusy(false); return; }
      const [where, selfieKey] = await Promise.all([getBestPosition({ windowMs: 6000 }), uploadPhoto(photo, 'staff-checkin')]);
      const r = await checkIn({ lat: where.lat, lng: where.lng, selfieKey }).unwrap();
      toast.success(r.message);
    } catch (e) { toast.error(errText(e, (e as Error)?.message || 'Could not check in')); }
    setBusy(false);
  }

  async function end() {
    try { const r = await checkOut(undefined).unwrap(); toast.success(r.message); } catch (e) { toast.error(errText(e, 'Could not check out')); }
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}><Building2 size={19} color={zappy[700]} /></View>
        <View style={styles.flex}>
          <Text variant="caption" weight="bold" color={ink[500]}>ZAPPYONE STAFF, {String(me.hub.name).toUpperCase()}</Text>
          <Text variant="body" weight="bold" numberOfLines={1}>{shift ? `${shift.label || 'Shift'}, ${time(shift.startAt)} to ${time(shift.endAt)}` : 'No shift booked today'}</Text>
          {shift ? <Text variant="caption" weight="semibold" color={onDuty ? success[600] : ink[500]}>{onDuty ? 'On duty. Jobs near you come to you first.' : `Check in at ${me.hub.address || me.hub.name}`}</Text> : null}
        </View>
      </View>
      {shift && !onDuty ? <Button label="Check in with a selfie" icon={<LogIn size={17} color="#fff" />} onPress={start} loading={busy} fullWidth size="large" /> : null}
      {onDuty ? <Button label="Check out" variant="outline" icon={<LogOut size={17} color={ink[900]} />} onPress={end} loading={leaving} fullWidth size="large" /> : null}
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text variant="caption" weight="semibold" color={ink[500]}>Salary this month</Text>
          <Text variant="heading3" weight="black">{salary ? formatPaise(salary.payPaise) : '–'}</Text>
          {salary ? <Text variant="caption" color={ink[400]}>{salary.paidDays} of {salary.workingDays} days</Text> : null}
        </View>
        <View style={[styles.stat, styles.divider]}>
          <Text variant="caption" weight="semibold" color={ink[500]}>Cash to deposit</Text>
          <Text variant="heading3" weight="black" color={salary?.cashToDepositPaise ? accent[600] : ink[900]}>{salary ? formatPaise(salary.cashToDepositPaise) : '–'}</Text>
          <Text variant="caption" color={ink[400]}>At your hub, end of shift</Text>
        </View>
      </View>
      <Pressable onPress={() => router.push('/worker/shifts' as never)} accessibilityRole="button" style={styles.link}>
        <CalendarDays size={16} color={zappy[700]} /><Text variant="bodySmall" weight="semibold" color={zappy[700]} style={styles.flex}>My shifts, salary and leave</Text><ChevronRight size={16} color={zappy[700]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  icon: { width: 40, height: 40, borderRadius: radius.medium, backgroundColor: zappy[50], alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  stat: { flex: 1, gap: 2 },
  divider: { borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: spacing.md },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
});
