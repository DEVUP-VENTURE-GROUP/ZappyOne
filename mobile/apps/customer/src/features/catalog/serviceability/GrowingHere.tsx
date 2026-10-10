/**
 * Shown at the booking step when nobody verified covers the address yet (the
 * website's GrowingHere). The strongest demand signal there is, so it is
 * recorded the moment it shows. No booking is made; they can ask to be told
 * the day it opens, or try another address.
 */
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BellRing, Check, MapPin } from 'lucide-react-native';
import { useNotifyLaunchMutation } from '@zappy/core/api';
import { trackSearch } from '@zappy/core/lib/telemetry';
import { artFor } from '@zappy/core/shared/serviceArt';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { webAsset } from '@zappy/ui/lib/media';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function GrowingHere({ service, lat, lng, address = '', onChangeLocation }: {
  service: { code: string; name?: string; domainCode?: string }; lat?: number; lng?: number; address?: string; onChangeLocation?: () => void;
}) {
  const router = useRouter();
  const [notifyLaunch, { isLoading }] = useNotifyLaunchMutation();
  const [notified, setNotified] = useState(false);
  const art = webAsset(artFor(service?.code, service?.domainCode)?.still);

  useEffect(() => {
    if (lat == null || !service?.code) return;
    trackSearch({ category: service.code, query: 'booking_step', lat, lng, result: 'no_service', userType: 'user' });
  }, [service?.code, lat, lng]);

  async function notify() {
    try { await notifyLaunch({ lat, lng, address }).unwrap(); setNotified(true); toast.success('We’ll tell you the day it opens here'); }
    catch (err) { toast.error(errText(err, 'Could not save your request. Try again.')); }
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        {art ? <Image source={{ uri: art }} style={styles.art} resizeMode="contain" /> : null}
        <View style={styles.flex}>
          <Text variant="caption" weight="semibold" color={ink[500]}>Not available here yet</Text>
          <Text variant="body" weight="bold">No verified {service?.name ? service.name.toLowerCase() : 'pro'} near this address</Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text variant="bodySmall" color={ink[700]}>ZappyOne is opening across Telangana area by area, and we are verifying pros near you now. Tap Notify me and we’ll message you the day you can book here. Nothing is charged.</Text>
        <Button label={notified ? 'We’ll let you know' : 'Notify me'} onPress={notify} loading={isLoading} disabled={notified}
          icon={notified ? <Check size={16} color="#fff" /> : <BellRing size={16} color="#fff" />} fullWidth />
        {onChangeLocation ? <Button label="Try another address" variant="outline" icon={<MapPin size={16} color={ink[700]} />} onPress={onChangeLocation} fullWidth /> : null}
        <Pressable onPress={() => router.replace('/' as never)} style={styles.link}><Text variant="bodySmall" weight="semibold" color={zappy[600]}>See what’s available near you</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { overflow: 'hidden', borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, paddingHorizontal: spacing.lg, paddingVertical: spacing.base, borderBottomWidth: 1, borderBottomColor: colors.border },
  art: { width: 64, height: 64, borderRadius: 32, backgroundColor: slate[100] },
  body: { gap: spacing.md, padding: spacing.lg },
  link: { alignItems: 'center', paddingVertical: spacing.sm },
});
