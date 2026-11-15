/**
 * 3D service icons — Microsoft Fluent Emoji 3D (MIT, see
 * assets/icons3d/LICENSE-fluentui-emoji.txt), bundled so they render offline
 * and identically on iOS and Android.
 *
 * Resolution order for any catalogue item (service line, service area, or an
 * order's job code):
 *   1. an admin-uploaded image (`imageUrl`) — the catalogue always wins
 *   2. its own code            (`mobile_repair` → phone)
 *   3. its lucide icon name    (`Scissors` → haircut)
 *   4. keywords in code / name (`ac_gas_refill` → snowflake)
 *   5. sparkles
 * so a service added in the admin tomorrow still gets a sensible icon.
 */

import React, { memo, useState } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

const ICONS = {
  alarm_clock: require('../../assets/icons3d/alarm_clock.png'),
  ant: require('../../assets/icons3d/ant.png'),
  balloon: require('../../assets/icons3d/balloon.png'),
  basket: require('../../assets/icons3d/basket.png'),
  bathtub: require('../../assets/icons3d/bathtub.png'),
  battery: require('../../assets/icons3d/battery.png'),
  bed: require('../../assets/icons3d/bed.png'),
  books: require('../../assets/icons3d/books.png'),
  broom: require('../../assets/icons3d/broom.png'),
  calendar: require('../../assets/icons3d/calendar.png'),
  camera: require('../../assets/icons3d/camera.png'),
  car: require('../../assets/icons3d/car.png'),
  cat: require('../../assets/icons3d/cat.png'),
  clipboard: require('../../assets/icons3d/clipboard.png'),
  couch: require('../../assets/icons3d/couch.png'),
  document: require('../../assets/icons3d/document.png'),
  dog_face: require('../../assets/icons3d/dog_face.png'),
  droplet: require('../../assets/icons3d/droplet.png'),
  gift: require('../../assets/icons3d/gift.png'),
  graduation_cap: require('../../assets/icons3d/graduation_cap.png'),
  guide_dog: require('../../assets/icons3d/guide_dog.png'),
  guitar: require('../../assets/icons3d/guitar.png'),
  handshake: require('../../assets/icons3d/handshake.png'),
  house: require('../../assets/icons3d/house.png'),
  house_garden: require('../../assets/icons3d/house_garden.png'),
  laptop: require('../../assets/icons3d/laptop.png'),
  lipstick: require('../../assets/icons3d/lipstick.png'),
  lock_key: require('../../assets/icons3d/lock_key.png'),
  lotus: require('../../assets/icons3d/lotus.png'),
  man_haircut: require('../../assets/icons3d/man_haircut.png'),
  massage: require('../../assets/icons3d/massage.png'),
  minibus: require('../../assets/icons3d/minibus.png'),
  mobile_phone: require('../../assets/icons3d/mobile_phone.png'),
  motorcycle: require('../../assets/icons3d/motorcycle.png'),
  package: require('../../assets/icons3d/package.png'),
  paintbrush: require('../../assets/icons3d/paintbrush.png'),
  paws: require('../../assets/icons3d/paws.png'),
  people_hugging: require('../../assets/icons3d/people_hugging.png'),
  plate: require('../../assets/icons3d/plate.png'),
  plug: require('../../assets/icons3d/plug.png'),
  poodle: require('../../assets/icons3d/poodle.png'),
  potable_water: require('../../assets/icons3d/potable_water.png'),
  potted_plant: require('../../assets/icons3d/potted_plant.png'),
  saw: require('../../assets/icons3d/saw.png'),
  scooter: require('../../assets/icons3d/scooter.png'),
  seedling: require('../../assets/icons3d/seedling.png'),
  shopping_bags: require('../../assets/icons3d/shopping_bags.png'),
  shopping_cart: require('../../assets/icons3d/shopping_cart.png'),
  snowflake: require('../../assets/icons3d/snowflake.png'),
  sparkles: require('../../assets/icons3d/sparkles.png'),
  sponge: require('../../assets/icons3d/sponge.png'),
  stethoscope: require('../../assets/icons3d/stethoscope.png'),
  store: require('../../assets/icons3d/store.png'),
  suv: require('../../assets/icons3d/suv.png'),
  toolbox: require('../../assets/icons3d/toolbox.png'),
  tools: require('../../assets/icons3d/tools.png'),
  tshirt: require('../../assets/icons3d/tshirt.png'),
  voltage: require('../../assets/icons3d/voltage.png'),
  weights: require('../../assets/icons3d/weights.png'),
  woman_haircut: require('../../assets/icons3d/woman_haircut.png'),
  wrench: require('../../assets/icons3d/wrench.png'),
} satisfies Record<string, ImageSourcePropType>;

export type Icon3DKey = keyof typeof ICONS;

/** Service areas (live-catalogue domains). */
const BY_DOMAIN: Record<string, Icon3DKey> = {
  electronics: 'laptop',
  home_daily_help: 'house',
  home_services: 'tools',
  vehicles: 'suv',
  beauty_care: 'massage',
  errands_pickup: 'scooter',
  helping_services: 'shopping_bags',
  family_assist: 'people_hugging',
  pet_services: 'paws',
  specialist_home: 'toolbox',
  local_pros: 'graduation_cap',
  events: 'balloon',
};

/** Service lines. */
const BY_CODE: Record<string, Icon3DKey> = {
  mobile_repair: 'mobile_phone',
  laptop_repair: 'laptop',
  bathroom_balcony: 'bathtub',
  home_organising: 'bed',
  dish_kitchen: 'plate',
  laundry_ironing: 'tshirt',
  plant_party: 'potted_plant',
  daily_cleaning: 'broom',
  water_tank_care: 'droplet',
  appliance_repair: 'wrench',
  carpentry: 'saw',
  locks_mounting: 'lock_key',
  ro_service: 'potable_water',
  two_wheeler: 'motorcycle',
  four_wheeler: 'car',
  roadside_help: 'battery',
  car_detailing: 'sponge',
  vehicle_pickup: 'clipboard',
  makeup_mehndi: 'lipstick',
  massage_wellness: 'lotus',
  mens_grooming: 'man_haircut',
  salon_home: 'woman_haircut',
  document_delivery: 'document',
  laundry_pickup: 'basket',
  shopping_pickup: 'shopping_cart',
  returns_exchange: 'package',
  household_help: 'handshake',
  pet_grooming: 'poodle',
  pet_boarding: 'house_garden',
  pet_walk: 'guide_dog',
  pet_home_care: 'cat',
  pet_transport: 'minibus',
  pet_vet_assist: 'stethoscope',
  pet_check: 'dog_face',
  appliance_install: 'plug',
  painting: 'paintbrush',
  pest_control: 'ant',
  sofa_mattress: 'couch',
  fitness_trainer: 'weights',
  home_tutor: 'books',
  music_teacher: 'guitar',
  photography: 'camera',
};

/** Lucide icon names the admin can set on a catalogue row. */
const BY_LUCIDE: Record<string, Icon3DKey> = {
  Smartphone: 'mobile_phone', Laptop: 'laptop', Bath: 'bathtub', BedDouble: 'bed', UtensilsCrossed: 'plate',
  Shirt: 'tshirt', Flower2: 'potted_plant', Sparkles: 'broom', Droplets: 'droplet', WashingMachine: 'wrench',
  Hammer: 'saw', KeyRound: 'lock_key', GlassWater: 'potable_water', Bike: 'motorcycle', Car: 'car',
  BatteryCharging: 'battery', ClipboardCheck: 'clipboard', Palette: 'lipstick', Leaf: 'lotus', Scissors: 'woman_haircut',
  Sparkle: 'woman_haircut', FileText: 'document', ShoppingBasket: 'shopping_cart', PackageCheck: 'package',
  Users: 'handshake', Home: 'house_garden', Footprints: 'guide_dog', HeartHandshake: 'cat', Stethoscope: 'stethoscope',
  Plug: 'plug', PaintRoller: 'paintbrush', Bug: 'ant', Sofa: 'couch', Dumbbell: 'weights', GraduationCap: 'books',
  Music: 'guitar', Camera: 'camera', Wrench: 'wrench', Zap: 'voltage', Snowflake: 'snowflake', Wind: 'snowflake',
  Truck: 'package', Gift: 'gift', PawPrint: 'paws', Store: 'store',
};

/** Last resort for codes nobody mapped — e.g. an order's job code (`ac_gas_refill`). */
const KEYWORDS: [RegExp, Icon3DKey][] = [
  [/(^|_|\b)ac(_|\b)|air.?condition|split|cool/i, 'snowflake'],
  [/fridge|refrigerat|washing|microwave|appliance|geyser|chimney/i, 'wrench'],
  [/electric|wiring|switch|fan|light|inverter|mcb/i, 'voltage'],
  [/plumb|tap|pipe|leak|drain|tank|water/i, 'potable_water'],
  [/screen|phone|mobile|battery_repl|charging/i, 'mobile_phone'],
  [/laptop|computer|keyboard|motherboard/i, 'laptop'],
  [/clean|mop|sweep|dust|wash/i, 'broom'],
  [/sofa|carpet|mattress/i, 'couch'],
  [/paint|wall/i, 'paintbrush'],
  [/pest|termite|cockroach|mosquito/i, 'ant'],
  [/car|four_wheel|tyre|puncture/i, 'car'],
  [/bike|two_wheel|scooter/i, 'motorcycle'],
  [/hair|salon|groom|beauty|facial|makeup/i, 'woman_haircut'],
  [/massage|spa|wellness|yoga/i, 'lotus'],
  [/pet|dog|cat/i, 'paws'],
  [/garden|plant/i, 'seedling'],
  [/carpent|furniture|door|wood/i, 'saw'],
  [/lock|key/i, 'lock_key'],
  [/deliver|pickup|courier|errand/i, 'scooter'],
  [/shop|grocery/i, 'shopping_cart'],
  [/event|party|birthday|decor/i, 'balloon'],
  [/move|mover|pack|shift/i, 'package'],
  [/tutor|teach|class/i, 'books'],
];

export function icon3dKey(item: { code?: string; icon?: string; name?: string; domainCode?: string } | null | undefined): Icon3DKey {
  if (!item) return 'sparkles';
  if (item.code && BY_CODE[item.code]) return BY_CODE[item.code];
  if (item.code && BY_DOMAIN[item.code]) return BY_DOMAIN[item.code];
  if (item.icon && BY_LUCIDE[item.icon]) return BY_LUCIDE[item.icon];
  const hay = `${item.code ?? ''} ${item.name ?? ''}`;
  for (const [re, key] of KEYWORDS) if (re.test(hay)) return key;
  if (item.domainCode && BY_DOMAIN[item.domainCode]) return BY_DOMAIN[item.domainCode];
  return 'sparkles';
}

export const icon3d = (key: Icon3DKey): ImageSourcePropType => ICONS[key];

/**
 * Pastel tile colours, one family per service area (top → bottom of a soft
 * vertical gradient), matching the reference Home's tiles.
 */
const PASTELS: Record<string, [string, string]> = {
  electronics: ['#F4F0FF', '#E9E1FF'],
  home_daily_help: ['#EEF5FF', '#DDEBFF'],
  home_services: ['#F3EEFF', '#E6DCFF'],
  vehicles: ['#EEF3FF', '#DCE6FF'],
  beauty_care: ['#FFF0F6', '#FDE0EC'],
  errands_pickup: ['#FFF6EA', '#FFE9CC'],
  helping_services: ['#ECFAF1', '#D7F3E2'],
  family_assist: ['#FFF0F1', '#FFDDE1'],
  pet_services: ['#FFF3EC', '#FFE3D3'],
  specialist_home: ['#EAF8FD', '#D3F0FA'],
  local_pros: ['#FFF8E6', '#FFEDBF'],
  events: ['#FFF0F1', '#FFDDE1'],
};
const DEFAULT_PASTEL: [string, string] = ['#F1EEFF', '#E4DEFF'];
export const pastelFor = (domainCode?: string): [string, string] =>
  (domainCode && PASTELS[domainCode]) || DEFAULT_PASTEL;

/**
 * A two-stop gradient drawn in SVG (no native gradient module needed). Sized
 * from the parent's measured layout: percentage-sized SVGs keep a stale size
 * on Android when the parent grows after first layout (wrapping text).
 */
export function GradientFill({ colors, radius = 0, horizontal = false, id }: {
  colors: [string, string]; radius?: number; horizontal?: boolean; id: string;
}) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none"
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        setBox((b) => (b && b.w === w && b.h === h ? b : { w, h }));
      }}>
      {box ? (
        <Svg width={box.w} height={box.h}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2={horizontal ? '1' : '0'} y2={horizontal ? '0' : '1'}>
              <Stop offset="0" stopColor={colors[0]} />
              <Stop offset="1" stopColor={colors[1]} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={box.w} height={box.h} rx={radius} ry={radius} fill={`url(#${id})`} />
        </Svg>
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors[0], borderRadius: radius }]} />
      )}
    </View>
  );
}

/**
 * A pastel rounded tile with the 3D icon centred in it. An admin-uploaded
 * `imageUrl` replaces the emoji (the catalogue is the source of truth).
 */
export const Icon3DTile = memo(function Icon3DTile({ iconKey, imageUrl, size, radius, pastel, iconScale = 0.66 }: {
  iconKey: Icon3DKey; imageUrl?: string; size: number; radius: number; pastel: [string, string]; iconScale?: number;
}) {
  const uploaded = Boolean(imageUrl && /^https:\/\//i.test(imageUrl));
  return (
    <View style={[st.tile, { width: size, height: size, borderRadius: radius }]}>
      <GradientFill colors={pastel} radius={radius} id={`t${iconKey}${pastel[0].slice(1)}`} />
      {uploaded ? (
        <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <Image source={ICONS[iconKey]} style={{ width: size * iconScale, height: size * iconScale }} resizeMode="contain" />
      )}
    </View>
  );
});

/** "More services" — the reference's four purple blobs, drawn rather than an emoji. */
export function MoreGlyph({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <LinearGradient id="moreA" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#A78BFA" />
          <Stop offset="1" stopColor="#6D28D9" />
        </LinearGradient>
        <LinearGradient id="moreB" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#C4B5FD" />
          <Stop offset="1" stopColor="#7C3AED" />
        </LinearGradient>
      </Defs>
      <Circle cx="13" cy="13" r="9" fill="url(#moreA)" />
      <Rect x="26" y="4" width="18" height="18" rx="6" fill="url(#moreB)" />
      <Circle cx="13" cy="35" r="9" fill="url(#moreB)" />
      <Circle cx="35" cy="35" r="9" fill="url(#moreA)" />
    </Svg>
  );
}

const st = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
