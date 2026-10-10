/**
 * One repair heading: its picture or icon, how much of it is ticked, how many
 * customer issues it covers, and a box to tick or untick all of it.
 */
import { memo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Check, Wrench } from 'lucide-react-native';
import { Text } from '../../../components';
import { CATEGORY_ICONS } from '../../../components/repair/categoryIcons';
import { webAsset } from '../../../lib/media';
import { colors, ink, slate, zappy } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import type { RepairGroup } from './workSelection';

export const HeadingTile = memo(function HeadingTile({ group, count, onOpen, onToggleAll }: { group: RepairGroup; count: number; onOpen: () => void; onToggleAll: (on: boolean) => void }) {
  const Icon = CATEGORY_ICONS[group.code] || Wrench;
  const total = group.repairs.length;
  const all = count === total && count > 0;
  const img = webAsset(group.imageUrl);
  return (
    <View style={styles.wrap}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${group.name}, ${count} of ${total} selected`} style={[styles.tile, count ? styles.tileOn : null]}>
        <View style={[styles.icon, count ? styles.iconOn : null]}>
          {img ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} /> : <Icon size={17} color={count ? '#fff' : ink[500]} />}
        </View>
        <Text variant="caption" weight="bold" numberOfLines={2}>{group.name}</Text>
        <Text variant="caption" weight="semibold" color={count ? zappy[600] : ink[400]}>{count ? `${count} of ${total} selected` : `${total} jobs`}</Text>
        {/* One fix answers many symptoms: say so, or "3 jobs" beside the customer's "11 issues" reads as missing work. */}
        {group.problemCount ? <Text variant="caption" color={ink[400]}>covers {group.problemCount} customer issue{group.problemCount === 1 ? '' : 's'}</Text> : null}
      </Pressable>
      <Pressable onPress={() => onToggleAll(!all)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: all ? true : count ? 'mixed' : false }}
        accessibilityLabel={all ? `Untick all of ${group.name}` : `Tick all of ${group.name}`} style={[styles.box, all ? styles.boxAll : count ? styles.boxSome : null]}>
        {all ? <Check size={14} color="#fff" strokeWidth={3.5} /> : count ? <View style={styles.dash} /> : null}
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { width: '48.5%' },
  tile: { flex: 1, gap: 6, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: slate[200], backgroundColor: colors.surface },
  tileOn: { borderColor: zappy[500], backgroundColor: zappy[50] },
  icon: { width: 36, height: 36, borderRadius: radius.medium, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  iconOn: { backgroundColor: zappy[600] },
  box: { position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: slate[300], backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  boxAll: { backgroundColor: zappy[600], borderColor: zappy[600] },
  boxSome: { borderColor: zappy[600] },
  dash: { width: 10, height: 2, borderRadius: 1, backgroundColor: zappy[600] },
});
