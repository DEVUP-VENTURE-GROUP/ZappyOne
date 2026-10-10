/**
 * The start code, the customer's proof that the right person is at the door
 * (the website's StartCodeCard): locked while they travel; on arrival "is your
 * pro with you?", then the digits (shown by itself after 90 s so a busy
 * customer is never stuck). The confirmation is remembered for the job.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { HelpCircle } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, Text } from '@zappy/ui/components';
import { zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { CodeReveal } from './CodeReveal';
import { LockedCode } from './LockedCode';

const REVEAL_AFTER_S = 90;

export function StartCodeCard({ jobKey, code, stage, noun }: { jobKey: string; code: string | null; stage: string; noun: string }) {
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
  if (stage !== 'arrived') return <LockedCode digits={String(code).length} title="Start code: locked" hint={`You'll see it when your ${noun} arrives`} />;
  if (!confirmed) {
    return (
      <View style={styles.ask}>
        <View style={styles.icon}><HelpCircle size={18} color={zappy[700]} /></View>
        <View style={styles.flex}>
          <Text variant="bodySmall" weight="black" color={zappy[800]}>Is your {noun} with you?</Text>
          <Text variant="caption" color={zappy[700]}>Confirm to see the start code · shows in {left}s</Text>
        </View>
        <Button label="Yes, show" size="small" onPress={confirm} />
      </View>
    );
  }
  return <CodeReveal code={code} title="Share this code to start" hint={`Only give it to your ${noun} in person. ZappyOne never asks for it.`} color={zappy[700]} />;
}

const styles = StyleSheet.create({
  ask: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: zappy[200], backgroundColor: zappy[50] },
  icon: { width: 40, height: 40, borderRadius: radius.large, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[100] },
  flex: { flex: 1, minWidth: 0 },
});

