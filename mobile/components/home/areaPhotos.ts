/**
 * Photos for the service areas (live-catalogue domains) on Home's
 * "Explore Services" grid. Pexels License — see assets/areas/CREDITS.md.
 *
 * An admin-uploaded `imageUrl` on the domain still wins; an area with neither
 * falls back to its 3D icon, so a new area never shows a blank tile.
 */

import type { ImageSourcePropType } from 'react-native';

const AREA_PHOTOS: Record<string, ImageSourcePropType> = {
  electronics: require('../../assets/areas/electronics.jpg'),
  home_daily_help: require('../../assets/areas/home_daily_help.jpg'),
  home_services: require('../../assets/areas/home_services.jpg'),
  vehicles: require('../../assets/areas/vehicles.jpg'),
  beauty_care: require('../../assets/areas/beauty_care.jpg'),
  errands_pickup: require('../../assets/areas/errands_pickup.jpg'),
  helping_services: require('../../assets/areas/helping_services.jpg'),
  family_assist: require('../../assets/areas/family_assist.jpg'),
  pet_services: require('../../assets/areas/pet_services.jpg'),
  specialist_home: require('../../assets/areas/specialist_home.jpg'),
  local_pros: require('../../assets/areas/local_pros.jpg'),
};

export function areaPhoto(code: string, imageUrl?: string): ImageSourcePropType | null {
  if (imageUrl && /^https:\/\//i.test(imageUrl)) return { uri: imageUrl };
  return AREA_PHOTOS[code] ?? null;
}
