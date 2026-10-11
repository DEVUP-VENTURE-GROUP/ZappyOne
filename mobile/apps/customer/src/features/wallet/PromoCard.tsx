/**
 * One promo code (the website's PromoCard): the code, what it gives, the
 * minimum, the services it covers, when it ends (red inside a day), and the
 * code to hand on through the phone's share sheet, which can also copy it.
 */
import { memo } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { AlertCircle, Clock, Copy } from 'lucide-react-native';
import { serviceLabel } from '@zappy/core/shared/services';
import { Button, Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, danger, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface Promo { code: string; name: string; description?: string; type: string; discountValue: number; maxDiscountPaise?: number; minOrderPaise?: number; services?: string[]; expiresAt: string; alreadyUsed?: boolean }

const rs = (paise: number) => `₹${Math.round(paise / 100)}`;

function discount(p: Promo) {
  if (p.type === 'percent') return `${p.discountValue}% off${p.maxDiscountPaise ? ` (up to ${rs(p.maxDiscountPaise)})` : ''}`;
  if (p.type === 'first_order') return `${rs(p.discountValue)} off first order`;
  return `${rs(p.discountValue)} off`;
}

export const PromoCard = memo(function PromoCard({ promo }: { promo: Promo }) {
  const t = useT();
  const ends = new Date(promo.expiresAt);
  const hours = Math.round((ends.getTime() - Date.now()) / 3600000);
  const urgent = hours < 24;
  const when = hours < 1 ? t('promo.soon', 'Expires soon') : urgent ? `${t('promo.expiresIn', 'Expires in')} ${hours}h` : `${t('promo.expires', 'Expires')} ${ends.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
  return (
    <View style={[styles.card, promo.alreadyUsed && styles.used]}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <View style={styles.inline}>
            <Text variant="body" weight="bold" color={zappy[600]} style={styles.code}>{promo.code}</Text>
            {promo.alreadyUsed ? <View style={styles.usedTag}><Text variant="caption" color={ink[500]}>{t('promo.used', 'Used')}</Text></View> : null}
          </View>
          <Text variant="bodySmall" weight="semibold">{promo.name}</Text>
          {promo.description ? <Text variant="caption" color={ink[500]}>{promo.description}</Text> : null}
        </View>
        <View style={styles.right}>
          <Text variant="bodySmall" weight="bold" color={success[600]}>{discount(promo)}</Text>
          {promo.minOrderPaise ? <Text variant="caption" color={ink[400]}>{t('promo.min', 'Min')} {rs(promo.minOrderPaise)}</Text> : null}
        </View>
      </View>
      {promo.services?.length ? <View style={styles.tags}>{promo.services.map((s) => <View key={s} style={styles.tag}><Text variant="caption" color={zappy[600]}>{serviceLabel(s)}</Text></View>)}</View> : null}
      <View style={styles.foot}>
        <View style={styles.inline}>{urgent ? <AlertCircle size={14} color={danger[500]} /> : <Clock size={14} color={ink[400]} />}<Text variant="caption" color={urgent ? danger[500] : ink[400]}>{when}</Text></View>
        {!promo.alreadyUsed ? <Button label={t('promo.copy', 'Copy code')} size="small" variant="secondary" icon={<Copy size={14} color={zappy[600]} />} onPress={() => Share.share({ message: promo.code }).catch(() => {})} /> : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  used: { opacity: 0.5 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  code: { letterSpacing: 1.5 },
  usedTag: { borderRadius: radius.pill, paddingHorizontal: 8, backgroundColor: slate[100] },
  right: { alignItems: 'flex-end' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tag: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: zappy[50] },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
