import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, Check } from 'lucide-react-native';
import { useNotifyLaunchMutation } from '@zappy/core/api';
import { useAppSelector } from '@zappy/core/store/hooks';
import { Text } from '@zappy/ui/components';
import { serviceIcon } from '@zappy/ui/components/home/serviceIcons';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { HomeService } from './homeCatalog';

// Services nobody covers at this address yet: kept off the grid, listed small at the end, and each "Notify me" tells recruiting what this area wants.
export function ComingSoonRow({ services, loc }: { services: HomeService[]; loc: { lat?: number | null; lng?: number | null; primary?: string } }) {
  const router = useRouter();
  const isAuthed = useAppSelector((s) => s.auth.isAuthenticated && s.auth.role === 'user');
  const [notify] = useNotifyLaunchMutation();
  const [asked, setAsked] = useState<Set<string>>(() => new Set());
  if (!services.length || loc.lat == null || loc.lng == null) return null;

  async function ask(s: HomeService) {
    if (!isAuthed) { router.push('/login' as never); return; }
    try {
      await notify({ lat: loc.lat as number, lng: loc.lng as number, address: loc.primary || '', lineCode: s.code }).unwrap();
      setAsked((prev) => new Set(prev).add(s.code));
      toast.success(`We will tell you when ${s.name.toLowerCase()} opens near you`);
    } catch (err) { toast.error(errText(err, 'Could not save that. Try again.')); }
  }

  return (
    <View style={styles.wrap}>
      <View>
        <Text variant="heading3" weight="bold">Coming to your area</Text>
        <Text variant="caption" color={ink[500]}>Not bookable at this address yet. Tap the bell and we will tell you the day it opens.</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {services.map((s) => {
          const Icon = serviceIcon(s.icon);
          const done = asked.has(s.code);
          return (
            <View key={s.code} style={styles.card}>
              <View style={styles.icon}><Icon size={18} strokeWidth={1.7} color={ink[500]} /></View>
              <Text variant="bodySmall" weight="semibold" color={ink[700]} numberOfLines={2} style={styles.name}>{s.name}</Text>
              <Pressable onPress={() => !done && ask(s)} disabled={done} accessibilityRole="button"
                accessibilityLabel={done ? `${s.name}: we will tell you` : `Notify me when ${s.name} opens here`}
                style={[styles.bell, done && styles.bellDone]}>
                {done ? <Check size={13} color={ink[500]} /> : <Bell size={13} color={zappy[700]} />}
                <Text variant="caption" weight="bold" color={done ? ink[500] : zappy[700]}>{done ? 'We will tell you' : 'Notify me'}</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  row: { gap: spacing.sm, paddingRight: spacing.base },
  card: { width: 148, gap: spacing.sm, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  icon: { width: 36, height: 36, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  name: { minHeight: 36 },
  bell: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 7, borderRadius: radius.button, backgroundColor: zappy[50] },
  bellDone: { backgroundColor: slate[100] },
});
