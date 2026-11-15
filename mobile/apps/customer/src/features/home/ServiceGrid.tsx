// The services as one even grid (the website's ServiceGrid): soft tint per area, bookable here first, then catalog order.
import { memo, useMemo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { distinctArt } from '@zappy/core/shared/serviceArt';
import { Text } from '@zappy/ui/components';
import { serviceIcon } from '@zappy/ui/components/home/serviceIcons';
import { webAsset } from '@zappy/ui/lib/media';
import { zappy } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import type { HomeDomain, HomeService } from './homeCatalog';

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

const Tile = memo(function Tile({ service, still, onOpen }: { service: HomeService & { imageUrl?: string }; still?: string; onOpen: () => void }) {
  const Icon = serviceIcon(service.icon);
  const tint = tintFor(service.domainCode);
  // An admin-set picture wins; then the service's ZappyOne character; then its icon.
  const art = webAsset(service.imageUrl || still);
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={service.name} style={styles.tile}>
      <View style={[styles.art, { backgroundColor: tint.bg }]}>
        {art ? <Image source={{ uri: art }} style={service.imageUrl ? styles.photo : styles.character} resizeMode={service.imageUrl ? 'cover' : 'contain'} />
          : <Icon size={28} color={tint.fg} strokeWidth={1.8} />}
      </View>
      <Text variant="caption" weight="semibold" numberOfLines={2} style={styles.name}>{service.name}</Text>
    </Pressable>
  );
});

export function ServiceGrid({ domains, onOpen, onViewAll }: { domains: HomeDomain[]; onOpen: (s: HomeService) => void; onViewAll?: () => void }) {
  const tiles = useMemo(() => [...domains.flatMap((d) => d.services)].sort((a, b) => Number(a.available === false) - Number(b.available === false)), [domains]);
  const characters = useMemo(() => new Map<string, { still?: string }>(domains.flatMap((d) => [...distinctArt(d.services, d.code)])), [domains]);
  if (!tiles.length) return null;
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text variant="heading3" weight="bold">Explore services</Text>
        {onViewAll ? <Pressable onPress={onViewAll} hitSlop={8} style={styles.head}><Text variant="caption" weight="semibold" color={zappy[600]}>View all</Text><ChevronRight size={15} color={zappy[600]} /></Pressable> : null}
      </View>
      <View style={styles.grid}>
        {tiles.map((s) => <Tile key={s.code} service={s} still={characters.get(s.code)?.still} onOpen={() => onOpen(s)} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.base, columnGap: '2.66%' },
  tile: { width: '23%', alignItems: 'center', gap: spacing.sm },
  art: { width: '100%', maxWidth: 88, aspectRatio: 1, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', height: '100%' },
  character: { width: '90%', height: '90%' },
  name: { textAlign: 'center' },
});
