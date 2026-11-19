import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// The pro's scan-to-pay QR on the collect card (shared CollectPaymentCard draws it through payQrSlot).
export default function PayQr({ value, size, label }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(value, { margin: 2, width: size * 2, color: { dark: '#101828', light: '#FFFFFF' } }).then((u) => live && setSrc(u)).catch(() => live && setSrc(null));
    return () => { live = false; };
  }, [value, size]);
  if (!src) return <div style={{ width: size, height: size }} className="shrink-0 animate-pulse rounded-lg bg-slate-100" aria-hidden="true" />;
  return <img src={src} alt={label} width={size} height={size} className="shrink-0 rounded-lg" />;
}
