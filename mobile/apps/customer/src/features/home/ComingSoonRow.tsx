import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, Check, ChevronDown } from 'lucide-react-native';
import { useNotifyLaunchMutation } from '@zappy/core/api';
import { useAppSelector } from '@zappy/core/store/hooks';
import { Text } from '@zappy/ui/components';
import { serviceIcon } from '@zappy/ui/components/home/serviceIcons';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { HomeDomain, HomeService } from './homeCatalog';

const FIRST = 8;

// Services nobody covers at this address yet: one quiet row, the rest by category on "See all"; each bell tells recruiting what this area wants.
export function ComingSoonRow({ groups, loc }: { groups: HomeDomain[]; loc: { lat?: number | null; lng?: number | null; primary?: string } }) {
  const router = useRouter();
  const isAuthed = useAppSelector((s) => s.auth.isAuthenticated && s.auth.role === 'user');
  const [notify] = useNotifyLaunchMutation();
  const [asked, setAsked] = useState<Set<string>>(() => new Set());
  const [all, setAll] = useState(false);
  if (!groups.length || loc.lat == null || loc.lng == null) return null;
  const flat = groups.flatMap((g) => g.services);

  async function ask(s: HomeService) {
    if (!isAuthed) { router.push('/login' as never); return; }
    try {
      await notify({ lat: loc.lat as number, lng: loc.lng as number, address: loc.primary || '', lineCode: s.code }).unwrap();
      setAsked((prev) => new Set(prev).add(s.code));
      toast.success(`We will tell you when ${s.name.toLowerCase()} opens near you`);
    } catch (err) { toast.error(errText(err, 'Could not save that. Try again.')); }
  }

  const card = (s: HomeService) => {
    const Icon = serviceIcon(s.icon);
    const done = asked.has(s.code);
    return (
      <View key={s.code} style={styles.card}>
        <View style={styles.icon}><Icon size={22} strokeWidth={1.6} color={ink[500]} /></View>
        <Text variant="caption" weight="semibold" color={ink[700]} numberOfLines={2} style={styles.name}>{s.name}</Text>
        <Pressable onPress={() => !done && ask(s)} disabled={done} accessibilityRole="button"
          accessibilityLabel={done ? `${s.name}: we will tell you` : `Notify me when ${s.name} opens here`}
          style={[styles.bell, done && styles.bellDone]}>
          {done ? <Check size={11} color={ink[500]} /> : <Bell size={11} color={zappy[700]} />}
          <Text variant="caption" weight="bold" color={done ? ink[500] : zappy[700]} style={styles.bellText}>{done ? 'Noted' : 'Notify me'}</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text variant="body" weight="bold">Coming to your area</Text>
          <Text variant="caption" color={ink[500]}>Not here yet. Tap the bell and we will tell you the day it opens.</Text>
        </View>
        {flat.length > FIRST ? (
          <Pressable onPress={() => setAll((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: all }} style={styles.more} hitSlop={6}>
            <Text variant="caption" weight="bold" color={zappy[700]}>{all ? 'Less' : `See all ${flat.length}`}</Text>
            <ChevronDown size={14} color={zappy[700]} style={all ? styles.up : undefined} />
          </Pressable>
        ) : null}
      </View>
      {all ? groups.map((g) => (
        <View key={g.code} style={styles.group}>
          <Text variant="caption" weight="bold" color={ink[400]} style={styles.groupName}>{g.name.toUpperCase()}</Text>
          <View style={styles.wrap}>{g.services.map(card)}</View>
        </View>
      )) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>{flat.slice(0, FIRST).map(card)}</ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  up: { transform: [{ rotate: '180deg' }] },
  group: { gap: spacing.sm },
  groupName: { letterSpacing: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  row: { paddingRight: spacing.sm },
  card: { width: 96, alignItems: 'center', gap: 6 },
  icon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  name: { minHeight: 32, textAlign: 'center' },
  bell: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: zappy[50] },
  bellDone: { backgroundColor: slate[100] },
  bellText: { fontSize: 11 },
});
