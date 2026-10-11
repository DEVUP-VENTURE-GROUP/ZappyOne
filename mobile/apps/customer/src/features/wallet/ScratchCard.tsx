/** A scratch card (the website's ScratchCard): tap to reveal; once opened it shows what it gave, or "better luck next time". */
import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { Clock, Gift } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface Card { id: string; status: 'active' | 'scratched'; expiresAt?: string; reward?: { type: string; label: string } }

export const ScratchCard = memo(function ScratchCard({ card, onScratch, revealing = false }: { card: Card; onScratch?: (id: string) => void; revealing?: boolean }) {
  const t = useT();
  const scratched = card.status === 'scratched';
  const win = scratched && card.reward && card.reward.type !== 'none';
  return (
    <Pressable onPress={() => !scratched && onScratch?.(card.id)} disabled={scratched || revealing} accessibilityRole="button"
      style={[styles.card, { backgroundColor: scratched ? (win ? success[50] : slate[50]) : zappy[500] }]}>
      {scratched ? (
        <Animated.View entering={ZoomIn} style={styles.center}>
          <Gift size={26} color={win ? success[500] : slate[300]} />
          <Text variant="caption" weight="black" color={win ? success[700] : slate[400]} style={styles.text}>{win ? card.reward!.label : t('rewards.betterLuck', 'Better luck next time')}</Text>
          {win ? <Text variant="caption" weight="bold" color={success[500]}>{t('rewards.added', 'Added')}</Text> : null}
        </Animated.View>
      ) : (
        <View style={styles.center}>
          {revealing ? <ActivityIndicator color="#fff" /> : <Gift size={30} color="#fff" />}
          <Text variant="caption" weight="black" color="rgba(255,255,255,0.9)" style={styles.text}>{t('rewards.tapScratch', 'TAP TO SCRATCH')}</Text>
          {card.expiresAt ? <View style={styles.inline}><Clock size={9} color="rgba(255,255,255,0.7)" /><Text variant="caption" color="rgba(255,255,255,0.7)">{t('rewards.exp', 'exp')} {new Date(card.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text></View> : null}
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { width: '31%', aspectRatio: 4 / 5, alignItems: 'center', justifyContent: 'center', padding: spacing.sm, borderRadius: radius.large },
  center: { alignItems: 'center', gap: 6 },
  text: { textAlign: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
