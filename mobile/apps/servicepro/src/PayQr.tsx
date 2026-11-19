// The pro's scan-to-pay QR on the collect card, drawn with react-native-svg (qrcode only computes the squares, so nothing native is added).
import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import QRCode from 'qrcode';
import type { PayQrProps } from '@zappy/ui/components/common/payQrSlot';

export function PayQr({ value, size, label }: PayQrProps) {
  const qr = useMemo(() => {
    try {
      const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
      const n = modules.size;
      let d = '';
      for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) if (modules.get(x, y)) d += `M${x + 4} ${y + 4}h1v1h-1z`;
      return { n: n + 8, d };
    } catch { return null; }
  }, [value]);
  if (!qr) return null;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={size} height={size} viewBox={`0 0 ${qr.n} ${qr.n}`}>
        <Rect width={qr.n} height={qr.n} fill="#FFFFFF" />
        <Path d={qr.d} fill="#101828" />
      </Svg>
    </View>
  );
}
