/**
 * Shown instead of Home when ZappyOne cannot serve the chosen point (the
 * website's NotInYourArea): nothing bookable, only ways forward: another
 * address, where we serve today, or being told the day we start here.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BellRing, Check, MapPin, MapPinOff } from 'lucide-react-native';
import { useNotifyLaunchMutation } from '@zappy/core/api';
import { useAppSelector } from '@zappy/core/store/hooks';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { ink, slate, success } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';

export function NotInYourArea({ place, lat, lng, address, areas = [], onChangeLocation }: {
  place?: string; lat?: number; lng?: number; address?: string; areas?: { name: string; city?: string }[]; onChangeLocation: () => void;
}) {
  const router = useRouter();
  const signedIn = useAppSelector((s) => s.auth.isAuthenticated && s.auth.role === 'user');
  const [notifyLaunch, { isLoading }] = useNotifyLaunchMutation();
  const [notified, setNotified] = useState(false);

  async function notify() {
    if (!signedIn) { router.push('/(auth)/login' as never); return; }
    try { await notifyLaunch({ lat, lng, address: address || place || '' }).unwrap(); setNotified(true); toast.success("We'll let you know as soon as we launch here"); }
    catch (err) { toast.error(errText(err, 'Could not save your request. Try again.')); }
  }

  return (
    <View style={styles.wrap}>
      <MapPinOff size={32} color={slate[400]} strokeWidth={1.6} />
      <Text variant="heading2" weight="bold">We don’t serve {place || 'this area'} yet</Text>
      <Text variant="body" color={ink[700]}>Try another address, or ask us to tell you the day we start here.</Text>
      <Button label="Change address" icon={<MapPin size={16} color="#fff" />} onPress={onChangeLocation} fullWidth size="large" />
      <Button label={notified ? 'We’ll let you know' : 'Tell me when you’re here'} variant="outline" loading={isLoading} disabled={notified}
        icon={notified ? <Check size={16} color={success[600]} /> : <BellRing size={16} color={ink[700]} />} onPress={notify} fullWidth size="large" />
      {areas.length ? (
        <View style={styles.areas}>
          <Text variant="bodySmall" weight="semibold">Where we serve today</Text>
          <Text variant="bodySmall" color={ink[700]}>{areas.map((a) => `${a.name}${a.city ? `, ${a.city}` : ''}`).join(', ')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, paddingVertical: spacing.lg },
  areas: { gap: 4, marginTop: spacing.xl },
});
