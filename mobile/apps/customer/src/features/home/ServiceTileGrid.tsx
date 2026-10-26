/** A section's services as a dense grid of square photo tiles with a short label under each (the website's ServiceTileGrid). */
import { memo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@zappy/ui/components';
import { serviceIcon } from '@zappy/ui/components/home/serviceIcons';
import { webAsset } from '@zappy/ui/lib/media';
import { zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface GridTile { code: string; name: string; icon?: string; imageUrl?: string; emoji?: string; toneColor?: string; path: string }

const Tile = memo(function Tile({ t, onOpen }: { t: GridTile; onOpen: (t: GridTile) => void }) {
  const uri = t.imageUrl ? webAsset(t.imageUrl) : null;
  const Icon = serviceIcon(t.icon);
  return (
    <Pressable onPress={() => onOpen(t)} accessibilityRole="button" accessibilityLabel={t.name} style={({ pressed }) => [styles.cell, pressed && styles.pressed]}>
      <View style={[styles.square, { backgroundColor: uri ? '#EEF1F6' : t.toneColor || '#EEF3FD' }]}>
        {uri ? <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
          : t.emoji ? <Text style={styles.emoji}>{t.emoji}</Text>
            : <Icon size={28} color={zappy[600]} strokeWidth={1.8} />}
      </View>
      <Text variant="caption" weight="semibold" numberOfLines={2} style={styles.label}>{t.name}</Text>
    </Pressable>
  );
});

export function ServiceTileGrid({ tiles, onOpen }: { tiles: GridTile[]; onOpen: (t: GridTile) => void }) {
  return <View style={styles.grid}>{tiles.map((t) => <Tile key={t.code} t={t} onOpen={onOpen} />)}</View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.base },
  cell: { width: '25%', paddingHorizontal: 5, alignItems: 'center', gap: 6 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  square: { width: '100%', aspectRatio: 1, borderRadius: radius.large, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', height: '100%' },
  emoji: { fontSize: 34, lineHeight: 40 },
  label: { textAlign: 'center', lineHeight: 15 },
});
