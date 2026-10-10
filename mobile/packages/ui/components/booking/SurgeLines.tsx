/**
 * What is added to a price right now (the websites' SurgeLines, server
 * jobs/surge): surge, rain, late-night fees, each in plain words; tap a line
 * for why. The amounts are held for a few minutes, and the booking pays exactly
 * these. useSurge fetches the quote for a price screen; pass its bookingFields
 * with the booking.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CalendarDays, Clock, CloudRain, Flame, Info, Moon, type LucideIcon } from 'lucide-react-native';
import { useSurgeQuoteQuery } from '@zappy/core/api';
import { formatPaise } from '@zappy/core/shared/money';
import { Text } from '..';
import { ink, slate } from '../../theme/colors';
import { spacing } from '../../theme/spacing';

const ICON: Record<string, LucideIcon> = { surge: Flame, busy: Flame, peak: Clock, weekend: CalendarDays, rain: CloudRain, night: Moon };
const TONE: Record<string, string> = { surge: '#EA580C', busy: '#EA580C', peak: '#D97706', weekend: '#7C3AED', rain: '#0284C7', night: '#4F46E5' };

export interface SurgeQuote { quoteId?: string; totalPaise?: number; expiresAt?: string; lines?: { type: string; label: string; paise: number; reason?: string }[] }

export function useSurge({ kind, line, vertical, serviceMode, loc, basePaise, skip = false }: {
  kind: string; line?: string; vertical?: string; serviceMode?: string; loc?: { lat?: number; lng?: number } | null; basePaise?: number | null; skip?: boolean;
}) {
  const ok = !skip && !!kind && typeof loc?.lat === 'number' && basePaise != null;
  const { data, refetch, isFetching } = useSurgeQuoteQuery(
    { kind, line, vertical, serviceMode, lat: loc?.lat, lng: loc?.lng, basePaise: Math.round(basePaise || 0) },
    { skip: !ok },
  );
  // The hold runs out: fetch a fresh quote rather than book on a stale price.
  useEffect(() => {
    if (!data?.expiresAt) return undefined;
    const ms = new Date(data.expiresAt).getTime() - Date.now() - 15000;
    const t = setTimeout(() => refetch(), Math.max(5000, ms));
    return () => clearTimeout(t);
  }, [data?.expiresAt, refetch]);
  const quote: SurgeQuote | null = ok ? data : null;
  return {
    quote,
    totalPaise: quote?.totalPaise || 0,
    bookingFields: quote?.quoteId ? { surgeQuoteId: quote.quoteId, surgeBasePaise: Math.round(basePaise || 0) } : {},
    refetch,
    isFetching,
  };
}

/** A booking refused because the price moved: true when handled (the quote is refreshed). */
export function surgeChanged(err: unknown, refetch?: () => unknown): boolean {
  if ((err as { data?: { code?: string } })?.data?.code !== 'SURGE_CHANGED') return false;
  refetch?.();
  return true;
}

export function SurgeLines({ quote }: { quote?: SurgeQuote | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!quote?.expiresAt) return undefined;
    const tick = () => setLeft(Math.max(0, Math.round((new Date(quote.expiresAt!).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [quote?.expiresAt]);
  if (!quote?.lines?.length) return null;
  return (
    <View style={styles.wrap}>
      {quote.lines.map((l) => {
        const Icon = ICON[l.type] || Flame;
        const tone = TONE[l.type] || TONE.surge;
        return (
          <View key={l.type}>
            <Pressable onPress={() => setOpen(open === l.type ? null : l.type)} accessibilityRole="button" accessibilityHint="Shows why" style={styles.line}>
              <View style={styles.inline}><Icon size={13} color={tone} /><Text variant="caption" weight="semibold" color={tone}>{l.label}</Text><Info size={11} color={slate[300]} /></View>
              <Text variant="caption" weight="bold">+{formatPaise(l.paise)}</Text>
            </Pressable>
            {open === l.type && l.reason ? <Text variant="caption" color={ink[500]} style={styles.reason}>{l.reason}</Text> : null}
          </View>
        );
      })}
      {left != null && left > 0 ? <Text variant="caption" color={ink[400]}>Price held for {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  reason: { paddingLeft: 18 },
});
