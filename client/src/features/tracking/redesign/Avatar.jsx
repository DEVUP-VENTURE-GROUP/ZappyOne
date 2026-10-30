// Monogram for a pro without a photo: Ravi Kumar → RK.
export default function Avatar({ name, size = 44, radius = 14 }) {
  const words = (name || 'Pro').trim().split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toUpperCase();
  return (
    <span className="flex shrink-0 items-center justify-center bg-zappy-50 font-extrabold text-zappy-700"
      style={{ width: size, height: size, borderRadius: radius, fontSize: size * 0.36 }}>
      {initials}
    </span>
  );
}
