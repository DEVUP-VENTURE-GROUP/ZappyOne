/**
 * Every service, section by section, with what is inside each (the website's
 * ServiceShowcase): a card per service with its contents as tiles (a repair's
 * problem areas, event occasions, pet services, helping jobs). Each tile opens
 * the booking already set to it.
 */
import { memo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { categoryPhoto } from '@zappy/core/shared/problemArt';
import { artFor, PITCH, servicePhoto } from '@zappy/core/shared/serviceArt';
import { Text } from '@zappy/ui/components';
import { CategoryTile, type TileCategory } from '@zappy/ui/components/home/CategoryTile';
import { serviceIcon } from '@zappy/ui/components/home/serviceIcons';
import { webAsset } from '@zappy/ui/lib/media';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import type { HomeDomain, HomeService } from './homeCatalog';

/** Where a section's own page is, for its single card's Book action. */
const SECTION_HOME: Record<string, { name: string; path: string }> = {
  pet_services: { name: 'Pet care', path: '/pet' },
  helping_services: { name: 'Helping services', path: '/helping' },
};

/** Repairs: a card per service. A section without headings reads as ONE card, its services (or their jobs) as tiles. */
function cardsFor(domain: HomeDomain): HomeService[] {
  const { services } = domain;
  if (services.length === 1 || services.some((s) => s.coverage?.length)) return services;
  const home = SECTION_HOME[domain.code] || { name: domain.name, path: services[0].path };
  const asTiles = services.length >= 3;
  return [{
    code: domain.code, domainCode: domain.code, name: home.name, path: home.path, icon: services[0].icon, coverage: [],
    countLabel: asTiles ? 'services' : 'options',
    options: asTiles
      ? services.map((s) => ({ code: s.code, name: s.name, icon: s.icon, imageUrl: servicePhoto(s), path: s.path, service: s }))
      : services.flatMap((s) => (s.options || []).map((o) => ({ ...o, service: s }))),
  }];
}

const ServiceCard = memo(function ServiceCard({ service, onOpen }: { service: HomeService; onOpen: (s: HomeService, path?: string) => void }) {
  const Icon = serviceIcon(service.icon);
  const key = service.artKey || service.code;
  const repairTiles = (service.coverage || []).map((c) => ({ tile: { ...c, imageUrl: categoryPhoto(key, c) || c.imageUrl } as TileCategory, path: `/repair/category/${key}/${c.code}`, target: undefined as HomeService | undefined }));
  const optionTiles = (service.options || []).map((o) => ({
    tile: { code: o.code, name: o.name, icon: o.icon, emoji: o.emoji, toneColor: o.toneColor, imageUrl: o.imageUrl || servicePhoto({ code: o.code }) || '', subtitle: '' } as TileCategory, path: o.path, target: o.service,
  }));
  const tiles = repairTiles.length ? repairTiles : optionTiles;
  const count = repairTiles.length ? `${repairTiles.length} problem areas` : optionTiles.length ? `${optionTiles.length} ${service.countLabel || 'options'}` : '';

  return (
    <View style={styles.card}>
      <Pressable onPress={() => onOpen(service)} accessibilityRole="button" accessibilityLabel={`Book ${service.name}`} style={styles.cardHead}>
        <View style={styles.cardIcon}><Icon size={24} color={ink[700]} strokeWidth={1.8} /></View>
        <View style={styles.flex}>
          <Text variant="body" weight="bold">{service.name}</Text>
          {count ? <Text variant="caption" color={ink[500]}>{count}</Text> : null}
        </View>
        <View style={styles.book}><Text variant="caption" weight="semibold" color="#fff">Book</Text><ChevronRight size={16} color="#fff" /></View>
      </Pressable>
      {tiles.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}>
          {tiles.map(({ tile, path, target }) => <CategoryTile key={tile.code} category={tile} onOpen={() => onOpen(target || service, path)} />)}
        </ScrollView>
      ) : <Text variant="caption" color={ink[500]} style={styles.tagline}>{service.tagline || service.description}</Text>}
    </View>
  );
});

function Section({ domain, onOpen }: { domain: HomeDomain; onOpen: (s: HomeService, path?: string) => void }) {
  // The section's own photo when it has one, else its character.
  const photo = servicePhoto(domain.services[0]);
  const art = webAsset(photo || artFor(domain.services[0]?.code, domain.code)?.still);
  const [title, line] = (PITCH as Record<string, string[]>)[domain.code] || [domain.name, domain.description];
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        {art ? <Image source={{ uri: art }} style={styles.avatar} resizeMode={photo ? 'cover' : 'contain'} /> : null}
        <View style={styles.flex}>
          <Text variant="body" weight="bold">{domain.name}</Text>
          <Text variant="caption" color={ink[500]}>{line || title}</Text>
        </View>
      </View>
      {cardsFor(domain).map((s) => <ServiceCard key={s.code} service={s} onOpen={onOpen} />)}
    </View>
  );
}

export function ServiceShowcase({ domains, onOpen }: { domains: HomeDomain[]; onOpen: (s: HomeService, path?: string) => void }) {
  const router = useRouter();
  if (!domains.length) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text variant="heading3" weight="bold">All services</Text>
        <Pressable onPress={() => router.push('/services' as never)} hitSlop={8} style={styles.inline}>
          <Text variant="bodySmall" weight="semibold" color={zappy[600]}>See all</Text><ChevronRight size={16} color={zappy[600]} />
        </Pressable>
      </View>
      {domains.map((d) => <Section key={d.code} domain={d} onOpen={onOpen} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  inline: { flexDirection: 'row', alignItems: 'center' },
  wrap: { gap: spacing.xl },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  section: { gap: spacing.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: slate[100] },
  card: { overflow: 'hidden', borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingTop: spacing.base },
  cardIcon: { width: 48, height: 48, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  book: { flexDirection: 'row', alignItems: 'center', minHeight: 40, paddingLeft: 14, paddingRight: 8, borderRadius: radius.button, backgroundColor: zappy[600] },
  tiles: { gap: spacing.md, padding: spacing.base, paddingTop: spacing.md },
  tagline: { paddingHorizontal: spacing.base, paddingBottom: spacing.base, paddingTop: spacing.sm },
});
