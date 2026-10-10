/**
 * Every live service, section by section (the websites' LiveServices): a card
 * per repair service with its problem headings as a sideways row, and one row
 * of tiles for a section without headings (pet care, helping). Every service
 * opens; the booking step says if nobody can come to the address.
 *
 *   availableCodes  which services someone covers here, for demand analytics
 */
import { memo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useLiveCatalogQuery } from '@zappy/core/api';
import { categoryPhoto, servicePhoto } from '@zappy/core/shared/problemArt';
import { distinctArt } from '@zappy/core/shared/serviceArt';
import { Text } from '..';
import { webAsset } from '../../lib/media';
import { CategoryTile } from './CategoryTile';
import { serviceIcon } from './serviceIcons';
import { colors, ink, slate, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

interface Group { code: string; name: string; imageUrl?: string; problems?: { name: string }[] }
interface Service { code: string; name: string; icon?: string; path: string; imageUrl?: string; description?: string; tagline?: string; artKey?: string; coverage?: Group[]; available?: boolean }
interface Domain { code: string; name: string; description?: string; services: Service[] }

const ServiceCard = memo(function ServiceCard({ service, character, onOpen, onOpenGroup }: { service: Service; character?: { still?: string }; onOpen: () => void; onOpenGroup: (g: Group) => void }) {
  const Icon = serviceIcon(service.icon);
  const photo = webAsset(service.imageUrl || servicePhoto(service.code));
  const coverage = service.coverage || [];
  return (
    <View style={styles.card}>
      <Pressable onPress={onOpen} accessibilityRole="button" style={styles.cardHead}>
        {photo ? <Image source={{ uri: photo }} style={styles.photo} />
          : character?.still ? <Image source={{ uri: webAsset(character.still) || undefined }} style={styles.character} resizeMode="contain" />
            : <Icon size={24} color={zappy[700]} strokeWidth={1.6} />}
        <View style={styles.flex}>
          <Text variant="body" weight="semibold">{service.name}</Text>
          <Text variant="caption" color={ink[500]}>{service.description || service.tagline}</Text>
        </View>
        <View style={styles.inline}><Text variant="caption" weight="semibold" color={zappy[600]}>Book</Text><ChevronRight size={16} color={zappy[600]} /></View>
      </Pressable>
      {coverage.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles} style={styles.rule}>
          {/* A repair heading with no upload shows our photo for it. */}
          {coverage.map((g) => <CategoryTile key={g.code} category={{ ...g, imageUrl: categoryPhoto(service.code, g) || g.imageUrl }} onOpen={() => onOpenGroup(g)} />)}
        </ScrollView>
      ) : null}
    </View>
  );
});

export function LiveServices({ availableCodes = null, onOpenService }: { availableCodes?: string[] | null; onOpenService?: (code: string, served: boolean) => void }) {
  const router = useRouter();
  const { data, isLoading } = useLiveCatalogQuery();
  if (isLoading) return <View style={styles.list}>{[0, 1].map((i) => <View key={i} style={styles.skeleton} />)}</View>;

  const allowed = availableCodes ? new Set(availableCodes) : null;
  const domains: Domain[] = ((data?.domains || []) as Domain[])
    .map((d) => ({ ...d, services: d.services.map((s) => ({ ...s, available: allowed ? allowed.has(s.code) : undefined })) }))
    .filter((d) => d.services.length);
  const open = (s: Service, path?: string) => { onOpenService?.(s.code, s.available !== false); router.push((path || s.path) as never); };
  if (!domains.length) return null;

  return (
    <View style={styles.list}>
      {domains.map((d) => {
        const characters = distinctArt(d.services, d.code);
        return (
          <View key={d.code} style={styles.section}>
            <Text variant="heading3" weight="bold">{d.name}</Text>
            {d.description ? <Text variant="caption" color={ink[500]}>{d.description}</Text> : null}
            {d.services.some((s) => s.coverage?.length) ? d.services.map((s) => (
              <ServiceCard key={s.code} service={s} character={characters.get(s.code)} onOpen={() => open(s)}
                onOpenGroup={(g) => open(s, `/repair/category/${s.artKey || s.code}/${g.code}`)} />
            )) : (
              // No headings: one row, a tile per service.
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles} style={styles.card}>
                {d.services.map((s) => (
                  <CategoryTile key={s.code} category={{ code: s.code, name: s.name, icon: s.icon, imageUrl: s.imageUrl || servicePhoto(s.code) || characters.get(s.code)?.still, subtitle: '' }} onOpen={() => open(s)} />
                ))}
              </ScrollView>
            )}
          </View>
        );
      })}
      <Text variant="caption" color={ink[500]}>New areas open every week as we verify providers across Telangana.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center' },
  list: { gap: spacing.xl },
  section: { gap: spacing.sm },
  skeleton: { height: 160, borderRadius: radius.medium, backgroundColor: slate[100] },
  card: { overflow: 'hidden', borderRadius: radius.medium, backgroundColor: colors.surface },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  photo: { width: 44, height: 44, borderRadius: radius.button },
  character: { width: 48, height: 48, borderRadius: radius.medium, backgroundColor: '#EEF3FB' },
  rule: { borderTopWidth: 1, borderTopColor: slate[100] },
  tiles: { gap: spacing.sm, paddingHorizontal: spacing.base, paddingVertical: spacing.md },
});
