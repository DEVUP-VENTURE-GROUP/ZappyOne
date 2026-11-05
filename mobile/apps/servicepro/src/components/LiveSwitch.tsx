// The shop's Live switch, like a driver's: ON goes live from where the owner is now (location asked for), OFF takes no new orders.
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import * as Location from 'expo-location';
import { Radio } from 'lucide-react-native';
import { useSetShopLiveMutation, useShopMeQuery } from '@zappy/core/api';
import { Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { ink, slate, success } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function LiveSwitch() {
  const { data } = useShopMeQuery(undefined);
  const [setLive, { isLoading }] = useSetShopLiveMutation();
  const [locating, setLocating] = useState(false);
  const shop = (data as { shop?: { takingOrders?: boolean } } | undefined)?.shop;
  if (!shop) return null;
  const on = shop.takingOrders !== false;
  const busy = isLoading || locating;

  async function toggle() {
    try {
      if (on) { toast.success((await setLive({ on: false }).unwrap()).message); return; }
      setLocating(true);
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { toast.error('Allow your location to go live: orders come from where you are.'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      toast.success((await setLive({ on: true, lat: pos.coords.latitude, lng: pos.coords.longitude }).unwrap()).message);
    } catch (e) { toast.error(errText(e, on ? 'Could not switch off. Try again.' : 'Could not go live. Try again.')); } finally { setLocating(false); }
  }

  return (
    <View style={[styles.card, on ? styles.on : styles.off]}>
      <Radio size={22} color={on ? success[700] : ink[400]} />
      <View style={styles.flex}>
        <Text variant="body" weight="extrabold">{on ? 'You are live' : 'You are off'}</Text>
        <Text variant="caption" color={ink[700]}>{on ? 'New orders near you come to you, from where you are.' : 'Go live to get new orders.'}</Text>
      </View>
      <Pressable onPress={toggle} disabled={busy} accessibilityRole="switch" accessibilityState={{ checked: on, disabled: busy }} accessibilityLabel={on ? 'Go off' : 'Go live'}
        style={[styles.track, { backgroundColor: on ? success[600] : slate[300] }]} hitSlop={8}>
        <View style={[styles.knob, on ? styles.knobOn : styles.knobOff]}>{busy ? <ActivityIndicator size="small" color={ink[500]} /> : null}</View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1 },
  on: { borderColor: success[100], backgroundColor: success[50] },
  off: { borderColor: slate[200], backgroundColor: slate[50] },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  track: { width: 56, height: 32, borderRadius: 16, justifyContent: 'center' },
  knob: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  knobOn: { left: 28 },
  knobOff: { left: 4 },
});
