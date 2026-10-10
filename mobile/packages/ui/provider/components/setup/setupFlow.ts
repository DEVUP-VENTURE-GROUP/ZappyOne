/**
 * The order of the services setup and the ways of working, as the websites'
 * ProviderRepairSetupPage defines them.
 *
 *   Brands → What you fix → Where → (Timings, shops only) → Prices
 */
import { Clock, IndianRupee, MapPin, Store, Wrench, type LucideIcon } from 'lucide-react-native';

export type SetupStep = 'brands' | 'work' | 'area' | 'hours' | 'pricing';
export interface StepDef { key: SetupStep; label: string; Icon: LucideIcon }

const BASE_STEPS: StepDef[] = [
  { key: 'brands', label: 'Brands', Icon: Store },
  { key: 'work', label: 'What you fix', Icon: Wrench },
  { key: 'area', label: 'Where', Icon: MapPin },
  { key: 'pricing', label: 'Prices', Icon: IndianRupee },
];

/** A shop states its opening hours; an independent technician has none to state. */
export function stepsFor(isShop: boolean): StepDef[] {
  if (!isShop) return BASE_STEPS;
  const at = BASE_STEPS.findIndex((s) => s.key === 'pricing');
  return [...BASE_STEPS.slice(0, at), { key: 'hours', label: 'Timings', Icon: Clock }, ...BASE_STEPS.slice(at)];
}

export const SERVICE_MODES = [
  { key: 'doorstep', label: 'At the customer', hint: 'You travel to them' },
  { key: 'workshop', label: 'At my workshop', hint: 'They come to you' },
  { key: 'pickup_repair', label: 'Pickup & return', hint: 'You collect and drop back' },
  { key: 'roadside', label: 'Roadside help', hint: 'You go to wherever the vehicle has stopped', vehiclesOnly: true },
];
/** Vehicles are also fixed where they broke down; nothing else is. */
const ROAD = new Set(['two_wheeler', 'four_wheeler']);
export const modesFor = (vertical: string) => SERVICE_MODES.filter((m) => !m.vehiclesOnly || ROAD.has(vertical));
/** Every way of working a skill may carry; the server keeps only what each repair allows. */
export const workModesFor = (vertical: string) => modesFor(vertical).map((m) => m.key);

export const VERTICAL_LABEL: Record<string, string> = {
  mobile: 'Phone repair', laptop: 'Laptop repair', two_wheeler: '2-wheeler repair', four_wheeler: '4-wheeler repair', water_tank_care: 'Water & tank care',
};
