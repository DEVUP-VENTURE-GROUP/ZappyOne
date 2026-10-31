/**
 * Everything the customer has told us, on one card (the website's
 * ChosenSummary): the device with its photo, the fault, how, and where, with the
 * address one tap from being corrected without losing the rest of the flow.
 */
import { deviceName } from '@zappy/core/shared/deviceName';
import { problemPhoto } from '@zappy/core/shared/problemArt';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { MapPin, Smartphone, Wrench } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { BrandLogo } from '@zappy/ui/components/common/BrandLogo';
import type { BookingLocation } from '@zappy/ui/lib/bookingLocation';
import { webAsset } from '@zappy/ui/lib/media';
import { ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { Diagnosis } from './DiagnoseStep';
import { flow } from './FlowChrome';
import { MODE_LABEL } from './repairRules';

export function ChosenSummary({ vertical, brand, model, configuration, problem, diagnosis, serviceMode, location, onChangeLocation }: {
  vertical: string; brand?: { name: string; logoUrl?: string } | null; model?: { name: string; imageUrl?: string } | null; configuration?: { name: string } | null; problem?: { name: string; code?: string; imageUrl?: string } | null;
  diagnosis?: Diagnosis | null; serviceMode: string; location: BookingLocation | null; onChangeLocation: () => void;
}) {
  const device = deviceName(brand, model) || 'Your device';
  const fault = problem?.name || diagnosis?.recommendations?.[0]?.repairName || diagnosis?.summary;
  const photo = model?.imageUrl ? webAsset(model.imageUrl) : null;
  const faultPhoto = problem ? webAsset(problemPhoto(vertical, problem)) : null;
  return (
    <View style={flow.card}>
      <Text variant="caption" weight="bold" color={ink[400]} style={styles.label}>YOUR BOOKING</Text>
      <View style={styles.top}>
        <View style={styles.photo}>
          {photo ? <Image source={{ uri: photo }} style={styles.img} resizeMode="contain" />
            : brand?.logoUrl ? <BrandLogo name={brand.name} url={brand.logoUrl} height={22} />
              : <Smartphone size={26} color={ink[400]} />}
        </View>
        <View style={flow.flex}>
          <Text variant="body" weight="bold" numberOfLines={1}>{device}</Text>
          {configuration?.name ? <Text variant="bodySmall" color={ink[500]} numberOfLines={1}>{configuration.name}</Text> : null}
          <View style={styles.mode}><Text variant="caption" weight="semibold" color={zappy[700]}>{MODE_LABEL[serviceMode] || serviceMode}</Text></View>
        </View>
      </View>
      {fault ? (
        <View style={[styles.row, styles.line]}>
          <View style={[styles.icon, faultPhoto ? styles.thumb : null]}>{faultPhoto ? <Image source={{ uri: faultPhoto }} style={StyleSheet.absoluteFill} /> : <Wrench size={17} color={ink[700]} />}</View>
          <View style={flow.flex}>
            <Text variant="caption" color={ink[500]}>Problem</Text>
            <Text variant="body" weight="semibold">{fault}</Text>
          </View>
        </View>
      ) : null}
      <Pressable onPress={onChangeLocation} accessibilityRole="button" accessibilityLabel="Change address" style={[styles.row, styles.line]}>
        <View style={styles.icon}><MapPin size={17} color={ink[700]} /></View>
        <View style={flow.flex}>
          <Text variant="caption" color={ink[500]}>Address</Text>
          <Text variant="bodySmall" numberOfLines={2}>{location?.address || 'Your pinned location'}</Text>
        </View>
        <Text variant="bodySmall" weight="bold" color={zappy[700]}>Change</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { letterSpacing: 0.8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm, marginBottom: spacing.sm },
  photo: { width: 64, height: 64, borderRadius: 16, borderWidth: 1, borderColor: slate[200], backgroundColor: slate[50], alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  img: { width: 56, height: 56 },
  mode: { alignSelf: 'flex-start', marginTop: 6, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: zappy[50] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: slate[300] },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  thumb: { width: 44, height: 44, overflow: 'hidden' },
});
