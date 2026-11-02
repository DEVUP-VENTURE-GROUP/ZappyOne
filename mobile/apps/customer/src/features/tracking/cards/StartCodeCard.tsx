import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { KeyRound } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from '@zappy/ui/components';
import { colors, ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

// Locked while the pro travels, "are they with you?" on arrival (shown anyway after 90 s), then the digits (the website's StartCodeCard).
const REVEAL_AFTER_S = 90;

function Digits({ code, hidden }: { code: string; hidden: boolean }) {
  return (
    <View style={styles.digits} accessibilityLabel={hidden ? 'Start code hidden' : `Start code ${code.split('').join(' ')}`}>
      {code.split('').map((d, i) => (
        <View key={i} style={[styles.digit, hidden && styles.digitHidden]}>
          <Text variant="bodyLarge" weight="bold" color={hidden ? ink[300] : '#FFFFFF'}>{hidden ? '•' : d}</Text>
        </View>
      ))}
    </View>
  );
}

export function StartCodeCard({ jobKey, code, stage, noun, framed = false }: { jobKey: string; code: string | null; stage: string; noun: string; framed?: boolean }) {
  const storeKey = `start-code-ok:${jobKey}`;
  const [confirmed, setConfirmed] = useState(false);
  const [left, setLeft] = useState(REVEAL_AFTER_S);

  useEffect(() => { AsyncStorage.getItem(storeKey).then((v) => { if (v === '1') setConfirmed(true); }).catch(() => {}); }, [storeKey]);
  const confirm = () => { setConfirmed(true); AsyncStorage.setItem(storeKey, '1').catch(() => {}); };

  useEffect(() => {
    if (stage !== 'arrived' || confirmed) return undefined;
    setLeft(REVEAL_AFTER_S);
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [stage, confirmed]);
  useEffect(() => { if (left === 0 && !confirmed) confirm(); }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!code || !['assigned', 'on_the_way', 'arrived'].includes(stage)) return null;
  const asking = stage === 'arrived' && !confirmed;
  const shown = stage === 'arrived' && confirmed;
  return (
    <View style={[styles.row, framed ? styles.framed : styles.line]}>
      <KeyRound size={18} color={ink[900]} />
      <View style={styles.flex}>
        <Text variant="body">{asking ? `Is your ${noun} with you?` : 'Start code for the job'}</Text>
        <Text variant="caption" color={ink[500]}>{asking ? `It shows in ${left}s` : shown ? 'Give it only in person. ZappyOne never asks for it.' : `Shows when your ${noun} arrives`}</Text>
      </View>
      {asking ? (
        <Pressable onPress={confirm} accessibilityRole="button" style={styles.show}><Text variant="bodySmall" weight="bold" color="#FFFFFF">Yes, show</Text></Pressable>
      ) : <Digits code={String(code)} hidden={!shown} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: slate[300] },
  framed: { paddingHorizontal: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: slate[200], backgroundColor: colors.surface },
  flex: { flex: 1, minWidth: 0 },
  digits: { flexDirection: 'row', gap: 6 },
  digit: { width: 32, height: 38, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: ink[900] },
  digitHidden: { backgroundColor: slate[100] },
  show: { height: 36, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: ink[900] },
});
