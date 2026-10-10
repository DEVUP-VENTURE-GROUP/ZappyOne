/** An icon per repair heading, the same set the websites use (LiveServices' CATEGORY_ICONS). */
import {
  ArrowUpCircle, Battery, Camera, CircuitBoard, Database, Droplet, Gauge, HardDrive, Keyboard, Monitor, Plug,
  ShieldAlert, Thermometer, Volume2, Wand2, Wifi, Wrench, type LucideIcon,
} from 'lucide-react-native';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  display: Monitor,
  battery_power: Battery,
  charging: Plug,
  keyboard_touchpad: Keyboard,
  body_hinge: Wrench,
  audio: Volume2,
  camera: Camera,
  storage: HardDrive,
  performance: Gauge,
  software: Wand2,
  connectivity: Wifi,
  overheating: Thermometer,
  advanced_hardware: CircuitBoard,
  liquid_damage: Droplet,
  liquid_advanced: Droplet,
  physical: ShieldAlert,
  data_recovery: Database,
  upgrade: ArrowUpCircle,
  maintenance: Wrench,
};
