// The wait at the door, counting on the screen (the websites' WaitingMeter): free time left, then what it adds. Ticks locally; no server calls.
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Timer } from 'lucide-react-native';
import { mmss, waitingNow } from '@zappy/core/shared/repairBill';
import { Text } from '../Text';
import { zappy, accent } from '../../theme/colors';

const rupees = (p: number) => `₹${(p / 100).toFixed(p % 100 ? 2 : 0)}`;

export function WaitingMeter({ booking, audience = 'pro', pro = 'pro' }: { booking: unknown; audience?: 'pro' | 'customer'; pro?: string }) {
  const [now, setNow] = useState(Date.now());
  const w = waitingNow(booking, now);
  const live = !!w && !w.stopped;
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);
  if (!w || (audience === 'customer' && w.stopped && !w.paise)) return null;

  const rate = `${rupees(w.rule.perMinPaise)} a minute${w.rule.maxPaise > 0 ? `, at most ${rupees(w.rule.maxPaise)}` : ''}`;
  const free = w.freeLeftSec > 0 && !w.stopped;
  const text = audience === 'pro'
    ? (w.stopped ? ['Waiting ended at the code', w.paise ? `${rupees(w.paise)} added for you.` : 'No waiting charge.']
      : free ? [`Free waiting: ${mmss(w.freeLeftSec)} left`, `Then ${rate} is added for you.`]
        : [`Customer is late: ${w.billableMin} min`, `${rupees(w.paise)} added for you so far${w.capped ? ' (the most)' : ''}.`])
    : (w.stopped ? ['Waiting charge', `${rupees(w.paise)} for the extra minutes your ${pro} waited.`]
      : free ? [`Your ${pro} is at your door`, `Free waiting: ${mmss(w.freeLeftSec)} left, then ${rate}.`]
        : [`Your ${pro} has waited ${w.billableMin} extra min`, `${rupees(w.paise)} added to your bill${w.capped ? ' (the most)' : ''}. Give them your code to start.`]);
  const late = !free && w.paise > 0;

  return (
    <View accessibilityRole="text" accessibilityLiveRegion="polite" style={[styles.box, late ? styles.late : styles.calm]}>
      <Timer size={18} color={late ? accent[700] : zappy[700]} />
      <View style={styles.flex}>
        <Text variant="body" weight="bold" color={late ? accent[700] : zappy[800]}>{text[0]}</Text>
        <Text variant="caption" color={late ? accent[700] : zappy[700]}>{text[1]}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  calm: { backgroundColor: zappy[50], borderColor: zappy[100] },
  late: { backgroundColor: accent[50], borderColor: accent[100] },
  flex: { flex: 1 },
});
