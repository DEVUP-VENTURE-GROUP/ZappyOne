// Times as people read them: 12-hour with AM/PM, India time.
export function clock12(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return hhmm || '';
  const h = Number(m[1]) % 24;
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

export const shiftHours = (s) => `${clock12(s.start)} – ${clock12(s.end)}`;

export function timeOf(date) {
  if (!date) return '';
  const d = new Date(new Date(date).getTime() + 330 * 60000);
  return clock12(`${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`);
}
