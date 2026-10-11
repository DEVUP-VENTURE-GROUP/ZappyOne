/**
 * A month at a time (the events website's CalendarPage). Booked days show what
 * is on; blocked days stop customers from picking them (the customer's date
 * picker reads the same data). A day with a booking cannot be blocked.
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ChevronLeft, ChevronRight, Lock, Unlock } from 'lucide-react-native';
import { useBlockEventDateMutation, usePartnerCalendarQuery, useUnblockEventDateMutation } from '@zappy/core/api';
import { monthCells, ymd } from '@zappy/core/shared/partnerBookings';
import { Button, ErrorState, IconButton, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { PartnerBookingRow, type PartnerBooking } from '../PartnerBookingRow';
import { usePartner } from '../usePartner';
import { VerifyFirst } from '../VerifyFirst';
import { CalendarDay } from './CalendarDay';

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const longDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

export function PartnerCalendarPage() {
  const { partner, verified } = usePartner();
  const { data, isLoading, isError, refetch } = usePartnerCalendarQuery(undefined, { skip: !verified });
  const [block, { isLoading: blocking }] = useBlockEventDateMutation();
  const [unblock, { isLoading: unblocking }] = useUnblockEventDateMutation();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [picked, setPicked] = useState<Date | null>(null);
  const blocked = useMemo(() => new Set<string>((data?.blockedDates || []).map(ymd)), [data]);
  const byDay = useMemo(() => {
    const m = new Map<string, PartnerBooking[]>();
    for (const b of (data?.bookings || []) as PartnerBooking[]) { const k = ymd(b.eventDate); m.set(k, [...(m.get(k) || []), b]); }
    return m;
  }, [data]);

  const header = <ScreenHeader title="Calendar" subtitle="Block the days you can't take bookings." safeArea />;
  if (!verified) return <View style={styles.page}>{header}<VerifyFirst kycStatus={partner?.kyc?.status} /></View>;
  if (isLoading) return <View style={styles.page}>{header}<LoadingState /></View>;
  if (isError) return <View style={styles.page}>{header}<ErrorState onRetry={refetch} /></View>;

  const today = ymd(new Date());
  const cells: (Date | null)[] = monthCells(month);
  const now = new Date();
  const isCurrentMonth = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
  const pk = picked ? ymd(picked) : null;
  const pickedBookings = pk ? byDay.get(pk) || [] : [];
  const pickedBlocked = pk ? blocked.has(pk) : false;

  async function toggle() {
    if (!pk) return;
    try {
      if (pickedBlocked) { await unblock(pk).unwrap(); toast.success('Date opened for bookings'); }
      else { await block({ date: pk }).unwrap(); toast.success('Date blocked'); }
    } catch (err) { toast.error(errText(err, 'Could not update')); }
  }

  return (
    <View style={styles.page}>
      {header}
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <View style={styles.monthBar}>
            <IconButton icon={<ChevronLeft size={18} color={ink[700]} />} accessibilityLabel="Previous month" disabled={isCurrentMonth} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
            <Text variant="body" weight="bold">{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</Text>
            <IconButton icon={<ChevronRight size={18} color={ink[700]} />} accessibilityLabel="Next month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
          </View>
          <View style={styles.grid}>
            {WEEK.map((d) => <View key={d} style={styles.cell}><Text variant="caption" weight="bold" color={ink[400]}>{d}</Text></View>)}
            {cells.map((d, i) => (d ? (
              <View key={ymd(d)} style={styles.cell}>
                <CalendarDay day={d} past={ymd(d) < today} today={ymd(d) === today} count={byDay.get(ymd(d))?.length || 0}
                  blocked={blocked.has(ymd(d))} selected={ymd(d) === pk} onPress={() => setPicked(d)} />
              </View>
            ) : <View key={`e${i}`} style={styles.cell} />))}
          </View>
          <View style={styles.legend}>
            <View style={styles.key}><View style={[styles.swatch, { backgroundColor: zappy[600] }]} /><Text variant="caption" color={ink[500]}>Booked</Text></View>
            <View style={styles.key}><View style={[styles.swatch, { backgroundColor: colors.border }]} /><Text variant="caption" color={ink[500]}>Blocked</Text></View>
            <View style={styles.key}><View style={[styles.swatch, styles.todayKey]} /><Text variant="caption" color={ink[500]}>Today</Text></View>
          </View>
        </View>

        <View style={styles.card}>
          {!picked ? <Text variant="bodySmall" color={ink[500]}>Pick a day to block it, open it again, or see what is booked.</Text> : (
            <>
              <Text variant="body" weight="bold">{longDate(picked)}</Text>
              {pickedBookings.length ? (
                <>
                  {pickedBookings.map((b) => <PartnerBookingRow key={b._id} booking={b} showNet={false} />)}
                  <Text variant="caption" color={ink[500]}>A day with a booking can't be blocked.</Text>
                </>
              ) : (
                <>
                  <Text variant="bodySmall" color={ink[700]}>{pickedBlocked ? 'Blocked: customers cannot book you on this day.' : 'Open: customers can book you on this day.'}</Text>
                  <Button label={pickedBlocked ? 'Open this day' : 'Block this day'} variant={pickedBlocked ? 'primary' : 'outline'}
                    icon={pickedBlocked ? <Unlock size={16} color="#fff" /> : <Lock size={16} color={zappy[600]} />} loading={blocking || unblocking} onPress={toggle} fullWidth />
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base, paddingBottom: spacing.xxl },
  card: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.base },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  todayKey: { borderWidth: 1.5, borderColor: zappy[600] },
});
