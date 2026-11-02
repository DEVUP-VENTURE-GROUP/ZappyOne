/**
 * The picture for an event occasion: the cover an admin uploaded (Admin →
 * Event commerce → Occasions), else our photo for that exact occasion, else
 * null. A photo is never borrowed: Engagement showing the anniversary photo
 * and Corporate showing the housewarming one read as the same option twice.
 * Without a picture, screens show the occasion as a plain name chip.
 *
 * Photos live in the global assets folder (assets/web/occasions, served at
 * /occasions on every website), so the apps load the same files.
 */
const RULES = [
  [/baby.?shower/, '/occasions/event_baby.webp'],
  [/anniversar/, '/occasions/event_anniversary.webp'],
  [/house.?warm|griha/, '/occasions/event_housewarming.webp'],
  [/romant/, '/occasions/event_romantic.webp'],
  [/^birthday/, '/occasions/event_birthday.webp'],
];

export function eventPhoto(occasion) {
  if (occasion && typeof occasion === 'object') {
    if (occasion.coverImage) return occasion.coverImage;
    return eventPhoto(occasion.slug || occasion.name);
  }
  const key = String(occasion || '').toLowerCase();
  return (RULES.find(([re]) => re.test(key)) || [null, null])[1];
}
