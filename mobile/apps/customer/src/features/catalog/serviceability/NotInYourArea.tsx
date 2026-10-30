import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BellRing, Check, MapPin, MapPinOff } from 'lucide-react-native';
import { useNotifyLaunchMutation } from '@zappy/core/api';
import { useAppSelector } from '@zappy/core/store/hooks';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

// Nothing bookable here (the website's NotInYourArea): say so, offer another address or a launch alert, and show where we are live.
export function NotInYourArea({ place, lat, lng, address, areas = [], onChangeLocation, soon = false }: {
  place?: string; lat?: number; lng?: number; address?: string; areas?: { name: string; city?: string }[]; onChangeLocation: () => void; soon?: boolean;
}) {
  const router = useRouter();
  const signedIn = useAppSelector((s) => s.auth.isAuthenticated && s.auth.role === 'user');
  const [notifyLaunch, { isLoading }] = useNotifyLaunchMutation();
  const [notified, setNotified] = useState(false);
  const cities = [...areas.reduce((m, a) => m.set(a.city || 'Our areas', [...(m.get(a.city || 'Our areas') || []), a.name]), new Map<string, string[]>())];

  async function notify() {
    if (!signedIn) { router.push('/(auth)/login' as never); return; }
    try { await notifyLaunch({ lat, lng, address: address || place || '' }).unwrap(); setNotified(true); toast.success('We will tell you the day we start here'); }
    catch (err) { toast.error(errText(err, 'Could not save your request. Try again.')); }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.mark}><MapPinOff size={40} color={zappy[600]} strokeWidth={1.6} /></View>
      <Text variant="heading2" weight="extrabold" style={styles.center}>{soon ? `Pros are joining near ${place || 'you'}` : 'Not available in your area yet'}</Text>
      <Text variant="body" color={ink[500]} style={styles.center}>
        {soon ? 'Nobody is verified at this address yet. We are adding pros every week.' : `We are launching new areas fast and will be in ${place || 'yours'} soon.`}
      </Text>
      <View style={styles.actions}>
        <Button label={notified ? 'We will tell you' : 'Notify me when live'} loading={isLoading} disabled={notified}
          icon={notified ? <Check size={16} color="#fff" /> : <BellRing size={16} color="#fff" />} onPress={notify} fullWidth size="large" />
        <Button label="Change address" variant="outline" icon={<MapPin size={16} color={ink[700]} />} onPress={onChangeLocation} fullWidth size="large" />
      </View>
      {cities.length ? (
        <View style={styles.live}>
          <Text variant="heading3" weight="extrabold">We are live in</Text>
          {cities.map(([city, names]) => (
            <View key={city} style={styles.city}>
              <Text variant="body" weight="bold">{city}</Text>
              <Text variant="caption" color={ink[500]}>Serving {names.length} {names.length === 1 ? 'area' : 'areas'}</Text>
              <View style={styles.chips}>
                {names.map((n) => <View key={n} style={styles.chip}><Text variant="bodySmall">{n}</Text></View>)}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, paddingTop: spacing.base, paddingBottom: spacing.lg },
  mark: { width: 96, height: 96, borderRadius: 48, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50], marginBottom: spacing.sm },
  center: { textAlign: 'center' },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  live: { gap: spacing.md, marginTop: spacing.xl },
  city: { gap: 2, padding: spacing.base, borderRadius: radius.large, backgroundColor: slate[100] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: slate[200], backgroundColor: colors.surface },
});
