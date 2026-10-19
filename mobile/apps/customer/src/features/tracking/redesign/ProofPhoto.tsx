/** One photo of the finished work (the website's ProofPhoto): a spinner while it loads, a plain note if it cannot, never a blank box. */
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { Skeleton, Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';

export function ProofPhoto({ url, index }: { url: string; index: number }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const uri = webAsset(url);
  if (!uri) return null;
  return (
    <View style={styles.tile}>
      {state === 'loading' ? <Skeleton height={9999} borderRadius={0} style={StyleSheet.absoluteFill} /> : null}
      {state === 'error' ? <View style={styles.center}><AlertCircle size={20} color={slate[300]} /><Text variant="caption" color={ink[400]}>Photo unavailable</Text></View> : null}
      <Image source={{ uri }} accessibilityLabel={`Work proof ${index + 1}`} style={[StyleSheet.absoluteFill, state !== 'loaded' && styles.hidden]}
        onLoad={() => setState('loaded')} onError={() => setState('error')} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, aspectRatio: 16 / 9, borderRadius: radius.medium, overflow: 'hidden', backgroundColor: slate[50] },
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 4 },
  hidden: { opacity: 0 },
});
