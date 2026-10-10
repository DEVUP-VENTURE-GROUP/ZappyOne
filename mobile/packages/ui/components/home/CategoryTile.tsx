/**
 * One heading or option tile in a scrolling strip (the websites' CategoryTile).
 * Fixed width so long catalog names fit; a repair heading previews what it
 * covers and says the quote comes first.
 */
import { memo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, ShieldCheck } from 'lucide-react-native';
import { Text } from '..';
import { webAsset } from '../../lib/media';
import { CATEGORY_ICONS } from '../repair/categoryIcons';
import { serviceIcon } from './serviceIcons';
import { colors, ink, slate, success, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export interface TileCategory {
  code: string; name: string; icon?: string; imageUrl?: string; emoji?: string; toneColor?: string; subtitle?: string;
  problems?: { name: string }[];
}

export const CategoryTile = memo(function CategoryTile({ category, onOpen }: { category: TileCategory; onOpen: () => void }) {
  const Icon = CATEGORY_ICONS[category.code] || serviceIcon(category.icon);
  const problems = category.problems || [];
  const count = problems.length;
  const preview = count ? `${problems.slice(0, 2).map((p) => p.name).join(', ')}${count > 2 ? ' & more' : ''}` : '';
  const img = webAsset(category.imageUrl);
  // A ZappyOne character is drawn on white: fit it rather than crop it.
  const character = !!category.imageUrl?.startsWith('/characters/');

  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={category.name} style={styles.tile}>
      <View style={[styles.art, !img && category.emoji && category.toneColor ? { backgroundColor: category.toneColor } : null]}>
        {img ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode={character ? 'contain' : 'cover'} />
          : category.emoji ? <Text style={styles.emoji}>{category.emoji}</Text>
            : <View style={styles.iconRing}><Icon size={24} color={zappy[600]} strokeWidth={1.8} /></View>}
        {count ? <View style={styles.count}><Text variant="caption" weight="semibold">{count} {count === 1 ? 'problem' : 'problems'}</Text></View> : null}
      </View>
      <View style={[styles.body, { height: count ? 118 : 96 }]}>
        <Text variant="body" weight="bold" numberOfLines={count ? 1 : 2}>{category.name}</Text>
        {count ? (
          <>
            <Text variant="caption" color={ink[500]} numberOfLines={2}>{preview}</Text>
            <View style={styles.foot}>
              {/* True for every repair: the quote comes first, nothing starts until it is approved. */}
              <View style={styles.inline}><ShieldCheck size={13} color={success[700]} /><Text variant="caption" weight="semibold" color={success[700]}>Quote first</Text></View>
              <View style={styles.inline}><Text variant="caption" weight="semibold" color={zappy[600]}>View</Text><ChevronRight size={14} color={zappy[600]} /></View>
            </View>
          </>
        ) : (
          <>
            {category.subtitle ? <Text variant="caption" color={ink[500]} numberOfLines={1}>{category.subtitle}</Text> : null}
            <View style={[styles.foot, styles.end]}><Text variant="caption" weight="semibold" color={zappy[600]}>Book</Text><ChevronRight size={14} color={zappy[600]} /></View>
          </>
        )}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  tile: { width: 200, overflow: 'hidden', borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  art: { aspectRatio: 4 / 5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: slate[100] },
  emoji: { fontSize: 56 },
  iconRing: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  count: { position: 'absolute', left: 8, bottom: 8, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(255,255,255,0.95)' },
  body: { gap: 4, padding: spacing.md },
  foot: { marginTop: 'auto', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  end: { justifyContent: 'flex-end' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
