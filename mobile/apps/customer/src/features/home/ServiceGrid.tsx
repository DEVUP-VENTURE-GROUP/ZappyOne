// Explore services (Asif's design): seven service areas with their photo, then More Services; each opens All services at that area.
import { memo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { LayoutGrid } from 'lucide-react-native';
import { areaPhoto } from '@zappy/core/shared/serviceArt';
import { Text } from '@zappy/ui/components';
import { serviceIcon } from '@zappy/ui/components/home/serviceIcons';
import { webAsset } from '@zappy/ui/lib/media';
import { zappy } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import type { HomeDomain } from './homeCatalog';

// Light surfaces only, one per service area; the icon or character carries the colour (same tints as the website).
const DOMAIN_TINT: Record<string, { bg: string; fg: string }> = {
  electronics: { bg: '#F5F3FF', fg: '#7C3AED' },
  vehicles: { bg: '#F0F9FF', fg: '#0284C7' },
  home_services: { bg: '#ECFEFF', fg: '#0891B2' },
  pet_services: { bg: '#FFF7ED', fg: '#F97316' },
  helping_services: { bg: '#ECFDF5', fg: '#059669' },
  family_assist: { bg: '#FFF1F2', fg: '#F43F5E' },
  events: { bg: '#FDF2F8', fg: '#EC4899' },
};
const DEFAULT_TINT = { bg: zappy[50], fg: zappy[600] };
export const tintFor = (domainCode?: string) => (domainCode && DOMAIN_TINT[domainCode]) || DEFAULT_TINT;

// Short names so two words fit under a tile.
const SHORT_AREA: Record<string, string> = {
  electronics: 'Phones & Laptops', home_daily_help: 'Home & Daily Help', home_services: 'Repairs & Upkeep', beauty_care: 'Beauty & Care',
  errands_pickup: 'Errands & Pickup', helping_services: 'Helping Services', family_assist: 'Family Help', specialist_home: 'Specialist Services', local_pros: 'Local Pros',
};
// 4 + 3 area tiles, then More Services: two rows of four.
const HOME_AREA_LIMIT = 7;

const AreaTile = memo(function AreaTile({ label, a11y, photo, Icon, tint, onPress }: {
  label: string; a11y: string; photo: string | null; Icon: ReturnType<typeof serviceIcon>; tint: { bg: string; fg: string }; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} style={styles.tile}>
      <View style={[styles.art, { backgroundColor: tint.bg }]}>
        {photo ? <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" /> : <Icon size={28} color={tint.fg} strokeWidth={1.8} />}
      </View>
      <Text variant="caption" weight="semibold" numberOfLines={2} style={styles.name}>{label}</Text>
    </Pressable>
  );
});

export function ServiceGrid({ domains, onOpenArea, onMore }: { domains: HomeDomain[]; onOpenArea: (d: HomeDomain) => void; onMore: () => void }) {
  if (!domains.length) return null;
  return (
    <View style={styles.section}>
      {/* No View all: the More Services tile opens every service. */}
      <Text variant="heading3" weight="bold">Explore services</Text>
      <View style={styles.grid}>
        {domains.slice(0, HOME_AREA_LIMIT).map((d) => (
          <AreaTile key={d.code} label={SHORT_AREA[d.code] ?? d.name} a11y={`${d.name}, ${d.services.length} services`}
            photo={webAsset(areaPhoto(d))} Icon={serviceIcon((d as { icon?: string }).icon)} tint={tintFor(d.code)} onPress={() => onOpenArea(d)} />
        ))}
        <AreaTile label="More Services" a11y="More services: see all services" photo={null} Icon={LayoutGrid} tint={DEFAULT_TINT} onPress={onMore} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.base, columnGap: '2.66%' },
  tile: { width: '23%', alignItems: 'center', gap: spacing.sm },
  art: { width: '100%', aspectRatio: 1, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(16,24,40,0.05)' },
  photo: { width: '100%', height: '100%' },
  name: { textAlign: 'center' },
});
