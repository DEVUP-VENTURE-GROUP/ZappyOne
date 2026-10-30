/** The marketplace on the home (the website's HomeMarketplace): pick your own pro for any live service, and monthly plans near you; each part hides itself when empty. */
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Store } from 'lucide-react-native';
import { useRepairVerticalsQuery } from '@zappy/core/api';
import { Appear, Text } from '@zappy/ui/components';
import { serviceIcon } from '@zappy/ui/components/home/serviceIcons';
import { colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { PlansNear } from '../plans/PlansNear';

interface Service { vertical: string; name: string; icon?: string; status?: string }

export function HomeMarketplace({ loc }: { loc: { lat: number; lng: number; address?: string } | null }) {
  const router = useRouter();
  const { data } = useRepairVerticalsQuery(undefined);
  const services = ((data?.items || []) as Service[]).filter((s) => s.status === 'live').slice(0, 12);
  return (
    <View style={styles.wrap}>
      {services.length ? (
        <View style={styles.section}>
          <View style={styles.head}><Store size={18} color={zappy[600]} /><Text variant="heading3" weight="black">Pick your own pro</Text></View>
          <Text variant="caption" color={ink[500]}>See ratings, prices and how soon they can come, then book the one you like.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {services.map((s, i) => {
              const Icon = serviceIcon(s.icon);
              return (
                <Appear key={s.vertical} delay={Math.min(i, 8) * 40}>
                  <Pressable onPress={() => router.push(`/providers/${s.vertical.replace(/_/g, '-')}` as never)} accessibilityRole="button" accessibilityLabel={`${s.name}, see pros`} style={styles.card}>
                    <View style={styles.icon}><Icon size={19} color={zappy[600]} /></View>
                    <Text variant="bodySmall" weight="bold" numberOfLines={2}>{s.name}</Text>
                    <View style={styles.more}><Text variant="caption" weight="bold" color={zappy[600]}>See pros</Text><ChevronRight size={13} color={zappy[600]} /></View>
                  </Pressable>
                </Appear>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
      <PlansNear loc={loc} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  section: { gap: spacing.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rail: { gap: spacing.sm, paddingVertical: spacing.xs, paddingRight: spacing.base },
  card: { width: 150, minHeight: 128, gap: spacing.sm, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  more: { marginTop: 'auto', flexDirection: 'row', alignItems: 'center', gap: 2 },
});
