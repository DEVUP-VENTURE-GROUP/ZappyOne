/**
 * Storefront illustration for Home's "Discover Local Stores on ZappyOne" card.
 * ----------------------------------------------------------------------------
 * Drawn in SVG rather than shipped as a bitmap so it stays crisp at every
 * screen density: a three-quarter view of a corner shop with a ZappyOne sign
 * board, a blue-and-white scalloped awning, a lit display window, the door, a
 * shopkeeper at the counter, and trees either side.
 *
 * Everything lives in a fixed 240 × 190 viewBox, so it scales by `width` alone
 * and avoids the percentage sizing that goes stale on Android. The sign's
 * wording is ordinary app text laid over the board: SVG text on Android ignores
 * the bundled Poppins and falls back to Roboto.
 * ----------------------------------------------------------------------------
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle, Defs, Ellipse, G, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop,
} from 'react-native-svg';
import { Text } from '../ui';

const VB_W = 240;
const VB_H = 190;

const BLUE = '#2F5BEA';
const WHITE = '#F7F9FF';
const FRAME = '#E9EDFA';

/** The sign board, in viewBox units — the overlaid wording is placed from this. */
const SIGN = { x: 62, y: 10, w: 138, h: 38 };

/** Awning geometry: a trapezoid that flares out over the shopfront. */
const AWN = { top: 64, bottom: 94, topL: 46, topR: 208, botL: 36, botR: 218, stripes: 9, scallop: 7 };

function awningStripes() {
  const out: React.ReactElement[] = [];
  const topW = (AWN.topR - AWN.topL) / AWN.stripes;
  const botW = (AWN.botR - AWN.botL) / AWN.stripes;
  for (let i = 0; i < AWN.stripes; i++) {
    const fill = i % 2 === 0 ? BLUE : WHITE;
    const t0 = AWN.topL + i * topW;
    const b0 = AWN.botL + i * botW;
    const b1 = b0 + botW;
    out.push(
      <Polygon key={`s${i}`} points={`${t0},${AWN.top} ${t0 + topW},${AWN.top} ${b1},${AWN.bottom} ${b0},${AWN.bottom}`} fill={fill} />,
      // The scalloped hem: one half-ellipse under each stripe.
      <Path key={`h${i}`} d={`M${b0},${AWN.bottom} A${botW / 2},${AWN.scallop} 0 0 0 ${b1},${AWN.bottom} Z`} fill={fill} />,
    );
  }
  return out;
}

/** A round tree: trunk plus three overlapping leaf balls and a highlight. */
function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <G>
      <Rect x={x - 2.5 * s} y={y} width={5 * s} height={44 * s} rx={2} fill="#7A4E2D" />
      <Circle cx={x - 8 * s} cy={y + 8 * s} r={10 * s} fill="url(#sfLeafDark)" />
      <Circle cx={x + 9 * s} cy={y + 6 * s} r={11 * s} fill="url(#sfLeafDark)" />
      <Circle cx={x} cy={y - 6 * s} r={15 * s} fill="url(#sfLeaf)" />
      <Circle cx={x - 5 * s} cy={y - 12 * s} r={5 * s} fill="#9BE59F" opacity={0.55} />
    </G>
  );
}

function Bush({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <G>
      <Circle cx={x - r * 0.7} cy={y + 1} r={r * 0.75} fill="url(#sfLeafDark)" />
      <Circle cx={x + r * 0.7} cy={y + 1} r={r * 0.7} fill="url(#sfLeafDark)" />
      <Circle cx={x} cy={y - r * 0.35} r={r} fill="url(#sfLeaf)" />
    </G>
  );
}

export function StorefrontArt({ width }: { width: number }) {
  const height = (width * VB_H) / VB_W;
  const k = width / VB_W;
  return (
    <View style={{ width, height }} accessible={false} importantForAccessibility="no-hide-descendants">
    <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      <Defs>
        <LinearGradient id="sfFront" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#56669F" />
          <Stop offset="1" stopColor="#3E4C82" />
        </LinearGradient>
        <LinearGradient id="sfSide" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#262F5C" />
          <Stop offset="1" stopColor="#333F72" />
        </LinearGradient>
        <LinearGradient id="sfSign" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4877FF" />
          <Stop offset="1" stopColor="#2447D6" />
        </LinearGradient>
        <LinearGradient id="sfDoor" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3F6DFF" />
          <Stop offset="1" stopColor="#2343C6" />
        </LinearGradient>
        <LinearGradient id="sfWarm" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF3D1" />
          <Stop offset="1" stopColor="#FFC66E" />
        </LinearGradient>
        <LinearGradient id="sfCool" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#EEF3FF" />
          <Stop offset="1" stopColor="#BCCDF6" />
        </LinearGradient>
        <LinearGradient id="sfAwnShade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#14205A" stopOpacity={0} />
          <Stop offset="1" stopColor="#14205A" stopOpacity={0.14} />
        </LinearGradient>
        <RadialGradient id="sfLeaf" cx="0.38" cy="0.32" r="0.75">
          <Stop offset="0" stopColor="#8EDC85" />
          <Stop offset="1" stopColor="#3C9C4C" />
        </RadialGradient>
        <RadialGradient id="sfLeafDark" cx="0.4" cy="0.35" r="0.75">
          <Stop offset="0" stopColor="#6CC56E" />
          <Stop offset="1" stopColor="#2F8240" />
        </RadialGradient>
      </Defs>

      {/* Ground shadow */}
      <Ellipse cx={128} cy={176} rx={108} ry={8} fill="#1B2A6B" opacity={0.12} />

      {/* Building: side wall, front wall, plinth */}
      <Polygon points="32,72 52,64 52,172 32,166" fill="url(#sfSide)" />
      <Rect x={52} y={64} width={152} height={108} fill="url(#sfFront)" />
      <Polygon points="32,160 52,163 52,172 32,166" fill="#1F2850" />
      <Rect x={52} y={163} width={152} height={9} fill="#2C3866" />

      {/* Cornice */}
      <Polygon points="28,64 48,55 48,65 28,74" fill="#1F2852" />
      <Rect x={48} y={55} width={160} height={10} rx={2} fill="#2B366A" />
      <Rect x={48} y={55} width={160} height={2} rx={1} fill="#6576B4" />

      {/* Sign board on two posts, with depth */}
      <Rect x={84} y={46} width={4} height={10} fill="#1B2350" />
      <Rect x={170} y={46} width={4} height={10} fill="#1B2350" />
      <Rect x={58} y={13} width={138} height={38} rx={7} fill="#1A2F99" />
      <Rect x={SIGN.x} y={SIGN.y} width={SIGN.w} height={SIGN.h} rx={7} fill="url(#sfSign)" stroke="#FFFFFF" strokeWidth={2.5} />
      <Rect x={68} y={14} width={126} height={6} rx={3} fill="#FFFFFF" opacity={0.14} />

      {/* Shadow cast by the awning onto the wall */}
      <Rect x={52} y={98} width={152} height={8} fill="#1E2754" opacity={0.35} />

      {/* Awning: side flap, stripes + scalloped hem, shading */}
      <Polygon points="30,74 46,64 36,94 24,100" fill="#2142BE" />
      {awningStripes()}
      <Polygon points={`${AWN.topL},${AWN.top} ${AWN.topR},${AWN.top} ${AWN.botR},${AWN.bottom} ${AWN.botL},${AWN.bottom}`} fill="url(#sfAwnShade)" />
      <Rect x={AWN.topL} y={AWN.top} width={AWN.topR - AWN.topL} height={3} fill="#14205A" opacity={0.35} />

      {/* Left display window: warm light, stocked shelves */}
      <Rect x={60} y={110} width={46} height={40} rx={3} fill={FRAME} />
      <Rect x={63} y={113} width={40} height={34} fill="url(#sfWarm)" />
      <Rect x={63} y={124} width={40} height={2} fill="#D3923A" />
      <Rect x={63} y={136} width={40} height={2} fill="#D3923A" />
      <Rect x={66} y={117} width={6} height={7} rx={1} fill="#F05A5A" />
      <Rect x={74} y={118} width={5} height={6} rx={1} fill="#4F7BFF" />
      <Rect x={88} y={116} width={7} height={8} rx={1} fill="#46B76A" />
      <Rect x={67} y={129} width={7} height={7} rx={1} fill="#FF9F43" />
      <Rect x={86} y={130} width={5} height={6} rx={1} fill="#A66BFA" />
      <Rect x={93} y={129} width={6} height={7} rx={1} fill="#F05A5A" />
      <Rect x={82} y={113} width={2} height={34} fill={FRAME} />
      {/* Flower box under it */}
      <Bush x={70} y={150} r={5} />
      <Bush x={94} y={150} r={5} />
      <Rect x={58} y={150} width={50} height={8} rx={2} fill="#8A5A3B" />

      {/* Door with glass panel and step */}
      <Rect x={114} y={106} width={30} height={57} rx={3} fill={FRAME} />
      <Rect x={117} y={109} width={24} height={54} fill="url(#sfDoor)" />
      <Rect x={121} y={113} width={16} height={22} rx={2} fill="#C7D7FF" opacity={0.92} />
      <Circle cx={137} cy={142} r={1.8} fill="#FFD166" />
      <Rect x={110} y={163} width={38} height={5} rx={1.5} fill="#C9D1EA" />

      {/* Right window: the shopkeeper behind a counter */}
      <Rect x={152} y={110} width={44} height={40} rx={3} fill={FRAME} />
      <Rect x={155} y={113} width={38} height={34} fill="url(#sfCool)" />
      <Path d="M166,147 v-9 a8,8 0 0 1 16,0 v9 Z" fill="#F4A340" />
      <Circle cx={174} cy={128} r={5.5} fill="#F1C097" />
      <Path d="M168.5,127 a5.5,5.5 0 0 1 11,0 q-5.5,-2.5 -11,0 Z" fill="#3A2A20" />
      {/* Front counter */}
      <Rect x={148} y={146} width={54} height={19} rx={2} fill="#F2D7AE" />
      <Rect x={146} y={143} width={58} height={5} rx={1.5} fill="#E1B074" />
      <Rect x={161} y={149} width={1.5} height={14} fill="#E1B074" />
      <Rect x={175} y={149} width={1.5} height={14} fill="#E1B074" />
      <Rect x={189} y={149} width={1.5} height={14} fill="#E1B074" />

      {/* Greenery */}
      <Tree x={18} y={124} />
      <Tree x={222} y={128} s={0.9} />
      <Bush x={40} y={168} r={7} />
      <Bush x={208} y={168} r={7} />
    </Svg>
      <View pointerEvents="none" style={[styles.sign, { left: SIGN.x * k, top: SIGN.y * k, width: SIGN.w * k, height: SIGN.h * k }]}>
        <Text weight="bold" color="#FFFFFF" numberOfLines={1} allowFontScaling={false}
          style={{ fontSize: 20 * k, lineHeight: 26 * k, includeFontPadding: false }}>
          ZappyOne
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sign: { position: 'absolute', alignItems: 'center', justifyContent: 'center', paddingTop: 1 },
});
