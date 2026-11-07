import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Heart, ShieldCheck } from 'lucide-react-native';
import { useGetPoliciesQuery } from '@zappy/core/api';
import { Text } from '@zappy/ui/components';
import { fontFamily } from '@zappy/ui/theme/typography';
import { slate } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';

const HEART = '#F0566B';

type Area = { name?: string; city?: string };

// The end of home, as on the website footer: where to get help, the areas we serve, and a big quiet sign-off.
export function HomeFooter({ areas = [] }: { areas?: Area[] }) {
  const router = useRouter();
  const { data } = useGetPoliciesQuery(undefined);
  const policies: { title: string; slug: string }[] = data?.policies || [];
  const cities = [...new Set(areas.map((a) => a.city).filter(Boolean))] as string[];
  const links: { label: string; to: Href }[] = [
    { label: 'Help & FAQs', to: '/faq' },
    { label: 'Refer a friend', to: '/referral' },
    ...policies.map((p) => ({ label: p.title, to: `/policy/${p.slug}` as Href })),
  ];

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <View style={styles.links}>
        {links.map((l) => (
          <Pressable key={l.label} onPress={() => router.push(l.to)} hitSlop={8} accessibilityRole="link" style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.link}>{l.label}</Text>
          </Pressable>
        ))}
      </View>

      {cities.length ? (
        <Text style={styles.serving}>
          Now serving <Text style={styles.servingStrong}>{cities.join(', ')}</Text>
        </Text>
      ) : null}

      <View accessible accessibilityLabel="ZappyOne, India's doorstep help app">
        <Text style={styles.signoff}>{"India's\ndoorstep\nhelp app"}</Text>
        <Heart size={34} color={HEART} fill={HEART} style={styles.heart} />
      </View>

      <View style={styles.rule} />
      <View style={styles.made}>
        <ShieldCheck size={14} color={slate[400]} />
        <Text style={styles.madeText}>Verified pros · Made in Hyderabad</Text>
      </View>
      <Text style={styles.madeText}>ZappyOne, a venture of DevUp Ecosystem</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.xl, paddingTop: spacing.xl, gap: spacing.base, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: slate[200] },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.sm },
  link: { fontFamily: fontFamily.semibold, fontSize: 14, color: slate[500] },
  pressed: { opacity: 0.6 },
  serving: { fontSize: 13, color: slate[500] },
  servingStrong: { fontFamily: fontFamily.bold, color: slate[700] },
  signoff: { fontFamily: fontFamily.black, fontSize: 46, lineHeight: 48, letterSpacing: -1.2, color: slate[300], marginTop: spacing.lg },
  heart: { marginTop: spacing.sm },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: slate[200], marginTop: spacing.base },
  made: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  madeText: { fontSize: 12, color: slate[400] },
});
