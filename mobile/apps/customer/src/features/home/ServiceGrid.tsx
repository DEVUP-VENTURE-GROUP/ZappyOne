/**
 * The services as one even grid (the website's ServiceGrid): what can be
 * booked here first, then the rest in catalog order. Every tile looks the same;
 * the picture and the name do the work.
 */
import { memo, useMemo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { distinctArt, servicePhoto } from '@zappy/core/shared/serviceArt';
import { Text } from '@zappy/ui/components';
import { serviceIcon } from '@zappy/ui/components/home/serviceIcons';
import { webAsset } from '@zappy/ui/lib/media';
import { ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { HomeDomain, HomeService } from './homeCatalog';

const Tile = memo(function Tile({ service, character, onOpen }: { service: HomeService; character?: { still?: string }; onOpen: () => void }) {
  const Icon = serviceIcon(service.icon);
  const photo = servicePhoto(service);
  const art = webAsset(photo || character?.still);
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={service.name} style={styles.tile}>
      <View style={styles.art}>
        {art ? <Image source={{ uri: art }} style={photo ? styles.photo : styles.character} resizeMode={photo ? 'cover' : 'contain'} />
          : <Icon size={30} color={ink[700]} strokeWidth={1.6} />}
      </View>
      <Text variant="caption" weight="semibold" numberOfLines={2} style={styles.name}>{service.name}</Text>
    </Pressable>
  );
});

export function ServiceGrid({ domains, onOpen }: { domains: HomeDomain[]; onOpen: (s: HomeService) => void }) {
  const tiles = useMemo(() => domains.flatMap((d) => d.services).sort((a, b) => Number(a.available === false) - Number(b.available === false)), [domains]);
  const characters = useMemo(() => new Map(domains.flatMap((d) => [...distinctArt(d.services, d.code)])), [domains]);
  if (!tiles.length) return null;
  return (
    <View style={styles.section}>
      <Text variant="heading3" weight="bold">Services</Text>
      <View style={styles.grid}>
        {tiles.map((s) => <Tile key={s.code} service={s} character={characters.get(s.code)} onOpen={() => onOpen(s)} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.base, columnGap: '3.5%' },
  tile: { width: '31%', alignItems: 'center', gap: spacing.sm },
  art: { width: '100%', aspectRatio: 1, borderRadius: radius.large, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  photo: { width: '100%', height: '100%' },
  character: { width: '100%', height: '100%', marginTop: 6 },
  name: { textAlign: 'center' },
});
