/** The festival's gold jhalar along a bar's edge (the website's jhalarCss edge), from the shared strip. */
import { useMemo } from 'react';
import { useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { jhalarStrip } from '@zappy/core/shared/season';

export function JhalarEdge({ color, flip = false, style }: { color: string; flip?: boolean; style?: StyleProp<ViewStyle> }) {
  const { width } = useWindowDimensions();
  const xml = useMemo(() => jhalarStrip(color, width, flip), [color, width, flip]);
  return <View pointerEvents="none" style={[{ height: 12, overflow: 'hidden' }, style]}><SvgXml xml={xml} height={12} /></View>;
}
