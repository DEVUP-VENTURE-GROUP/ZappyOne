/**
 * A plain icon for the kind of job, read from its vertical or service code
 * (the website's serviceVisual). Order matters: "four_wheeler" is checked
 * before the generic vehicle words.
 */
import { Bike, Car, Droplets, Laptop, PartyPopper, PawPrint, ShoppingBag, Smartphone, Tv, Wrench, type LucideIcon } from 'lucide-react-native';

const JOB_ICONS: [RegExp, LucideIcon][] = [
  [/four_wheeler|\bcar\b|car_|wash|detail|fuel|breakdown|van|fleet/, Car],
  [/two_wheeler|bike|puncture|chain|brake|scooter/, Bike],
  [/laptop/, Laptop],
  [/mobile|phone|screen|battery|charging|mic|speaker|camera|software|data_recovery/, Smartphone],
  [/water_tank|tank|sump/, Droplets],
  [/cctv|\btv\b|router|smart|home_automation|lock/, Tv],
  [/pet/, PawPrint],
  [/event|decor/, PartyPopper],
  [/helping|shopping|pickup|return|grocery|medicine/, ShoppingBag],
];

export const jobIcon = (code = ''): LucideIcon => JOB_ICONS.find(([re]) => re.test(code.toLowerCase()))?.[1] || Wrench;
