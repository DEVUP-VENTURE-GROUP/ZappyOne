/**
 * When bookings for later can be matched to the provider (the websites' WorkerHoursPage):
 * weekly hours, days off, and whether to take later bookings while offline.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarOff, Minus, Plus } from 'lucide-react-native';
import { useWorkerHoursQuery, useSaveWorkerHoursMutation } from '@zappy/core/api';
import { Button, LoadingState, ScreenHeader, Text } from '../../components';
import { toast } from '../../components/Toast';
import { errText } from '../../lib/feedback';
import { colors, zappy, ink, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DEFAULT_WEEK = DAYS.map((_, day) => ({ day, on: day !== 0, from: '09:00', to: '19:00' }));

/** Today in India, as YYYY-MM-DD. */
const istKey = (offsetDays = 0) => new Date(Date.now() + 330 * 60000 + offsetDays * 86400000).toISOString().slice(0, 10);

const step = (hhmm: string, by: number) => {
  const [h, m] = hhmm.split(':').map(Number);
  const mins = Math.min(23 * 60 + 30, Math.max(0, h * 60 + m + by));
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
};

const ampm = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

function TimeStepper({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <View style={styles.stepper} accessibilityLabel={`${label} ${ampm(value)}`}>
      <Pressable onPress={() => onChange(step(value, -30))} hitSlop={6} accessibilityLabel={`${label} earlier`} style={styles.stepBtn}><Minus size={14} color={ink[700]} /></Pressable>
      <Text variant="bodySmall" weight="semibold" style={styles.stepText}>{ampm(value)}</Text>
      <Pressable onPress={() => onChange(step(value, 30))} hitSlop={6} accessibilityLabel={`${label} later`} style={styles.stepBtn}><Plus size={14} color={ink[700]} /></Pressable>
    </View>
  );
}

export function WorkerHoursPage() {
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useWorkerHoursQuery();
  const [save, { isLoading: saving }] = useSaveWorkerHoursMutation();
  const [week, setWeek] = useState(DEFAULT_WEEK);
  const [daysOff, setDaysOff] = useState<string[]>([]);
  const [acceptLater, setAcceptLater] = useState(true);

  useEffect(() => {
    const h = data?.hours;
    if (h?.week?.length) { setWeek(h.week); setDaysOff(h.daysOff || []); setAcceptLater(h.acceptLater !== false); }
  }, [data]);

  const setDay = (day: number, patch: object) => setWeek((w) => w.map((d) => (d.day === day ? { ...d, ...patch } : d)));
  const toggleOff = (k: string) => setDaysOff((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k].sort()));
  const next60 = Array.from({ length: 60 }, (_, i) => istKey(i));

  async function submit() {
    try { const r = await save({ week, daysOff, acceptLater }).unwrap(); toast.success(r.message); }
    catch (err) { toast.error(errText(err, 'Could not save your hours')); }
  }

  return (
    <View style={styles.page}>
      <ScreenHeader title="My hours" safeArea />
      {isLoading ? <LoadingState /> : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.info}><Text variant="caption" color={zappy[800]}>
            Customers who book for later are matched to you only inside these hours, even when you are offline, and never on your days off. Jobs for right now still need you online.
          </Text></View>
          <View style={styles.card}>
            {week.map((d) => (
              <View key={d.day} style={styles.dayRow}>
                <Switch value={d.on} onValueChange={(on) => setDay(d.day, { on })} accessibilityLabel={`${DAYS[d.day]} working`} />
                <Text variant="bodySmall" weight="semibold" color={d.on ? ink[900] : ink[400]} style={styles.dayName}>{DAYS[d.day]}</Text>
                {d.on ? (
                  <View style={styles.times}>
                    <TimeStepper value={d.from} onChange={(from) => setDay(d.day, { from })} label={`${DAYS[d.day]} from`} />
                    <TimeStepper value={d.to} onChange={(to) => setDay(d.day, { to })} label={`${DAYS[d.day]} to`} />
                  </View>
                ) : <Text variant="caption" color={ink[400]}>Not working</Text>}
              </View>
            ))}
          </View>
          <View style={styles.card}>
            <View style={styles.row}><CalendarOff size={15} color={ink[900]} /><Text variant="bodySmall" weight="bold">Days off</Text></View>
            <Text variant="caption" color={ink[500]}>Tap the days you won't work.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dates}>
              {next60.map((k) => {
                const on = daysOff.includes(k);
                const d = new Date(`${k}T00:00:00`);
                return (
                  <Pressable key={k} onPress={() => toggleOff(k)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                    accessibilityLabel={d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} style={[styles.date, on && styles.dateOn]}>
                    <Text variant="caption" color={on ? '#fff' : ink[500]}>{d.toLocaleDateString('en-IN', { weekday: 'short' })}</Text>
                    <Text variant="body" weight="bold" color={on ? '#fff' : ink[900]}>{d.getDate()}</Text>
                    <Text variant="caption" color={on ? '#fff' : ink[500]}>{d.toLocaleDateString('en-IN', { month: 'short' })}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <View style={[styles.card, styles.row]}>
            <View style={styles.flex}>
              <Text variant="bodySmall" weight="semibold">Take bookings for later while I am offline</Text>
              <Text variant="caption" color={ink[500]}>We send you a notification for each one inside your hours.</Text>
            </View>
            <Switch value={acceptLater} onValueChange={setAcceptLater} accessibilityLabel="Take bookings for later while offline" />
          </View>
        </ScrollView>
      )}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Save my hours" onPress={submit} loading={saving} disabled={isLoading} fullWidth size="large" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  body: { padding: spacing.base, gap: spacing.md, paddingBottom: 120 },
  card: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.sm },
  info: { backgroundColor: zappy[50], borderRadius: radius.medium, padding: spacing.md },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: slate[100], flexWrap: 'wrap' },
  dayName: { width: 86 },
  times: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.button },
  stepBtn: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center' },
  stepText: { minWidth: 62, textAlign: 'center' },
  dates: { gap: 6, paddingVertical: 4 },
  date: { width: 54, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingVertical: 6 },
  dateOn: { backgroundColor: ink[900], borderColor: ink[900] },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.base, paddingTop: spacing.md },
});
