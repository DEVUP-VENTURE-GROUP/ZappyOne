import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Clock3 } from 'lucide-react-native';
import { opensLabel, to12Hour } from '@zappy/core/shared/weeklyHoursRules';
import { LiveDot, Text } from '@zappy/ui/components';
import { MyAreaChip } from '@zappy/ui/components/worker/MyAreaChip';
import { colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const time = (hhmm: string) => { const t = to12Hour(hhmm); return t.hour ? `${t.hour}:${t.minute} ${t.meridiem}` : ''; };

// A striped shop awning with a scalloped edge (the website's ShopHeader); it rolls down when the shop goes live.
function Awning({ live }: { live: boolean }) {
  const drop = useRef(new Animated.Value(0)).current;
  useEffect(() => { drop.setValue(0); Animated.spring(drop, { toValue: 1, useNativeDriver: true, stiffness: 260, damping: 18 }).start(); }, [live, drop]);
  const a = live ? zappy[600] : slate[400]; const b = live ? zappy[100] : slate[200];
  return (
    <Animated.View style={{ transform: [{ translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }] }}>
      <Svg width="100%" height={18}>
        <Defs>
          <Pattern id="aw" width={32} height={18} patternUnits="userSpaceOnUse">
            <Path d="M0 0h16v10a8 8 0 0 1-16 0z" fill={a} />
            <Path d="M16 0h16v10a8 8 0 0 1-16 0z" fill={b} />
          </Pattern>
        </Defs>
        <Rect width="100%" height={18} fill="url(#aw)" />
      </Svg>
    </Animated.View>
  );
}

interface Shop { businessName?: string; coverImageUrl?: string; address?: { location?: { coordinates?: number[] } }; todayHours?: { closesAt: string } | null; opensNext?: unknown }

export function ShopHeader({ shop, trade, live, isOpen, blocker }: { shop?: Shop; trade?: string; live: boolean; isOpen: boolean | null; blocker?: string | null }) {
  const router = useRouter();
  const [broken, setBroken] = useState(false);
  const coords = shop?.address?.location?.coordinates;
  const hours = isOpen === false ? opensLabel(shop?.opensNext) || 'Closed today' : shop?.todayHours ? `Open till ${time(shop.todayHours.closesAt)}` : null;
  const status = live ? ['Live', 'Customers can book you'] : isOpen === false ? ['Closed', hours || 'Outside your hours'] : ['Not live', blocker || 'Finish setup to go live'];
  return (
    <View style={styles.card}>
      <View style={styles.clip}><Awning live={live} /></View>
      <View style={styles.body}>
        <View style={styles.row}>
          {shop?.coverImageUrl && !broken
            ? <Image source={{ uri: shop.coverImageUrl }} onError={() => setBroken(true)} style={styles.photo} />
            : <View style={[styles.photo, styles.initial]}><Text variant="heading3" weight="black" color="#fff">{(shop?.businessName || '?').trim().charAt(0).toUpperCase()}</Text></View>}
          <View style={styles.flex}>
            <Text variant="caption" weight="black" color={ink[400]} numberOfLines={1}>{(trade || 'Shop partner').toUpperCase()}</Text>
            <Text variant="heading3" weight="black" numberOfLines={1}>{shop?.businessName}</Text>
          </View>
        </View>
        <View style={styles.chips}>
          {coords?.length === 2 ? <MyAreaChip coordinates={coords} live={live} /> : null}
          {hours ? (
            <Pressable onPress={() => router.push('/shop/profile' as never)} accessibilityRole="button" style={styles.hours}>
              <Clock3 size={12} color={ink[400]} /><Text variant="caption" weight="semibold" color={ink[700]}>{hours}</Text>
            </Pressable>
          ) : null}
        </View>
        <View accessibilityRole="text" style={[styles.status, live ? styles.statusOn : null]}>
          <LiveDot live={live} color={success[500]} offColor={slate[300]} size={10} />
          <View style={styles.flex}>
            <Text variant="bodySmall" weight="black" color={live ? success[700] : ink[700]}>{status[0]}</Text>
            <Text variant="caption" color={ink[500]} numberOfLines={1}>{status[1]}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  clip: { height: 18, overflow: 'hidden' },
  body: { gap: spacing.sm, padding: spacing.base, paddingTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  photo: { width: 52, height: 52, borderRadius: 16, backgroundColor: slate[100] },
  initial: { alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[600] },
  flex: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  hours: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderRadius: radius.medium, backgroundColor: slate[50] },
  statusOn: { backgroundColor: success[50] },
});
