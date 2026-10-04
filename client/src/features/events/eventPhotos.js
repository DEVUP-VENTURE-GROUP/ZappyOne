import birthday from '@assets/images/events/event_birthday.webp';
import baby from '@assets/images/events/event_baby.webp';
import anniversary from '@assets/images/events/event_anniversary.webp';
import housewarming from '@assets/images/events/event_housewarming.webp';
import romantic from '@assets/images/events/event_romantic.webp';

/**
 * A photo for an event category until an admin uploads its own cover —
 * matched by name, so a new category picks the closest scene. One map for the
 * events pages and the home showcase.
 */
const RULES = [
  [/baby|gender|shower/, baby],
  [/anniversar|engage/, anniversary],
  [/romant|propos|date/, romantic],
  [/house|griha|corporate|office|farewell/, housewarming],
  [/birth|kid|party|graduat/, birthday],
];

export function eventPhoto(nameOrSlug = '') {
  const key = String(nameOrSlug).toLowerCase();
  return (RULES.find(([re]) => re.test(key)) || [null, birthday])[1];
}
