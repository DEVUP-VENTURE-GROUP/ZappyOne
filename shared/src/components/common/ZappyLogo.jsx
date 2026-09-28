/**
 * Zappy brand marks.
 *
 * <ZappyLogo /> — the symbol mark only (the stylized running Z with the
 *                 orange location pin). Sized by the `size` prop.
 *
 * <ZappyWordmark /> — logo + "ZAPPY" text side-by-side (used in the nav bar).
 *
 * <ZappyAppIcon /> — the rounded-square app-icon version with a background
 *                    (light or dark variant).
 *
 * The design: three stylized speed lines on the left trailing a running
 * figure formed by the Z cross-stroke, with a location pin accent in the
 * brand orange. Entirely vector so it's crisp at any size.
 */

export function ZappyLogo({ size = 48, className = '' }) {
  return (
    <img
      src="/logo.png"
      alt="Zappy Logo"
      height={size}
      className={`object-contain ${className}`}
      style={{ height: size, width: 'auto' }}
    />
  );
}

export function ZappyWordmark({ compact = false, className = '' }) {
  return (
    <div className={`inline-flex items-center ${className}`}>
      <ZappyLogo size={compact ? 32 : 44} />
    </div>
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
