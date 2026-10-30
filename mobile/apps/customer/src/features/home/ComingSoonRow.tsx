import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, Check } from 'lucide-react-native';
import { useNotifyLaunchMutation } from '@zappy/core/api';
import { servicePhoto, tilePhoto } from '@zappy/core/shared/serviceArt';
import { useAppSelector } from '@zappy/core/store/hooks';
import { Text } from '@zappy/ui/components';
import { serviceIcon } from '@zappy/ui/components/home/serviceIcons';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { webAsset } from '@zappy/ui/lib/media';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { HomeDomain, HomeService } from './homeCatalog';

// Services nobody covers at this address yet, one row per category; each "Notify me" tells recruiting what this area wants.
export function ComingSoonRow({ groups, loc }: { groups: HomeDomain[]; loc: { lat?: number | null; lng?: number | null; primary?: string } }) {
  const router = useRouter();
  const isAuthed = useAppSelector((s) => s.auth.isAuthenticated && s.auth.role === 'user');
  const [notify] = useNotifyLaunchMutation();
  const [asked, setAsked] = useState<Set<string>>(() => new Set());
  if (!groups.length || loc.lat == null || loc.lng == null) return null;

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
      {groups.map((g) => (
        <View key={g.code} style={styles.group}>
          <Text variant="caption" weight="bold" color={ink[500]} style={styles.groupName}>{g.name.toUpperCase()}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {g.services.map((s) => {
              const Icon = serviceIcon(s.icon);
              const photo = webAsset(tilePhoto(s.code) || servicePhoto(s));
              const done = asked.has(s.code);
              return (
                <View key={s.code} style={styles.card}>
                  <View style={styles.media}>
                    {photo ? <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" /> : <Icon size={28} strokeWidth={1.5} color={zappy[600]} />}
                    <View style={styles.soon}><Text variant="caption" weight="bold" color={ink[700]} style={styles.soonText}>SOON</Text></View>
                  </View>
                  <Text variant="bodySmall" weight="semibold" numberOfLines={2} style={styles.name}>{s.name}</Text>
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
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.base },
  group: { gap: spacing.sm },
  groupName: { letterSpacing: 1 },
  row: { gap: spacing.md, paddingRight: spacing.base },
  card: { width: 132, gap: 6 },
  media: { width: 132, aspectRatio: 4 / 3, borderRadius: radius.large, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: zappy[50] },
  photo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.85 },
  soon: { position: 'absolute', top: 6, left: 6, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: 'rgba(255,255,255,0.95)' },
  soonText: { fontSize: 10, letterSpacing: 0.5 },
  name: { minHeight: 36 },
  bell: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 7, borderRadius: radius.button, backgroundColor: zappy[50] },
  bellDone: { backgroundColor: slate[100] },
});
