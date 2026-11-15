/**
 * Photos for individual services (live-catalogue service lines), used on the
 * All Services screen and Home's popular-services cards. Sources and licences:
 * assets/services/CREDITS.md.
 *
 * An admin-uploaded `imageUrl` on the service still wins; a service with
 * neither falls back to its 3D icon, so a new service never shows a blank tile.
 */

import type { ImageSourcePropType } from 'react-native';

const SERVICE_PHOTOS: Record<string, ImageSourcePropType> = {
  appliance_install: require('../../assets/services/appliance_install.jpg'),
  appliance_repair: require('../../assets/services/appliance_repair.jpg'),
  bathroom_balcony: require('../../assets/services/bathroom_balcony.jpg'),
  car_detailing: require('../../assets/services/car_detailing.jpg'),
  carpentry: require('../../assets/services/carpentry.jpg'),
  daily_cleaning: require('../../assets/services/daily_cleaning.jpg'),
  dish_kitchen: require('../../assets/services/dish_kitchen.jpg'),
  document_delivery: require('../../assets/services/document_delivery.jpg'),
  fitness_trainer: require('../../assets/services/fitness_trainer.jpg'),
  four_wheeler: require('../../assets/services/four_wheeler.jpg'),
  home_organising: require('../../assets/services/home_organising.jpg'),
  home_tutor: require('../../assets/services/home_tutor.jpg'),
  household_help: require('../../assets/services/household_help.jpg'),
  laptop_repair: require('../../assets/services/laptop_repair.jpg'),
  laundry_ironing: require('../../assets/services/laundry_ironing.jpg'),
  laundry_pickup: require('../../assets/services/laundry_pickup.jpg'),
  locks_mounting: require('../../assets/services/locks_mounting.jpg'),
  makeup_mehndi: require('../../assets/services/makeup_mehndi.jpg'),
  massage_wellness: require('../../assets/services/massage_wellness.jpg'),
  mens_grooming: require('../../assets/services/mens_grooming.jpg'),
  mobile_repair: require('../../assets/services/mobile_repair.jpg'),
  music_teacher: require('../../assets/services/music_teacher.jpg'),
  painting: require('../../assets/services/painting.jpg'),
  pest_control: require('../../assets/services/pest_control.jpg'),
  pet_boarding: require('../../assets/services/pet_boarding.jpg'),
  pet_check: require('../../assets/services/pet_check.jpg'),
  pet_grooming: require('../../assets/services/pet_grooming.jpg'),
  pet_home_care: require('../../assets/services/pet_home_care.jpg'),
  pet_transport: require('../../assets/services/pet_transport.jpg'),
  pet_vet_assist: require('../../assets/services/pet_vet_assist.jpg'),
  pet_walk: require('../../assets/services/pet_walk.jpg'),
  photography: require('../../assets/services/photography.jpg'),
  plant_party: require('../../assets/services/plant_party.jpg'),
  returns_exchange: require('../../assets/services/returns_exchange.jpg'),
  ro_service: require('../../assets/services/ro_service.jpg'),
  roadside_help: require('../../assets/services/roadside_help.jpg'),
  salon_home: require('../../assets/services/salon_home.jpg'),
  shopping_pickup: require('../../assets/services/shopping_pickup.jpg'),
  sofa_mattress: require('../../assets/services/sofa_mattress.jpg'),
  two_wheeler: require('../../assets/services/two_wheeler.jpg'),
  vehicle_pickup: require('../../assets/services/vehicle_pickup.jpg'),
  water_tank_care: require('../../assets/services/water_tank_care.jpg'),
};

export function servicePhoto(code: string, imageUrl?: string): ImageSourcePropType | null {
  if (imageUrl && /^https:\/\//i.test(imageUrl)) return { uri: imageUrl };
  return SERVICE_PHOTOS[code] ?? null;
}
