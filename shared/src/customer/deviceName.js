// What is being serviced, in words: brand and model once each, so a wash type whose only model is itself reads "Scooter", not "Scooter Scooter".
export function deviceName(brand, model) {
  const b = brand?.name || '';
  const m = model?.name || '';
  if (!m || m.toLowerCase().startsWith(b.toLowerCase())) return m || b;
  return [b, m].filter(Boolean).join(' ');
}
