import { CheckCircle2 } from 'lucide-react';

/**
 * Monogram avatar with a small verified check.
 * Two-word names → first-of-first + first-of-last (Ravi Kumar → RK).
 */
export default function Avatar({ name, size = 44, radius = 14 }) {
  const words = (name || 'W').trim().split(/\s+/).filter(Boolean);
  const initials = (
    words.length > 1
      ? words[0][0] + words[words.length - 1][0]
      : (words[0] || 'W').slice(0, 2)
  ).toUpperCase();

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="w-full h-full flex items-center justify-center text-white font-black"
        style={{
          borderRadius: radius,
          background: 'linear-gradient(#F59E0B, #F59E0B)',
          fontSize: size * 0.38,
          boxShadow: '0 4px 10px -3px rgba(15,23,42,.3)',
        }}
      >
        {initials}
      </div>
      <span
        className="absolute -right-1 -bottom-1 rounded-full flex items-center justify-center"
        style={{
          width: size * 0.4,
          height: size * 0.4,
          background: '#2563FF',
          border: '2.5px solid #fff',
        }}
      >
        <CheckCircle2 size={size * 0.22} strokeWidth={3} className="text-white" />
      </span>
    </div>
  );
}
