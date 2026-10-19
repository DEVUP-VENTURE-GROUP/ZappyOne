/** An icon per catalog service, by the icon name the catalog stores (the websites' SERVICE_ICONS). */
import {
  AirVent, Baby, Flower2, Landmark, Package, Pill, ShoppingCart, Bike, Car, ClipboardCheck, Cpu, Droplet, Droplets, Footprints, HeartHandshake, Home, Laptop,
  PackageCheck, PartyPopper, PawPrint, Scissors, ShoppingBag, ShoppingBasket, Smartphone, Sparkles, Stethoscope,
  Truck, Users, Wrench, Zap, type LucideIcon,
} from 'lucide-react-native';

export const SERVICE_ICONS: Record<string, LucideIcon> = {
  Smartphone, Laptop, Cpu, Bike, Car, Truck, Home, HeartHandshake, Baby, Users,
  Zap, Droplet, Droplets, AirVent, Sparkles, Wrench,
  ClipboardCheck, Footprints, PackageCheck, PawPrint, Scissors, ShoppingBag, ShoppingBasket, Stethoscope, PartyPopper,
  ShoppingCart, Pill, Package, Landmark, Flower2,
};

export const serviceIcon = (name?: string | null): LucideIcon => (name && SERVICE_ICONS[name]) || Wrench;
