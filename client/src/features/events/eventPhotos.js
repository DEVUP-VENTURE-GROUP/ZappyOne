import birthday from '@assets/images/events/event_birthday.webp';
import baby from '@assets/images/events/event_baby.webp';
import anniversary from '@assets/images/events/event_anniversary.webp';
import housewarming from '@assets/images/events/event_housewarming.webp';
import romantic from '@assets/images/events/event_romantic.webp';

/**
 * The picture for an event occasion: the cover an admin uploaded (Admin →
 * Event commerce → Occasions), else our photo for that exact occasion, else
 * null. A photo is never borrowed: Engagement showing the anniversary photo
 * and Corporate showing the housewarming one read as the same option twice.
 * Without a picture, screens draw the occasion's own emoji tile instead.
 */
const RULES = [
  [/baby.?shower/, baby],
  [/anniversar/, anniversary],
  [/house.?warm|griha/, housewarming],
  [/romant/, romantic],
  [/^birthday/, birthday],
];

export function eventPhoto(occasion) {
  if (occasion && typeof occasion === 'object') {
    if (occasion.coverImage) return occasion.coverImage;
    return eventPhoto(occasion.slug || occasion.name);
  }
  const key = String(occasion || '').toLowerCase();
  return (RULES.find(([re]) => re.test(key)) || [null, null])[1];
}

/** A colour per occasion for its tile and hero, so tiles without a photo still differ. */
const TONES = ['from-pink-500 to-rose-400', 'from-sky-500 to-indigo-400', 'from-violet-500 to-fuchsia-400', 'from-amber-500 to-orange-400',
  'from-emerald-500 to-teal-400', 'from-rose-500 to-red-400', 'from-cyan-500 to-blue-400', 'from-lime-500 to-green-400'];
export function eventTone(occasion) {
  const key = String(occasion?.slug || occasion?.name || occasion || '');
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}
