// Why a job stays on ZappyOne, for the customer or the pro (the websites' StayOnZappyOne); one line in the chat, a card elsewhere.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { STAY_ON_ZAPPYONE } from '@zappy/core/shared/jobFlows';
import { Text } from '../Text';
import { zappy } from '../../theme/colors';

export function StayOnZappyOne({ audience = 'customer', compact = false }: { audience?: 'customer' | 'pro'; compact?: boolean }) {
  const c = STAY_ON_ZAPPYONE[audience === 'pro' ? 'pro' : 'customer'];
  return (
    <View accessibilityRole="text" style={compact ? styles.line : styles.card}>
      <ShieldCheck size={compact ? 15 : 18} color={zappy[700]} />
      <View style={styles.flex}>
        {compact ? null : <Text variant="body" weight="bold" color={zappy[800]}>{c.title}</Text>}
        <Text variant="caption" weight={compact ? 'semibold' : 'regular'} color={zappy[800]}>{compact ? c.short : c.body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 16, borderWidth: 1, borderColor: zappy[100], backgroundColor: zappy[50], paddingHorizontal: 14, paddingVertical: 12 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: zappy[50], paddingHorizontal: 16, paddingVertical: 8 },
  flex: { flex: 1 },
});
