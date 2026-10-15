/**
 * My shifts (the website's StaffShiftsPage; server workforce/): book the
 * hub's shifts for the coming week, the month's salary, and leave.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import {
  useWorkforceMeQuery, useBookShiftMutation, useCancelShiftMutation, useStaffSalaryQuery, useStaffLeaveQuery, useRequestLeaveMutation,
} from '@zappy/core/api';
import { formatPaise } from '@zappy/core/shared/money';
import { Button, LoadingState, ScreenHeader, Text } from '../../components';
import { toast } from '../../components/Toast';
import { errText } from '../../lib/feedback';
import { accent, colors, danger, ink, slate, success, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const dayLabel = (d: string) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const STATUS: Record<string, string> = { booked: 'Booked', checked_in: 'On duty', done: 'Worked', missed: 'Missed' };
const istKey = (offset = 0) => new Date(Date.now() + 330 * 60000 + offset * 86400000).toISOString().slice(0, 10);

export function StaffShiftsPage() {
  const { data, isLoading } = useWorkforceMeQuery(undefined);
  const { data: sal } = useStaffSalaryQuery(undefined);
  const { data: leaveData } = useStaffLeaveQuery(undefined);
  const [book, { isLoading: booking }] = useBookShiftMutation();
  const [cancel] = useCancelShiftMutation();
  const [askLeave, { isLoading: asking }] = useRequestLeaveMutation();
  const [leaveDay, setLeaveDay] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const salary = sal?.salary;
  const run = (p: Any, ok: string) => p.unwrap().then(() => toast.success(ok)).catch((e: Any) => toast.error(errText(e, 'Could not do that')));

  return (
    <View style={styles.page}>
      <ScreenHeader title="My shifts" safeArea />
      {isLoading ? <LoadingState /> : !data?.staff ? (
        <View style={styles.body}><Text variant="bodySmall" color={ink[700]}>Shifts are for ZappyOne staff.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {salary ? (
            <View style={styles.card}>
              <Text variant="bodySmall" weight="bold">Salary, this month</Text>
              <Text variant="heading1" weight="black">{formatPaise(salary.payPaise)}</Text>
              <Text variant="caption" color={ink[500]}>{salary.paidDays} of {salary.workingDays} days paid ({salary.workedDays} worked, {salary.leaveDays} leave) on {formatPaise(salary.salaryPaise)} a month.</Text>
              <View style={styles.row3}>
                <View style={styles.mini}><Text variant="bodySmall" weight="bold">{formatPaise(salary.tipsPaise)}</Text><Text variant="caption" color={ink[500]}>Tips, yours</Text></View>
                <View style={styles.mini}><Text variant="bodySmall" weight="bold">{salary.missedShifts}</Text><Text variant="caption" color={ink[500]}>Missed</Text></View>
                <View style={styles.mini}><Text variant="bodySmall" weight="bold" color={accent[600]}>{formatPaise(salary.cashToDepositPaise)}</Text><Text variant="caption" color={ink[500]}>Cash to deposit</Text></View>
              </View>
            </View>
          ) : null}

          <Text variant="bodySmall" weight="bold">Shifts at {data.hub.name}</Text>
          {data.schedule.map((d: Any) => (
            <View key={d.day} style={styles.card}>
              <Text variant="caption" weight="bold" color={ink[700]}>{dayLabel(d.day)}</Text>
              {d.shifts.map((s: Any) => (
                <View key={s.code} style={styles.shift}>
                  <View style={styles.flex}>
                    <Text variant="bodySmall" weight="semibold">{s.label}, {s.start} to {s.end}</Text>
                    <Text variant="caption" color={ink[500]}>{s.booked} of {s.need} booked</Text>
                  </View>
                  {s.mine ? (
                    s.mine.status === 'booked'
                      ? <Pressable onPress={() => run(cancel(s.mine.id), 'Taken off the shift')} style={styles.ghost}><Text variant="caption" weight="semibold" color={ink[500]}>Cancel</Text></Pressable>
                      : <View style={styles.tag}><Text variant="caption" weight="bold" color={success[700]}>{STATUS[s.mine.status] || s.mine.status}</Text></View>
                  ) : s.canBook ? (
                    <Pressable disabled={booking} onPress={() => run(book({ day: d.day, code: s.code }), 'Shift booked')} style={styles.book}><Text variant="caption" weight="bold" color="#fff">Book</Text></Pressable>
                  ) : <Text variant="caption" weight="semibold" color={ink[400]}>Full</Text>}
                </View>
              ))}
            </View>
          ))}

          <View style={styles.card}>
            <Text variant="bodySmall" weight="bold">Leave</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dates}>
              {Array.from({ length: 21 }, (_, i) => istKey(i)).map((k) => (
                <Pressable key={k} onPress={() => setLeaveDay(k === leaveDay ? null : k)} style={[styles.date, k === leaveDay && styles.dateOn]} accessibilityRole="button" accessibilityState={{ selected: k === leaveDay }}>
                  <Text variant="caption" weight="bold" color={k === leaveDay ? '#fff' : ink[900]}>{dayLabel(k)}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput value={reason} onChangeText={setReason} maxLength={200} placeholder="Reason" placeholderTextColor={ink[400]} style={styles.input} />
            <Button label="Ask for leave" onPress={() => leaveDay && run(askLeave({ day: leaveDay, reason }), 'Leave requested').then(() => { setLeaveDay(null); setReason(''); })} disabled={!leaveDay} loading={asking} fullWidth />
            {(leaveData?.leave || []).map((l: Any) => (
              <View key={l._id} style={styles.leaveRow}>
                <Text variant="caption" color={ink[700]} style={styles.flex}>{dayLabel(l.day)}{l.reason ? `, ${l.reason}` : ''}</Text>
                <Text variant="caption" weight="semibold" color={l.status === 'approved' ? success[600] : l.status === 'rejected' ? danger[600] : ink[500]}>{l.status === 'requested' ? 'Waiting' : l.status === 'approved' ? 'Approved' : 'Not approved'}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.base, gap: spacing.md, paddingBottom: 60 },
  card: { backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
  row3: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  mini: { flex: 1, alignItems: 'center', backgroundColor: slate[50], borderRadius: radius.medium, paddingVertical: spacing.sm },
  shift: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: slate[50], borderRadius: radius.medium, padding: spacing.md },
  ghost: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: 12, paddingVertical: 6 },
  tag: { backgroundColor: success[50], borderRadius: radius.button, paddingHorizontal: 10, paddingVertical: 4 },
  book: { backgroundColor: zappy[600], borderRadius: radius.button, paddingHorizontal: 14, paddingVertical: 7 },
  dates: { gap: 6, paddingVertical: 4 },
  date: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: 10, paddingVertical: 8 },
  dateOn: { backgroundColor: ink[900], borderColor: ink[900] },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, paddingVertical: 10, color: ink[900] },
  leaveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
});
