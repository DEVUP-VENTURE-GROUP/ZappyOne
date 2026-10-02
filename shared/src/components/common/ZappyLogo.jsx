// From the global assets/ folder, bundled by every app. The mark is cropped to
// its edges on a transparent background (9KB), so it sits on any surface.
import markUrl from '@assets/web/branding/zappy-mark.webp';

/** The mark's URL, for places that animate its parts. */
export const ZAPPY_MARK = markUrl;

/**
 * Zappy brand marks.
 *
 * <ZappyLogo />     the symbol: the running Z with the orange location pin.
 *                   `size` is the box it fills, as before; the mark is drawn
 *                   at about three quarters of it, the way the old padded
 *                   file used to look, so no layout moves.
 * <ZappyWordmark /> the symbol with "ZappyOne": "Zappy" in the logo's blue,
 *                   "One" in its pin orange.
 * <ZappyAppIcon />  the rounded-square app-icon version with a background.
 */
export function ZappyLogo({ size = 48, className = '' }) {
  const h = Math.round(size * 0.75);
  return (
    <img
      src={markUrl}
      alt="ZappyOne"
      height={h}
      className={`object-contain ${className}`}
      style={{ height: h, width: 'auto' }}
    />
  );
}

export function ZappyWordmark({ size = 28, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <img src={markUrl} alt="" height={size} style={{ height: size, width: 'auto' }} />
      <span className="font-extrabold leading-none tracking-[-0.02em]" style={{ fontSize: Math.round(size * 0.68) }}>
        <span className="text-zappy-600">Zappy</span><span className="text-amber-500">One</span>
      </span>
    </span>
  );
}

export function ZappyAppIcon({ size = 56, variant = 'light', className = '' }) {
  const bg =
    variant === 'dark'  ? '#0F172A' :
    variant === 'blue'  ? '#2563EB' :
                          '#FFFFFF';
  return (
    <div
      className={`inline-flex items-center justify-center shadow-soft ${className}`}
      style={{
        width: size,
        height: size,
        background: bg,
        borderRadius: size * 0.22, // Apple-ish squircle-ish radius
        border: variant === 'light' ? '1px solid #F1F5F9' : 'none',
      }}
    >
      <ZappyLogo size={size * 0.72} />
    </div>
  );
}

export default ZappyLogo;
