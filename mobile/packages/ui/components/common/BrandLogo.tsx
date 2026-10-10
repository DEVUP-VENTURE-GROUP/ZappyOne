/**
 * A brand's mark, sized to be read (the websites' BrandLogo). With no logo, or
 * one that fails to load, the brand's initial stands in.
 */
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Text } from '..';
import { webAsset } from '../../lib/media';
import { ink, zappy } from '../../theme/colors';

export function BrandLogo({ name, url, active = false, height = 28 }: { name: string; url?: string | null; active?: boolean; height?: number }) {
  const [failed, setFailed] = useState(false);
  const src = webAsset(url);
  if (src && !failed) {
    return <Image source={{ uri: src }} onError={() => setFailed(true)} resizeMode="contain" style={{ height, width: '84%' }} accessibilityLabel={name} />;
  }
  return (
    <View style={[styles.initial, { height, width: height }, active && styles.initialOn]}>
      <Text variant="bodySmall" weight="black" color={active ? zappy[700] : ink[500]}>{name.trim().charAt(0).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  initial: { alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: '#F1F3F7' },
  initialOn: { backgroundColor: zappy[100] },
});
