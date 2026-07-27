import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, MapPin, FileText, CreditCard, ChevronRight,
  Loader2, Zap, TrendingUp, Users, CheckCircle, Calendar,
  Clock, Image as ImageIcon, X, Plus, Sparkles, Wrench,
  Droplets, Bolt, Hammer, Car, Star,
  Layers, Ticket, Tag, Smartphone, Battery,
  Bike, Fuel, ShieldCheck, Navigation, AlertTriangle, Flame, Lock,
  Camera, Tv, Wifi, Heart, Dog, ShieldAlert, Cpu, MonitorSmartphone,
  Laptop, Wind,
} from 'lucide-react';
import LocationPicker from '../modules/booking/LocationPicker';
import PhoneDiagnosticWizard from '../modules/booking/PhoneDiagnosticWizard';
import SmartPricingPanel from '../components/booking/SmartPricingPanel';
import BookingMapView from '../components/booking/BookingMapView';
import SurgeInfoCard from '../components/booking/SurgeInfoCard';
import DiagnosisFlow from '../components/booking/DiagnosisFlow';
import ProPicker from '../components/booking/ProPicker';
import InstantMatchBadge from '../components/booking/InstantMatchBadge';
import {
  useLazyGetQuoteQuery, useCreateOrderMutation,
  usePresignUploadMutation, useLazyGetNearbyWorkersQuery,
  useValidatePromoMutation, useLazyGetSurgeInfoQuery,
  useGetPricingConfigQuery, useLazyGetLensScanQuery,
} from '../services/api';
import PageTransition from '../components/common/PageTransition';
import { staggerContainer, fadeInUp } from '../lib/animations';
import { trackSearch } from '../hooks/useTelemetry';
import toast from 'react-hot-toast';
import SEO, { SERVICE_META as SEO_SERVICE_META, buildServiceJsonLd, BASE_URL } from '../components/SEO';

// ─── Vertical classification (mirrors server pricing.service.js) ─────────────
const MOBILE_SERVICES = new Set([
  'screen_replacement','battery_replacement','charging_issue',
  'speaker_mic_issue','microphone_issue','software_issue',
  'water_damage','camera_issue','data_recovery','device_not_turning_on',
]);
const LAPTOP_SERVICES = new Set([
  'laptop_slow','laptop_ssd_upgrade','laptop_ram_upgrade','laptop_keyboard_issue',
  'laptop_motherboard_issue','laptop_charging_issue','laptop_screen_issue',
  'laptop_virus_removal','laptop_data_recovery',
]);
const SMART_DEVICE_SERVICES = new Set([
  'smart_tv_install','smart_tv_repair','router_setup','router_troubleshoot',
  'cctv_install','cctv_repair','smart_lock_install','home_automation_setup',
]);
const VEHICLE_SERVICES = new Set([
  'puncture','bike_chain_issue','bike_brake_issue','bike_battery_issue',
  'bike_wash','bike_breakdown','bike_service',
  'car_wash','car_detailing','battery_jump_start','car_puncture',
  'car_breakdown','fuel_delivery','car_service',
  'commercial_emergency','commercial_scheduled_maintenance','fleet_support','auto_repair','van_repair',
]);
const FAMILY_SERVICES = new Set([
  'medicine_pickup','hospital_companion','grocery_assistance',
  'bill_payment_assist','document_submission','home_visit_check',
  'elder_doctor_visit','elder_companion','elder_home_visit','elder_transport',
]);
const EVENT_SERVICES = new Set([
  'event_decorator','event_setup_crew','event_cleaning_crew','event_helper',
  'event_sound_crew','event_lighting_crew','event_security_crew',
  'event_birthday_setup','event_wedding_setup','event_photography_assist','event_catering_assist',
]);
const PET_SERVICES = new Set([
  'pet_grooming','pet_walking','pet_transport','pet_sitting','pet_vet_assist','pet_training_assist',
]);

const SERVICE_META = {
  // ── Electronics — Mobile ──────────────────────────────────────────────────
  screen_replacement:    { label: 'Screen Replacement',   icon: Smartphone,    gradient: 'from-indigo-500 to-violet-600',  accent: '#6366f1', vertical: 'mobile'       },
  battery_replacement:   { label: 'Battery Replacement',  icon: Battery,       gradient: 'from-emerald-500 to-green-600',  accent: '#10b981', vertical: 'mobile'       },
  charging_issue:        { label: 'Charging Issue',       icon: Bolt,          gradient: 'from-yellow-400 to-orange-500',  accent: '#f59e0b', vertical: 'mobile'       },
  speaker_mic_issue:     { label: 'Speaker / Mic',        icon: Layers,        gradient: 'from-purple-500 to-violet-600',  accent: '#8b5cf6', vertical: 'mobile'       },
  microphone_issue:      { label: 'Microphone Repair',    icon: Layers,        gradient: 'from-violet-500 to-purple-600',  accent: '#7c3aed', vertical: 'mobile'       },
  software_issue:        { label: 'Software Fix',         icon: Wrench,        gradient: 'from-rose-400 to-red-500',       accent: '#ef4444', vertical: 'mobile'       },
  water_damage:          { label: 'Water Damage',         icon: Droplets,      gradient: 'from-blue-400 to-cyan-500',      accent: '#0ea5e9', vertical: 'mobile'       },
  camera_issue:          { label: 'Camera Repair',        icon: Camera,        gradient: 'from-pink-500 to-rose-600',      accent: '#ec4899', vertical: 'mobile'       },
  data_recovery:         { label: 'Data Recovery',        icon: Layers,        gradient: 'from-teal-500 to-emerald-600',   accent: '#14b8a6', vertical: 'mobile'       },
  device_not_turning_on: { label: 'Device Not Turning On',icon: Smartphone,    gradient: 'from-slate-600 to-slate-800',    accent: '#475569', vertical: 'mobile'       },
  // ── Electronics — Laptop ─────────────────────────────────────────────────
  laptop_slow:             { label: 'Slow Laptop Fix',    icon: Laptop,        gradient: 'from-slate-600 to-slate-800',    accent: '#475569', vertical: 'laptop'       },
  laptop_ssd_upgrade:      { label: 'SSD Upgrade',        icon: Cpu,           gradient: 'from-blue-600 to-indigo-700',    accent: '#2563eb', vertical: 'laptop'       },
  laptop_ram_upgrade:      { label: 'RAM Upgrade',        icon: Cpu,           gradient: 'from-indigo-500 to-blue-600',    accent: '#4f46e5', vertical: 'laptop'       },
  laptop_keyboard_issue:   { label: 'Keyboard Repair',    icon: Laptop,        gradient: 'from-amber-500 to-orange-600',   accent: '#f59e0b', vertical: 'laptop'       },
  laptop_motherboard_issue:{ label: 'Motherboard Repair', icon: Cpu,           gradient: 'from-red-600 to-rose-700',       accent: '#dc2626', vertical: 'laptop'       },
  laptop_charging_issue:   { label: 'Laptop Charging',    icon: Bolt,          gradient: 'from-amber-400 to-orange-500',   accent: '#f59e0b', vertical: 'laptop'       },
  laptop_screen_issue:     { label: 'Laptop Screen',      icon: MonitorSmartphone, gradient: 'from-violet-500 to-purple-700', accent: '#7c3aed', vertical: 'laptop'    },
  laptop_virus_removal:    { label: 'Virus Removal',      icon: ShieldAlert,   gradient: 'from-red-500 to-rose-700',       accent: '#ef4444', vertical: 'laptop'       },
  laptop_data_recovery:    { label: 'Laptop Data Recovery',icon: Layers,       gradient: 'from-emerald-500 to-teal-700',   accent: '#10b981', vertical: 'laptop'       },
  // ── Smart Devices ─────────────────────────────────────────────────────────
  smart_tv_install:      { label: 'Smart TV Install',     icon: Tv,            gradient: 'from-slate-700 to-slate-900',    accent: '#334155', vertical: 'smart_device' },
  smart_tv_repair:       { label: 'Smart TV Repair',      icon: Tv,            gradient: 'from-red-600 to-rose-700',       accent: '#dc2626', vertical: 'smart_device' },
  router_setup:          { label: 'Router & WiFi Setup',  icon: Wifi,          gradient: 'from-blue-500 to-cyan-600',      accent: '#0ea5e9', vertical: 'smart_device' },
  router_troubleshoot:   { label: 'WiFi Fix',             icon: Wifi,          gradient: 'from-sky-500 to-blue-600',       accent: '#0284c7', vertical: 'smart_device' },
  cctv_install:          { label: 'CCTV Install',         icon: Camera,        gradient: 'from-stone-600 to-stone-800',    accent: '#78716c', vertical: 'smart_device' },
  cctv_repair:           { label: 'CCTV Repair',          icon: Camera,        gradient: 'from-amber-600 to-orange-700',   accent: '#d97706', vertical: 'smart_device' },
  smart_lock_install:    { label: 'Smart Lock Install',   icon: Lock,          gradient: 'from-indigo-600 to-violet-700',  accent: '#4f46e5', vertical: 'smart_device' },
  home_automation_setup: { label: 'Home Automation',      icon: Zap,           gradient: 'from-amber-500 to-orange-600',   accent: '#f59e0b', vertical: 'smart_device' },
  // ── Vehicle Care ──────────────────────────────────────────────────────────
  // ── Vehicle Care (Car & Bike) ───────────────────────────────────────────────
  car_puncture:          { label: 'Car Tyre Puncture',     icon: Car,          gradient: 'from-slate-600 to-slate-800',    accent: '#475569', vertical: 'vehicle'      },
  bike_puncture:         { label: 'Bike Tyre Puncture',    icon: Bike,         gradient: 'from-emerald-500 to-teal-600',   accent: '#059669', vertical: 'vehicle'      },
  periodic_car_service:  { label: 'Periodic Car Service',  icon: Wrench,       gradient: 'from-blue-600 to-indigo-700',    accent: '#2563eb', vertical: 'vehicle'      },
  car_foam_wash_detailing:{ label: 'Car Wash & Detailing', icon: Sparkles,     gradient: 'from-indigo-500 to-violet-600',  accent: '#6366f1', vertical: 'vehicle'      },
  car_ac_gas_refill:     { label: 'Car AC Gas Refill',     icon: Wind,         gradient: 'from-sky-500 to-blue-600',       accent: '#0ea5e9', vertical: 'vehicle'      },
  car_battery_replacement:{ label: 'Car Battery Fitting',  icon: Battery,      gradient: 'from-amber-500 to-orange-600',   accent: '#f59e0b', vertical: 'vehicle'      },
  bike_periodic_service: { label: 'Bike Full Engine Service',icon: Bike,       gradient: 'from-emerald-600 to-teal-700',   accent: '#059669', vertical: 'vehicle'      },
  bike_foam_wash:        { label: 'Bike Foam Wash',        icon: Bike,         gradient: 'from-teal-500 to-cyan-600',      accent: '#14b8a6', vertical: 'vehicle'      },
  bike_chain_issue:      { label: 'Bike Chain Issue',      icon: Bike,         gradient: 'from-amber-500 to-orange-600',   accent: '#f59e0b', vertical: 'vehicle'      },
  bike_brake_issue:      { label: 'Bike Brake Repair',     icon: Bike,         gradient: 'from-red-500 to-rose-600',       accent: '#ef4444', vertical: 'vehicle'      },
  bike_battery_issue:    { label: 'Bike Battery Issue',    icon: Battery,      gradient: 'from-emerald-500 to-green-600',  accent: '#10b981', vertical: 'vehicle'      },
  bike_wash:             { label: 'Bike Wash',             icon: Bike,         gradient: 'from-cyan-400 to-blue-500',      accent: '#0ea5e9', vertical: 'vehicle'      },
  bike_breakdown:        { label: 'Bike Breakdown',        icon: AlertTriangle, gradient: 'from-orange-500 to-red-500',    accent: '#f97316', vertical: 'vehicle'      },
  bike_service:          { label: 'Bike Full Service',     icon: Wrench,       gradient: 'from-violet-500 to-purple-600',  accent: '#8b5cf6', vertical: 'vehicle'      },
  car_wash:              { label: 'Car Wash',              icon: Car,          gradient: 'from-sky-500 to-blue-600',       accent: '#3b82f6', vertical: 'vehicle'      },
  car_detailing:         { label: 'Car Detailing',         icon: Sparkles,     gradient: 'from-indigo-500 to-violet-600',  accent: '#6366f1', vertical: 'vehicle'      },
  battery_jump_start:    { label: 'Battery Jump Start',    icon: Zap,          gradient: 'from-yellow-500 to-amber-600',   accent: '#f59e0b', vertical: 'vehicle'      },
  car_breakdown:         { label: 'Car Breakdown',         icon: AlertTriangle, gradient: 'from-red-500 to-rose-600',      accent: '#ef4444', vertical: 'vehicle'      },
  fuel_delivery:         { label: 'Fuel Delivery',         icon: Fuel,         gradient: 'from-orange-500 to-red-500',     accent: '#f97316', vertical: 'vehicle'      },
  car_service:           { label: 'Car Full Service',      icon: Wrench,       gradient: 'from-blue-600 to-indigo-700',    accent: '#2563eb', vertical: 'vehicle'      },
  car_towing:            { label: 'Car Towing',            icon: Car,          gradient: 'from-slate-700 to-slate-900',    accent: '#334155', vertical: 'towing'       },
  bike_towing:           { label: 'Bike Towing',           icon: Bike,         gradient: 'from-slate-600 to-slate-800',    accent: '#475569', vertical: 'towing'       },
  // ── Laptop Repair ──────────────────────────────────────────────────────────
  laptop_screen_replacement: { label: 'Laptop Display Panel', icon: Laptop,    gradient: 'from-cyan-500 to-blue-600',      accent: '#0891b2', vertical: 'laptop'       },
  laptop_battery_replacement:{ label: 'Laptop Battery Replacement', icon: Battery, gradient: 'from-indigo-500 to-purple-600', accent: '#6366f1', vertical: 'laptop' },
  laptop_keyboard_repair:    { label: 'Laptop Keyboard Repair', icon: Laptop,  gradient: 'from-slate-600 to-slate-800',    accent: '#475569', vertical: 'laptop'       },
  laptop_thermal_service:    { label: 'Laptop Thermal Cleaning', icon: Wind,   gradient: 'from-teal-500 to-emerald-600',   accent: '#14b8a6', vertical: 'laptop'       },
  laptop_ssd_ram_upgrade:    { label: 'SSD & RAM Upgrade',     icon: Zap,          gradient: 'from-amber-500 to-orange-600',   accent: '#f59e0b', vertical: 'laptop'       },
  // ── Tank & Water Cleaning ────────────────────────────────────────────────
  water_tank_cleaning:       { label: 'Water Tank Cleaning',       icon: Droplets, gradient: 'from-sky-500 to-blue-600',    accent: '#0ea5e9', vertical: 'tank_cleaning' },
  overhead_tank_cleaning:    { label: 'Overhead Tank Cleaning',    icon: Droplets, gradient: 'from-cyan-500 to-sky-600',    accent: '#06b6d4', vertical: 'tank_cleaning' },
  underground_sump_cleaning: { label: 'Underground Sump Cleaning', icon: Droplets, gradient: 'from-blue-600 to-indigo-700', accent: '#2563eb', vertical: 'tank_cleaning' },
  sintex_tank_cleaning:      { label: 'Sintex Tank Cleaning',      icon: Droplets, gradient: 'from-teal-500 to-cyan-600',   accent: '#14b8a6', vertical: 'tank_cleaning' },
  commercial_emergency:  { label: 'Commercial Emergency',  icon: AlertTriangle, gradient: 'from-red-600 to-rose-700',      accent: '#dc2626', vertical: 'vehicle'      },
  commercial_scheduled_maintenance: { label: 'Fleet Maintenance', icon: Wrench, gradient: 'from-slate-600 to-slate-800',  accent: '#475569', vertical: 'vehicle'      },
  fleet_support:         { label: 'Fleet Support',         icon: Car,          gradient: 'from-indigo-600 to-blue-700',    accent: '#4f46e5', vertical: 'vehicle'      },
  auto_repair:           { label: 'Auto Repair',           icon: Wrench,       gradient: 'from-amber-500 to-orange-600',   accent: '#f59e0b', vertical: 'vehicle'      },
  van_repair:            { label: 'Van Repair',            icon: Car,          gradient: 'from-stone-600 to-stone-800',    accent: '#78716c', vertical: 'vehicle'      },
  // ── Family Assist ─────────────────────────────────────────────────────────
  medicine_pickup:       { label: 'Medicine Pickup',       icon: Heart,        gradient: 'from-rose-500 to-pink-600',      accent: '#f43f5e', vertical: 'family'       },
  hospital_companion:    { label: 'Hospital Companion',    icon: ShieldCheck,  gradient: 'from-blue-500 to-indigo-600',    accent: '#3b82f6', vertical: 'family'       },
  grocery_assistance:    { label: 'Grocery Shopping',      icon: Users,        gradient: 'from-green-500 to-emerald-600',  accent: '#10b981', vertical: 'family'       },
  bill_payment_assist:   { label: 'Bill Payment Assist',   icon: CheckCircle,  gradient: 'from-teal-500 to-cyan-600',      accent: '#14b8a6', vertical: 'family'       },
  document_submission:   { label: 'Document Submission',   icon: CheckCircle,  gradient: 'from-violet-500 to-purple-600',  accent: '#8b5cf6', vertical: 'family'       },
  home_visit_check:      { label: 'Home Visit Check',      icon: ShieldCheck,  gradient: 'from-indigo-500 to-blue-600',    accent: '#6366f1', vertical: 'family'       },
  elder_doctor_visit:    { label: 'Elder Doctor Visit',    icon: Heart,        gradient: 'from-red-500 to-rose-600',       accent: '#ef4444', vertical: 'family'       },
  elder_companion:       { label: 'Elder Companion',       icon: Users,        gradient: 'from-purple-500 to-violet-600',  accent: '#8b5cf6', vertical: 'family'       },
  elder_home_visit:      { label: 'Elder Home Visit',      icon: ShieldCheck,  gradient: 'from-teal-500 to-emerald-600',   accent: '#14b8a6', vertical: 'family'       },
  elder_transport:       { label: 'Elder Transport',       icon: Car,          gradient: 'from-blue-500 to-indigo-600',    accent: '#3b82f6', vertical: 'family'       },
  // ── Event Crew ────────────────────────────────────────────────────────────
  event_decorator:           { label: 'Event Decorator',      icon: Sparkles,  gradient: 'from-violet-500 to-purple-600',  accent: '#8b5cf6', vertical: 'event'        },
  event_setup_crew:          { label: 'Event Setup Crew',     icon: Users,     gradient: 'from-blue-500 to-indigo-600',    accent: '#3b82f6', vertical: 'event'        },
  event_cleaning_crew:       { label: 'Event Cleaning',       icon: Sparkles,  gradient: 'from-teal-500 to-cyan-600',      accent: '#14b8a6', vertical: 'event'        },
  event_helper:              { label: 'Event Helper',         icon: Users,     gradient: 'from-green-500 to-emerald-600',  accent: '#10b981', vertical: 'event'        },
  event_sound_crew:          { label: 'Sound Crew',           icon: Layers,    gradient: 'from-slate-700 to-slate-900',    accent: '#334155', vertical: 'event'        },
  event_lighting_crew:       { label: 'Lighting Crew',        icon: Zap,       gradient: 'from-amber-400 to-orange-500',   accent: '#f59e0b', vertical: 'event'        },
  event_security_crew:       { label: 'Event Security',       icon: ShieldCheck, gradient: 'from-red-500 to-rose-600',     accent: '#ef4444', vertical: 'event'        },
  event_birthday_setup:      { label: 'Birthday Setup',       icon: Star,      gradient: 'from-pink-500 to-fuchsia-600',   accent: '#ec4899', vertical: 'event'        },
  event_wedding_setup:       { label: 'Wedding Setup',        icon: Star,      gradient: 'from-amber-400 to-orange-500',   accent: '#f59e0b', vertical: 'event'        },
  event_photography_assist:  { label: 'Photography Assist',   icon: Camera,    gradient: 'from-indigo-500 to-violet-600',  accent: '#6366f1', vertical: 'event'        },
  event_catering_assist:     { label: 'Catering Assist',      icon: Users,     gradient: 'from-orange-400 to-red-500',     accent: '#f97316', vertical: 'event'        },
  // ── Pet Assistance ────────────────────────────────────────────────────────
  pet_grooming:          { label: 'Pet Grooming',          icon: Dog,          gradient: 'from-amber-400 to-orange-500',   accent: '#f59e0b', vertical: 'pet'          },
  pet_walking:           { label: 'Pet Walking',           icon: Bike,         gradient: 'from-green-500 to-emerald-600',  accent: '#10b981', vertical: 'pet'          },
  pet_transport:         { label: 'Pet Transport',         icon: Car,          gradient: 'from-violet-500 to-purple-600',  accent: '#8b5cf6', vertical: 'pet'          },
  pet_sitting:           { label: 'Pet Sitting',           icon: Heart,        gradient: 'from-rose-500 to-pink-600',      accent: '#f43f5e', vertical: 'pet'          },
  pet_vet_assist:        { label: 'Vet Visit Assist',      icon: ShieldCheck,  gradient: 'from-blue-500 to-indigo-600',    accent: '#3b82f6', vertical: 'pet'          },
  pet_training_assist:   { label: 'Pet Training',          icon: Star,         gradient: 'from-amber-500 to-orange-600',   accent: '#f59e0b', vertical: 'pet'          },
};

const SERVICE_SUBCATEGORIES = {
  electrical: [
    { key: 'switch_socket', label: 'Switch / Socket', icon: '🔌' },
    { key: 'wiring',        label: 'Wiring Issue',    icon: '🔧' },
    { key: 'fan_light',     label: 'Fan / Light',     icon: '💡' },
    { key: 'mcb_fuse',      label: 'MCB / Fuse',      icon: '⚡' },
    { key: 'new_fitting',   label: 'New Fitting',     icon: '🪛' },
  ],
  plumbing: [
    { key: 'pipe_leak',  label: 'Pipe Leak',    icon: '💧' },
    { key: 'tap_faucet', label: 'Tap / Faucet', icon: '🚿' },
    { key: 'drain',      label: 'Drain Blocked',icon: '🕳️' },
    { key: 'toilet',     label: 'Toilet Issue', icon: '🚽' },
    { key: 'water_tank', label: 'Water Tank',   icon: '🪣' },
  ],
  ac_repair: [
    { key: 'not_cooling',   label: 'Not Cooling',    icon: '🥵' },
    { key: 'water_leak',    label: 'Water Leaking',  icon: '💦' },
    { key: 'noisy',         label: 'Noisy',          icon: '📢' },
    { key: 'not_turning_on',label: 'Not Turning On', icon: '❌' },
    { key: 'service',       label: 'Service / Clean',icon: '🧹' },
  ],
  carpenter: [
    { key: 'door_window',  label: 'Door / Window',    icon: '🚪' },
    { key: 'furniture',    label: 'Furniture Repair', icon: '🪑' },
    { key: 'lock',         label: 'Lock Issue',       icon: '🔐' },
    { key: 'installation', label: 'New Installation', icon: '🔨' },
  ],
  puncture: [
    { key: 'two_wheeler',  label: 'Two Wheeler',  icon: '🛵' },
    { key: 'four_wheeler', label: 'Four Wheeler', icon: '🚗' },
    { key: 'tyre_change',  label: 'Tyre Change',  icon: '🔄' },
  ],
  helper: [
    { key: 'shifting',      label: 'Home Shifting', icon: '📦' },
    { key: 'heavy_lifting', label: 'Heavy Lifting', icon: '💪' },
    { key: 'cleaning_help', label: 'Cleaning',      icon: '🧽' },
    { key: 'other',         label: 'Other Task',    icon: '📋' },
  ],
  cleaning: [
    { key: 'full_home',  label: 'Full Home',  icon: '🏠' },
    { key: 'kitchen',    label: 'Kitchen',    icon: '🍳' },
    { key: 'bathroom',   label: 'Bathroom',   icon: '🚿' },
    { key: 'deep_clean', label: 'Deep Clean', icon: '✨' },
  ],
  painting: [
    { key: 'walls',     label: 'Walls',     icon: '🖌️' },
    { key: 'exterior',  label: 'Exterior',  icon: '🏡' },
    { key: 'touch_up',  label: 'Touch Up',  icon: '🎨' },
    { key: 'full_home', label: 'Full Home', icon: '🏠' },
  ],
  // Mobile phone sub-issues
  screen_replacement: [
    { key: 'cracked',      label: 'Cracked Screen',       icon: '💔' },
    { key: 'no_display',   label: 'No Display',           icon: '⬛' },
    { key: 'touch_broken', label: 'Touch Not Working',    icon: '👆' },
    { key: 'discoloration',label: 'Discoloration / Spots', icon: '🟡' },
  ],
  battery_replacement: [
    { key: 'fast_drain',  label: 'Fast Drain',       icon: '🪫' },
    { key: 'not_charging',label: 'Not Charging',     icon: '❌' },
    { key: 'swollen',     label: 'Swollen Battery',  icon: '⚠️' },
    { key: 'overheating', label: 'Overheating',      icon: '🌡️' },
  ],
  charging_issue: [
    { key: 'port_loose',   label: 'Loose Port',       icon: '🔌' },
    { key: 'slow_charge',  label: 'Slow Charging',    icon: '🐢' },
    { key: 'no_charge',    label: 'Not Charging',     icon: '❌' },
    { key: 'intermittent', label: 'Intermittent',     icon: '⚡' },
  ],
  speaker_mic_issue: [
    { key: 'no_sound',       label: 'No Sound',           icon: '🔇' },
    { key: 'muffled',        label: 'Muffled Audio',       icon: '📢' },
    { key: 'mic_not_working',label: 'Mic Not Working',     icon: '🎤' },
    { key: 'loudspeaker',    label: 'Loudspeaker Issue',   icon: '🔊' },
  ],
  software_issue: [
    { key: 'slow_phone',  label: 'Slow Phone',      icon: '🐌' },
    { key: 'app_crash',   label: 'App Crashing',    icon: '💥' },
    { key: 'virus',       label: 'Virus / Malware', icon: '🦠' },
    { key: 'factory_reset',label: 'Factory Reset',  icon: '🔄' },
  ],
  water_damage_check: [
    { key: 'fell_water',  label: 'Fell in Water',   icon: '💧' },
    { key: 'rain',        label: 'Rain Damage',     icon: '🌧️' },
    { key: 'not_turning_on', label: 'Not Turning On', icon: '❌' },
  ],
  // Construction
  mason: [
    { key: 'brickwork',      label: 'Brick Work',        icon: '🧱' },
    { key: 'plastering',     label: 'Plastering',        icon: '🏗️' },
    { key: 'tile_laying',    label: 'Tile Laying',       icon: '⬜' },
    { key: 'waterproofing',  label: 'Waterproofing',     icon: '💧' },
  ],
  // Car + Bike
  battery_jump_start: [
    { key: 'car',    label: 'Car',    icon: '🚗' },
    { key: 'bike',   label: 'Bike',   icon: '🏍️' },
    { key: 'scooter',label: 'Scooter',icon: '🛵' },
  ],
  fuel_delivery: [
    { key: 'petrol', label: 'Petrol', icon: '⛽' },
    { key: 'diesel', label: 'Diesel', icon: '🛢️' },
  ],
  bike_wash: [
    { key: 'basic',    label: 'Basic Wash',       icon: '🚿' },
    { key: 'full',     label: 'Full Wash + Wax',  icon: '✨' },
    { key: 'engine',   label: 'Engine Cleaning',  icon: '🔧' },
  ],
  car_wash: [
    { key: 'exterior', label: 'Exterior Only',    icon: '🚗' },
    { key: 'full',     label: 'Full Wash + Dry',  icon: '✨' },
    { key: 'interior', label: 'Interior + Vacuum',icon: '🧹' },
    { key: 'premium',  label: 'Premium Detailing',icon: '💎' },
  ],
  minor_roadside_repair: [
    { key: 'cable',    label: 'Cable Issue',      icon: '🔌' },
    { key: 'fuse',     label: 'Fuse Blown',       icon: '⚡' },
    { key: 'belt',     label: 'Belt Problem',     icon: '🔧' },
    { key: 'other',    label: 'Other Minor Fix',  icon: '🛠️' },
  ],
};

const VEHICLE_TYPES = [
  { key: 'bike',    label: 'Bike',    icon: '🏍️' },
  { key: 'scooter', label: 'Scooter', icon: '🛵' },
  { key: 'car',     label: 'Car',     icon: '🚗' },
];
const CONSTRUCTION_PRICING_MODELS = [
  { key: 'standard', label: 'Standard', desc: 'Fixed service rate' },
  { key: 'hourly',   label: 'Hourly',   desc: 'Pay per hour of work' },
  { key: 'project',  label: 'Project',  desc: 'Quote after site visit' },
];

const PAYMENT_OPTIONS = [
  { key: 'upi',  label: 'UPI',  icon: '📱', desc: 'Google Pay, PhonePe…'  },
  { key: 'cash', label: 'Cash', icon: '💵', desc: 'Pay on arrival'         },
  { key: 'card', label: 'Card', icon: '💳', desc: 'Credit / Debit'         },
];

const NUDGE_POOL = [
  { icon: TrendingUp, text: 'High demand right now — workers going fast', color: 'text-orange-600', bg: 'bg-orange-50', ring: 'ring-orange-100' },
  { icon: Users,      text: 'Multiple users booking this service nearby',  color: 'text-blue-600',   bg: 'bg-blue-50',   ring: 'ring-blue-100'   },
  { icon: Star,       text: '95% of bookings matched within 60 seconds',   color: 'text-amber-600',  bg: 'bg-amber-50',  ring: 'ring-amber-100'  },
];

/* Pre-computed so stars don't jump on re-render */
const STARS = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  left: (i * 137.508) % 100,
  top:  (i * 97.631)  % 100,
  size: i % 6 === 0 ? 2 : 1,
  dur:  1.4 + (i % 7) * 0.35,
  delay: (i % 11) * 0.25,
}));

function todayMin() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 30);
  return d.toISOString().slice(0, 16);
}

export default function BookingPage() {
  const { service } = useParams();
  const nav = useNavigate();
  const isMobile  = MOBILE_SERVICES.has(service);
  const isVehicle = VEHICLE_SERVICES.has(service);
  // Towing: needs a destination (where to tow) + is priced on the tow distance.
  const isTowing  = service === 'car_towing' || service === 'bike_towing';
  // Breakdown/tow services need a worker with specialised equipment (#72).
  // We warn the customer upfront so they can also call a tow operator.
  const isTowRequired = service === 'car_breakdown' || service === 'bike_breakdown' || service === 'commercial_emergency';
  // Team/crew bookings: multi-worker dispatch not yet implemented. Show info banner. (#74)
  const isEventCrewService = EVENT_SERVICES.has(service) && service !== 'event_helper';
  // Construction/hourly-pricing services (mason, etc.) are disabled in this
  // catalog version. The pricing model picker is hidden until re-enabled.
  const isConstruction = false;

  const [stage,         setStage]         = useState('location');
  const [location,      setLocation]      = useState(null);
  const [subCategory,   setSubCategory]   = useState('');
  const [description,   setDescription]   = useState('');
  const [images,        setImages]        = useState([]);

  // ── ZappyLens hydration ──────────────────────────────────────────────
  // Arrived from a Lens scan (/book/:service?lens=<scanId>) → prefill the
  // description with the AI diagnosis and attach the scanned photo so the
  // worker sees exactly what was scanned.
  const [searchParams]   = useSearchParams();
  const lensScanId       = searchParams.get('lens');
  const [fetchLensScan]  = useLazyGetLensScanQuery();
  const lensHydrated     = useRef(false);
  useEffect(() => {
    if (!lensScanId || lensHydrated.current) return;
    lensHydrated.current = true;
    (async () => {
      try {
        const { scan } = await fetchLensScan(lensScanId).unwrap();
        if (!scan) return;
        const match = (scan.matches || []).find((m) => m.serviceCode === service) || scan.matches?.[0];
        const parts = [];
        if (match?.issueSummary)   parts.push(match.issueSummary);
        if (match?.notesForWorker) parts.push(`For the pro: ${match.notesForWorker}`);
        if (parts.length) setDescription((d) => d || parts.join('\n'));
        if (scan.imageKeys?.length) {
          setImages((imgs) => imgs.length ? imgs : scan.imageKeys.map((k, i) => ({
            s3Key: k, url: scan.imageUrls?.[i] || null, uploading: false, fromLens: true,
          })));
        }
      } catch { /* lens hydration is best-effort */ }
    })();
  }, [lensScanId, service, fetchLensScan]);
  const [schedMode,     setSchedMode]     = useState('now');
  const [scheduledAt,   setScheduledAt]   = useState('');
  // Scheduled booking — separate date + time state
  const [bookMode,      setBookMode]      = useState('now'); // 'now' | 'later'
  const [schedDate,     setSchedDate]     = useState('');   // YYYY-MM-DD
  const [schedTime,     setSchedTime]     = useState('');   // HH:MM
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [pricingMode,   setPricingMode]   = useState('now');
  const [nudgeIdx,      setNudgeIdx]      = useState(0);
  const [showNudge,     setShowNudge]     = useState(false);
  const [promoCode,     setPromoCode]     = useState('');
  const [promoResult,   setPromoResult]   = useState(null);
  const [promoError,    setPromoError]    = useState('');
  const [selectedTier,  setSelectedTier]  = useState('standard');
  const [tipAmount,     setTipAmount]     = useState(0);
  const [preferredWorkerId, setPreferredWorkerId] = useState(null); // worker-choice (optional)
  const [showOverlay,   setShowOverlay]   = useState(false); // overlay visible
  const [matchFound,    setMatchFound]    = useState(false); // "Worker found!" success state
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [diagnosisAnswers, setDiagnosisAnswers] = useState(null);
  const [showDiagnosis,    setShowDiagnosis]    = useState(false);
  const [noWorkersModal,   setNoWorkersModal]   = useState(false);
  const [priceChangedModal, setPriceChangedModal] = useState(null); // { quotedTotal, freshTotal, pendingBody }

  // Mobile-specific state
  const [deviceBrand,   setDeviceBrand]   = useState('');
  const [deviceModel,   setDeviceModel]   = useState('');
  const [deviceSeries,  setDeviceSeries]  = useState('');
  const [partsTier,     setPartsTier]     = useState(''); // OEM | Premium | Compatible | Budget (from wizard)
  const [serviceMode,   setServiceMode]   = useState('doorstep'); // doorstep | pickup

  // Vehicle-specific state
  const [vehicleType,   setVehicleType]   = useState('');
  // Towing destination { lat, lng, address } + its picker overlay
  const [towDest,       setTowDest]       = useState(null);
  const [showDestPicker, setShowDestPicker] = useState(false);

  // Construction-specific state
  const [pricingModel,  setPricingModel]  = useState('standard');
  const [estimatedHours,setEstimatedHours]= useState(2);
  const nudgeTimer = useRef(null);
  const fileInputRef = useRef(null);

  const [fetchQuote,     { data: quoteData, isFetching: quoting }] = useLazyGetQuoteQuery();
  const [createOrder,    { isLoading: creating }]                  = useCreateOrderMutation();
  const [presignUpload]                                             = usePresignUploadMutation();
  const [fetchNearby,    { data: nearbyData }]                     = useLazyGetNearbyWorkersQuery();
  const [validatePromo,  { isLoading: validatingPromo }]           = useValidatePromoMutation();
  const [fetchSurge,     { data: surgeInfoData }]                  = useLazyGetSurgeInfoQuery();
  const { data: pricingConfigData }                                 = useGetPricingConfigQuery();
  const pricingConfig = pricingConfigData?.pricing ?? {};

  const meta         = SERVICE_META[service] || { label: service?.replace(/_/g, ' ') || 'Service', icon: Wrench, gradient: 'from-slate-500 to-slate-700', accent: '#64748b' };
  const ServiceIcon  = meta.icon;
  const subCategories = SERVICE_SUBCATEGORIES[service] || [];

  const q = quoteData?.quote;
  const hasSurge = q?.surgeMultiplier > 1;

  useEffect(() => {
    if (stage !== 'details') { setShowNudge(false); return; }
    const initial = setTimeout(() => {
      setShowNudge(true);
      nudgeTimer.current = setInterval(() => {
        setNudgeIdx(i => (i + 1) % NUDGE_POOL.length);
      }, 8000);
    }, 3000);
    return () => { clearTimeout(initial); clearInterval(nudgeTimer.current); };
  }, [stage]);

  async function onLocationConfirmed(loc) {
    // Test 34: warn if user confirmed location while GPS was inaccurate (>150m).
    // This commonly happens when booking from a moving vehicle or inside a building.
    if (loc.accuracy != null && loc.accuracy > 150) {
      toast(`Location accuracy is ±${Math.round(loc.accuracy)}m — confirm your address is correct`, {
        icon: '📍',
        duration: 5000,
      });
    }
    setLocation(loc);
    setPricingMode('now');
    setStage('details');
    // Demand intelligence: user expressed intent for `service` at this location.
    // Also stash coords so the visitor session inherits city/district/state.
    try { localStorage.setItem('zappy:lastCoords', JSON.stringify({ lat: loc.lat, lng: loc.lng })); } catch { /* ignore */ }
    trackSearch({ category: service, lat: loc.lat, lng: loc.lng, result: 'served', userType: 'user' });
    fetchQuote({
      service, pickupLat: loc.lat, pickupLng: loc.lng,
      ...(deviceBrand && { deviceBrand }),
      ...(deviceModel && { deviceModel }),
      ...(deviceSeries && { deviceSeries }),
      ...(partsTier && { partsTier }),
      ...(vehicleType && { vehicleType }),
      ...(isTowing && { vehicleType: service === 'car_towing' ? 'car' : 'bike' }),
      ...(isTowing && towDest && { dropLat: towDest.lat, dropLng: towDest.lng }),
      ...(pricingModel !== 'standard' && { pricingModel }),
      ...(pricingModel === 'hourly' && { estimatedHours }),
    });
    fetchNearby({ lat: loc.lat, lng: loc.lng });
    fetchSurge({ lat: loc.lat, lng: loc.lng });
  }

  // Towing destination chosen — store it and re-price on the tow distance.
  function onTowDestConfirmed(loc) {
    setTowDest({ lat: loc.lat, lng: loc.lng, address: loc.address });
    setShowDestPicker(false);
    if (location) {
      fetchQuote({
        service, pickupLat: location.lat, pickupLng: location.lng,
        vehicleType: service === 'car_towing' ? 'car' : 'bike',
        dropLat: loc.lat, dropLng: loc.lng,
      });
    }
  }

  async function uploadImage(file) {
    const id = Math.random().toString(36).slice(2);
    // Use a local blob URL for instant preview while upload runs in background
    const previewUrl = URL.createObjectURL(file);
    setImages(prev => [...prev, { id, url: previewUrl, uploading: true }]);
    try {
      const { uploadUrl, key } = await presignUpload({
        folder: 'order-images',
        contentType: file.type,
        filename: file.name,
      }).unwrap();
      await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      // Store S3 key; order controller resolves it to a presigned GET URL on read
      setImages(prev => prev.map(img => img.id === id ? { id, url: previewUrl, s3Key: key, uploading: false } : img));
    } catch {
      URL.revokeObjectURL(previewUrl);
      setImages(prev => prev.filter(img => img.id !== id));
      toast.error('Image upload failed');
    }
  }

  function onFileChange(e) {
    const files = Array.from(e.target.files || []);
    const remaining = 5 - images.filter(i => !i.uploading).length;
    files.slice(0, remaining).forEach(uploadImage);
    e.target.value = '';
  }

  async function applyPromo() {
    if (!promoCode.trim()) return;
    setPromoError('');
    setPromoResult(null);
    try {
      const res = await validatePromo({
        code: promoCode.trim().toUpperCase(),
        service,
        orderTotalPaise: (q?.total || 0) * 100,
      }).unwrap();
      setPromoResult({
        code: res.code,
        discountPaise: res.discountPaise,
        discountDisplay: `₹${Math.round(res.discountPaise / 100)}`,
      });
    } catch (err) {
      setPromoError(err.data?.error || 'Invalid promo code');
    }
  }

  function clearPromo() {
    setPromoCode('');
    setPromoResult(null);
    setPromoError('');
  }

  async function placeOrder() {
    if (bookMode === 'later' && (!schedDate || !schedTime)) {
      toast.error('Please pick a date and time');
      return;
    }
    const scheduledAtIso = bookMode === 'later' && schedDate && schedTime
      ? new Date(`${schedDate}T${schedTime}`).toISOString()
      : undefined;
    setPricingMode('locked');
    // Prefer the S3 key; fall back to URL (blob URLs are stripped server-side anyway)
    const uploadedUrls = images.filter(i => i.s3Key || i.url).map(i => i.s3Key || i.url);
    const body = {
      service,
      subCategory: subCategory || undefined,
      description,
      images: uploadedUrls,
      scheduledAt: scheduledAtIso,
      pickupLocation: location,
      paymentMethod,
      promoCode: promoResult?.code || undefined,
      tier: selectedTier,
      tipAmount: tipAmount > 0 ? tipAmount : undefined,
      // Worker-choice: if the customer picked a specific pro, dispatch offers them first.
      ...(preferredWorkerId && { preferredWorkerId }),
      // Mobile extras
      ...(isMobile && deviceBrand && { deviceBrand }),
      ...(isMobile && deviceModel && { deviceModel }),
      ...(isMobile && deviceSeries && { deviceSeries }),
      ...(isMobile && partsTier && { partsTier }),
      ...(isMobile && { serviceMode }),
      // Vehicle extras
      ...(isVehicle && vehicleType && { vehicleType }),
      // Towing: destination + tow vehicle type drive the tow-distance price
      ...(isTowing && towDest && {
        dropLocation: { lat: towDest.lat, lng: towDest.lng, address: towDest.address },
        vehicleType: service === 'car_towing' ? 'car' : 'bike',
      }),
      // Construction extras
      ...(isConstruction && { pricingModel }),
      ...(isConstruction && pricingModel === 'hourly' && { estimatedHours }),
      // Surge price protection — send tier-adjusted price so server compares apples-to-apples.
      // Server will apply the same tier multiplier and reject if surge pushed price >20% higher.
      quotedTotalRupees: tierPrice || undefined,
    };
    try {
      const r = await createOrder(body).unwrap();
      setActiveOrderId(r.order._id);
      setShowOverlay(true);  // show overlay in "searching" state — boost sheet slides up
      // After 3s show "Worker found!" success animation, then navigate at 4.5s
      setTimeout(() => setMatchFound(true), 3000);
      setTimeout(() => {
        toast.success(bookMode === 'later' ? 'Booking scheduled!' : 'Order placed — finding a worker');
        nav(`/orders/${r.order._id}`, { replace: true });
      }, 4500);
    } catch (err) {
      setPricingMode('now');
      if (err.data?.code === 'NO_WORKERS_IN_AREA') {
        // Unmet demand: capture the "No Service Available" signal for expansion analytics.
        trackSearch({ category: service, lat: location?.lat, lng: location?.lng, result: 'no_service', userType: 'user' });
        setNoWorkersModal(true);
        return;
      }
      if (err.data?.code === 'PRICE_CHANGED') {
        setPriceChangedModal({
          quotedTotal: err.data.quotedTotal,
          freshTotal:  err.data.freshTotal,
          pendingBody: body,
        });
        return;
      }
      const msg = err.data?.error || 'Failed to place order';
      if (err.data?.activeOrderId) {
        toast.error(`${msg} — redirecting…`);
        nav(`/orders/${err.data.activeOrderId}`, { replace: true });
        return;
      }
      toast.error(msg);
    }
  }

  async function confirmPriceChange() {
    if (!priceChangedModal) return;
    const { freshTotal, pendingBody } = priceChangedModal;
    setPriceChangedModal(null);
    try {
      const r = await createOrder({ ...pendingBody, quotedTotalRupees: freshTotal }).unwrap();
      setActiveOrderId(r.order._id);
      setShowOverlay(true);
      setTimeout(() => setMatchFound(true), 3000);
      setTimeout(() => {
        toast.success(bookMode === 'later' ? 'Booking scheduled!' : 'Order placed — finding a worker');
        nav(`/orders/${r.order._id}`, { replace: true });
      }, 4500);
    } catch (err2) {
      toast.error(err2.data?.error || 'Failed to place order');
    }
  }

  const svcMeta = SEO_SERVICE_META[service] || {};
  const svcTitle = svcMeta.name
    ? `${svcMeta.name} Near Me — Book Instantly | Zappy`
    : `Book ${service?.replace(/_/g, ' ')} — Zappy`;
  const svcDesc = svcMeta.desc || `Book verified professionals for ${service?.replace(/_/g, ' ')} at your doorstep. Instant booking, live tracking, transparent pricing.`;

  /* ── Location stage ── */
  /* ── Location stage ── */
  if (stage === 'location') {
    return (
      <div className="fixed inset-0 h-[100dvh] w-full flex flex-col overflow-hidden bg-[#F3F6FB] z-50">
        <SEO
          title={svcTitle}
          description={svcDesc}
          canonical={`${BASE_URL}/book/${service}`}
          keywords={svcMeta.keywords}
          jsonLd={buildServiceJsonLd(service)}
        />
        {/* Premium header — dark navy, rounded bottom so content sits in a card */}
        <header className="shrink-0 relative overflow-hidden rounded-b-[24px]" style={{ background: 'linear-gradient(135deg, #0B1120 0%, #0E1526 100%)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="max-w-md mx-auto px-4 h-[88px] flex items-center gap-3">
            <motion.button
              onClick={() => nav(-1)}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0 backdrop-blur-sm"
              whileTap={{ scale: 0.92 }}
            >
              <ArrowLeft size={19} strokeWidth={2.5} className="text-white" />
            </motion.button>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Where do you need help?</p>
              <p className="text-[17px] font-extrabold text-white capitalize leading-tight flex items-center gap-2 mt-0.5">
                <span className="inline-flex w-6 h-6 rounded-lg items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}>
                  <ServiceIcon size={13} strokeWidth={2.5} className="text-white" />
                </span>
                {meta.label}
              </p>
            </div>
            {/* 2-segment step progress — step 1 active */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="w-7 h-1.5 rounded-full" style={{ background: '#2F6BFF' }} />
              <div className="w-5 h-1.5 rounded-full bg-white/20" />
            </div>
          </div>
        </header>
        <div className="flex-1 min-h-0 relative">
          <LocationPicker onConfirm={onLocationConfirmed} onCancel={() => nav(-1)} serviceLabel={meta.label} service={service} />
        </div>
      </div>
    );
  }

  // Towing destination picker (full-screen) — where to tow the vehicle to.
  if (showDestPicker) {
    return (
      <div className="fixed inset-0 h-[100dvh] w-full flex flex-col overflow-hidden bg-[#F3F6FB] z-50">
        <header className="shrink-0 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1e293b 100%)' }}>
          <div className="max-w-lg mx-auto px-4 h-16 flex items-center gap-3">
            <motion.button onClick={() => setShowDestPicker(false)} whileTap={{ scale: 0.92 }}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 backdrop-blur-sm">
              <ArrowLeft size={18} strokeWidth={2.5} className="text-white" />
            </motion.button>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Tow destination</p>
              <p className="font-bold text-white leading-tight">Where should we tow it?</p>
            </div>
          </div>
          <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </header>
        <div className="flex-1 min-h-0 relative">
          <LocationPicker onConfirm={onTowDestConfirmed} onCancel={() => setShowDestPicker(false)} serviceLabel="Tow destination" service={service} />
        </div>
      </div>
    );
  }

  /* ── Details stage ── */
  const hasUploadingImages = images.some(i => i.uploading);
  const canBook = !!q && !creating && pricingMode !== 'wait' && !hasUploadingImages && (!isTowing || !!towDest);

  const TIER_MULTIPLIERS = { standard: 1.0, priority: 1.2, express: 1.4 };
  const baseTotal = q ? (pricingMode === 'wait' ? Math.round(q.total / (q.surgeMultiplier || 1)) : q.total) : 0;
  const tierPrice = Math.round(baseTotal * (TIER_MULTIPLIERS[selectedTier] || 1.0));
  const promoDiscountRs = promoResult ? Math.round(promoResult.discountPaise / 100) : 0;
  const finalDisplayPrice = Math.max(0, tierPrice + tipAmount - promoDiscountRs);

  return (
    <>
    <PageTransition>
    <div className="min-h-screen pb-32" style={{ background: 'linear-gradient(180deg, #f0f4ff 0%, #f9fafb 120px)' }}>

      {/* Premium header */}
      <header className="sticky top-0 z-20 backdrop-blur-md" style={{ background: 'rgba(15,23,42,0.97)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="w-full max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center gap-3">
          <motion.button
            onClick={() => { setStage('location'); setPricingMode('now'); }}
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0"
            whileTap={{ scale: 0.92 }}
          >
            <ArrowLeft size={18} strokeWidth={2.5} className="text-white" />
          </motion.button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Step 2 — Confirm booking</p>
            <p className="font-bold text-white capitalize leading-tight flex items-center gap-2">
              <span className={`inline-flex w-5 h-5 rounded-lg bg-gradient-to-br ${meta.gradient} items-center justify-center`}>
                <ServiceIcon size={11} strokeWidth={2.5} className="text-white" />
              </span>
              {meta.label}
            </p>
          </div>
          {/* Step dots */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-6 h-1.5 rounded-full bg-white/40" />
            <div className="w-6 h-1.5 rounded-full bg-white" />
          </div>
          {hasSurge && (
            <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/30 px-2 py-0.5 rounded-full ml-1">
              <TrendingUp size={9} />
              {q.surgeMultiplier}×
            </span>
          )}
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </header>

      {/* Nudge banner */}
      <AnimatePresence mode="wait">
        {showNudge && (
          <motion.div
            key={nudgeIdx}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0  }}
            exit={{    opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="max-w-2xl lg:max-w-4xl mx-auto px-4 sm:px-6 pt-3"
          >
            {(() => {
              const { icon: Icon, text, color, bg, ring } = NUDGE_POOL[nudgeIdx];
              return (
                <div className={`flex items-center gap-2.5 px-4 py-2.5 ${bg} rounded-xl ring-1 ${ring}`}>
                  <Icon size={13} className={`${color} shrink-0`} />
                  <p className={`text-xs font-semibold ${color}`}>{text}</p>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="w-full max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-6 pt-4 space-y-3"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >

        {/* ── Event crew: single-worker-only notice (#74) ─────────────────── */}
        {isEventCrewService && (
          <motion.div variants={fadeInUp}
            className="rounded-2xl p-4 bg-violet-50 ring-1 ring-violet-200 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
              <Users size={15} strokeWidth={2.5} className="text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-violet-800">Single crew member assigned</p>
              <p className="text-xs text-violet-700 mt-1 leading-relaxed">
                We're currently dispatching one crew member per booking. If your event requires
                a larger team, please place separate bookings for each additional crew member.
                Multi-crew dispatch is coming soon.
              </p>
            </div>
          </motion.div>
        )}

        {/* ── Tow service capability warning (#72) ───────────────────────── */}
        {isTowRequired && (
          <motion.div variants={fadeInUp}
            className="rounded-2xl p-4 bg-orange-50 ring-1 ring-orange-200 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
              <AlertTriangle size={15} strokeWidth={2.5} className="text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-orange-800">Tow truck may be needed</p>
              <p className="text-xs text-orange-700 mt-1 leading-relaxed">
                Breakdown services sometimes require a tow vehicle. Zappy will send the nearest
                available worker, but if your vehicle needs towing we recommend also calling
                {' '}<strong>National Highway Helpline: 1033</strong> or your insurer's roadside
                assistance as a backup.
              </p>
            </div>
          </motion.div>
        )}

        {/* Mobile Phone Repair In-Depth Diagnostic & Model Selector */}
        {isMobile && (
          <motion.div variants={fadeInUp}>
            <PhoneDiagnosticWizard
              onSelectServiceQuote={({ deviceBrand: b, deviceModel: m, deviceSeries: s, partsTier: t, estimatedPriceRs, warrantyDays }) => {
                // Lift the wizard's picks into booking state so they actually flow into
                // the quote + order body (previously this callback only toasted).
                if (b) setDeviceBrand(b);
                if (m) setDeviceModel(m);
                setDeviceSeries(s || '');
                if (t) setPartsTier(t);
                toast.success(`Quote locked: ${b} ${m} (${t}) — ₹${estimatedPriceRs}`);
                // Re-price on the tier so the header quote matches the wizard.
                if (location) {
                  fetchQuote({
                    service, pickupLat: location.lat, pickupLng: location.lng,
                    ...(b && { deviceBrand: b }),
                    ...(m && { deviceModel: m }),
                    ...(s && { deviceSeries: s }),
                    ...(t && { partsTier: t }),
                  });
                }
              }}
            />
          </motion.div>
        )}

        {/* Location card — with map preview */}
        <motion.div
          className="rounded-2xl overflow-hidden bg-white ring-1 ring-slate-100"
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}
          variants={fadeInUp}
        >
          {location && import.meta.env.VITE_MAPBOX_TOKEN && (
            <BookingMapView
              location={location}
              workers={nearbyData?.workers ?? []}
              service={service}
            />
          )}
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center shrink-0 shadow-sm`}>
              <MapPin size={15} strokeWidth={2} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Service Location</p>
              <p className="text-sm font-semibold text-[#0F172A] leading-relaxed">{location?.address}</p>
            </div>
            <motion.button
              onClick={() => { setStage('location'); setPricingMode('now'); }}
              className="text-xs font-bold text-blue-600 flex items-center gap-0.5 shrink-0 bg-blue-50 px-2.5 py-1.5 rounded-lg ring-1 ring-blue-100"
              whileTap={{ scale: 0.95 }}
            >
              Change <ChevronRight size={11} strokeWidth={2.5} />
            </motion.button>
          </div>
        </motion.div>

        {/* ── Mobile: Device Brand + Model + Service Mode ──────────── */}
        {isMobile && (
          <motion.div className="rounded-2xl bg-white ring-1 ring-slate-100 p-4 space-y-4" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }} variants={fadeInUp}>
            <div className="flex items-center gap-2.5 mb-1">
              <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center`}>
                <Smartphone size={14} strokeWidth={2.5} className="text-white" />
              </div>
              <p className="font-bold text-[#0F172A] text-sm">Service Preference</p>
            </div>
            {/* Device summary — brand / model / part tier are chosen in the diagnostic
                wizard above; shown here read-only so the customer can confirm. */}
            {(deviceBrand || deviceModel || partsTier) && (
              <div className="flex flex-wrap items-center gap-2">
                {deviceBrand && <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-150 text-xs font-bold text-slate-700">{deviceBrand}</span>}
                {deviceModel && <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-150 text-xs font-semibold text-slate-600">{deviceModel}</span>}
                {partsTier && <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-150 text-xs font-bold text-amber-700">{partsTier}</span>}
              </div>
            )}
            {/* Service Mode */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">How should we help?</p>
              <div className="grid grid-cols-2 gap-2">
                {[{ key: 'doorstep', label: 'Doorstep Repair', icon: '🏠', desc: 'Technician comes to you' }, { key: 'pickup', label: 'Pickup & Repair', icon: '📦', desc: 'We collect & return' }].map(m => (
                  <motion.button key={m.key} onClick={() => setServiceMode(m.key)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${serviceMode === m.key ? 'text-white border-transparent' : 'bg-slate-50 border-slate-150'}`}
                    style={serviceMode === m.key ? { background: `linear-gradient(135deg, ${meta.accent}ee, ${meta.accent})` } : {}}
                    whileTap={{ scale: 0.95 }}>
                    <div className="text-lg mb-1">{m.icon}</div>
                    <div className={`text-xs font-bold ${serviceMode === m.key ? 'text-white' : 'text-slate-700'}`}>{m.label}</div>
                    <div className={`text-[10px] mt-0.5 ${serviceMode === m.key ? 'text-white/70' : 'text-slate-400'}`}>{m.desc}</div>
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Towing: destination picker ────────────────────────────── */}
        {isTowing && (
          <motion.div className="rounded-2xl bg-white ring-1 ring-slate-100 p-4" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }} variants={fadeInUp}>
            <div className="flex items-center gap-2.5 mb-3">
              <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center`}>
                <MapPin size={14} strokeWidth={2.5} className="text-white" />
              </div>
              <p className="font-bold text-[#0F172A] text-sm">Tow to</p>
            </div>
            <button onClick={() => setShowDestPicker(true)}
              className={`w-full text-left rounded-xl border-2 px-3.5 py-3 flex items-center justify-between gap-3 transition ${towDest ? 'border-slate-200 bg-white' : 'border-dashed border-indigo-300 bg-indigo-50/40'}`}>
              <div className="min-w-0">
                {towDest ? (
                  <p className="text-sm font-semibold text-[#0F172A] truncate">{towDest.address}</p>
                ) : (
                  <p className="text-sm font-semibold text-indigo-600">Select destination</p>
                )}
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {q?.vertical === 'towing' && q.distanceKm != null
                    ? `Tow distance ~${q.distanceKm} km`
                    : 'Where should we tow your vehicle?'}
                </p>
              </div>
              <ChevronRight size={16} className="text-slate-400 shrink-0" />
            </button>
            {!towDest && (
              <p className="text-[11px] text-amber-600 font-medium mt-2">Add a destination to see the tow price.</p>
            )}
          </motion.div>
        )}

        {/* ── Vehicle: Vehicle Type picker ──────────────────────────── */}
        {isVehicle && (
          <motion.div className="rounded-2xl bg-white ring-1 ring-slate-100 p-4" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }} variants={fadeInUp}>
            <div className="flex items-center gap-2.5 mb-3">
              <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center`}>
                <Car size={14} strokeWidth={2.5} className="text-white" />
              </div>
              <p className="font-bold text-[#0F172A] text-sm">Your Vehicle</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {VEHICLE_TYPES.map(v => (
                <motion.button key={v.key} onClick={() => setVehicleType(t => t === v.key ? '' : v.key)}
                  className={`p-3 rounded-xl border-2 text-center transition-all ${vehicleType === v.key ? 'text-white border-transparent' : 'bg-slate-50 border-slate-150'}`}
                  style={vehicleType === v.key ? { background: `linear-gradient(135deg, ${meta.accent}ee, ${meta.accent})` } : {}}
                  whileTap={{ scale: 0.95 }}>
                  <div className="text-2xl mb-1">{v.icon}</div>
                  <div className={`text-xs font-bold ${vehicleType === v.key ? 'text-white' : 'text-slate-700'}`}>{v.label}</div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Construction: Pricing Model picker ────────────────────── */}
        {isConstruction && (
          <motion.div className="rounded-2xl bg-white ring-1 ring-slate-100 p-4 space-y-3" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }} variants={fadeInUp}>
            <div className="flex items-center gap-2.5 mb-1">
              <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center`}>
                <FileText size={14} strokeWidth={2.5} className="text-white" />
              </div>
              <p className="font-bold text-[#0F172A] text-sm">Pricing Model</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {CONSTRUCTION_PRICING_MODELS.map(m => (
                <motion.button key={m.key} onClick={() => setPricingModel(m.key)}
                  className={`p-3 rounded-xl border-2 text-center transition-all ${pricingModel === m.key ? 'text-white border-transparent' : 'bg-slate-50 border-slate-150'}`}
                  style={pricingModel === m.key ? { background: `linear-gradient(135deg, ${meta.accent}ee, ${meta.accent})` } : {}}
                  whileTap={{ scale: 0.95 }}>
                  <div className={`text-xs font-bold ${pricingModel === m.key ? 'text-white' : 'text-slate-700'}`}>{m.label}</div>
                  <div className={`text-[10px] mt-0.5 ${pricingModel === m.key ? 'text-white/70' : 'text-slate-400'}`}>{m.desc}</div>
                </motion.button>
              ))}
            </div>
            {pricingModel === 'hourly' && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Estimated Hours</p>
                <div className="flex items-center gap-3">
                  <motion.button onClick={() => setEstimatedHours(h => Math.max(1, h - 0.5))} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold" whileTap={{ scale: 0.9 }}>−</motion.button>
                  <span className="text-lg font-bold text-[#0F172A] min-w-[3ch] text-center">{estimatedHours}h</span>
                  <motion.button onClick={() => setEstimatedHours(h => Math.min(24, h + 0.5))} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold" whileTap={{ scale: 0.9 }}>+</motion.button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Sub-categories */}
        {subCategories.length > 0 && (
          <motion.div
            className="rounded-2xl bg-white ring-1 ring-slate-100 p-4"
            style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}
            variants={fadeInUp}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center`}>
                <ServiceIcon size={14} strokeWidth={2.5} className="text-white" />
              </div>
              <p className="font-bold text-[#0F172A] text-sm">What's the issue?</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {subCategories.map(({ key, label, icon }) => (
                <motion.button
                  key={key}
                  onClick={() => setSubCategory(prev => prev === key ? '' : key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all ${
                    subCategory === key
                      ? 'text-white border-transparent shadow-sm'
                      : 'bg-white text-slate-600 border-slate-150 hover:border-slate-300 bg-slate-50'
                  }`}
                  style={subCategory === key ? {
                    background: `linear-gradient(135deg, ${meta.accent}ee, ${meta.accent})`,
                    borderColor: 'transparent',
                  } : {}}
                  whileTap={{ scale: 0.95 }}
                >
                  <span>{icon}</span>
                  {label}
                </motion.button>
              ))}
            </div>
            {subCategory && (
              <p className="text-xs text-slate-400 mt-2.5 flex items-center gap-1.5">
                <CheckCircle size={11} className="text-green-500" />
                <span>Selected: <span className="font-bold text-slate-600">{subCategories.find(s => s.key === subCategory)?.label}</span></span>
              </p>
            )}
          </motion.div>
        )}

        {/* Smart pricing panel */}
        <motion.div variants={fadeInUp}>
          {quoting ? (
            <div className="rounded-2xl bg-white ring-1 ring-slate-100 p-5 flex items-center gap-3" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Loader2 size={18} className="animate-spin text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#0F172A]">Calculating fare…</p>
                <p className="text-xs text-slate-400 mt-0.5">Checking demand, distance &amp; worker availability</p>
              </div>
            </div>
          ) : q ? (
            <SmartPricingPanel
              quote={q}
              mode={pricingMode}
              onModeChange={setPricingMode}
              onRefetch={() => fetchQuote({ service, pickupLat: location.lat, pickupLng: location.lng })}
              accentGradient={meta.gradient}
              selectedTier={selectedTier}
              onTierChange={setSelectedTier}
              tipAmount={tipAmount}
              onTipChange={setTipAmount}
              promoDiscount={promoResult ? Math.round(promoResult.discountPaise / 100) : 0}
              pricingConfig={pricingConfig}
            />
          ) : (
            <div className="rounded-2xl bg-white ring-1 ring-slate-100 p-4" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
              <p className="text-sm text-slate-400 font-medium text-center py-2">
                Could not load fare estimate
              </p>
            </div>
          )}
        </motion.div>

        {/* ZeroWait: is a pre-accepted pro standing by? (checked before payment) */}
        {bookMode === 'now' && location && (
          <motion.div variants={fadeInUp}>
            <InstantMatchBadge service={service} lat={location.lat} lng={location.lng} />
          </motion.div>
        )}

        {/* Worker-choice: optionally pick a specific pro (immediate bookings only) */}
        {bookMode === 'now' && location && (
          <motion.div variants={fadeInUp}>
            <ProPicker
              service={service}
              lat={location.lat}
              lng={location.lng}
              value={preferredWorkerId}
              onChange={setPreferredWorkerId}
            />
          </motion.div>
        )}

        {/* Surge Transparency Card */}
        {surgeInfoData && (
          <motion.div variants={fadeInUp}>
            <SurgeInfoCard surgeData={surgeInfoData} basePrice={q?.total} />
          </motion.div>
        )}

        {/* Smart Pre-Diagnosis */}
        {!diagnosisAnswers && (
          <motion.div variants={fadeInUp}>
            <DiagnosisFlow
              service={service}
              onComplete={(result) => {
                setDiagnosisAnswers(result.answers);
                if (result.urgency === 'urgent') {
                  import('react-hot-toast').then(({ default: toast }) => toast.error('⚠️ Urgent issue detected — marked as emergency priority'));
                }
              }}
              onSkip={() => setDiagnosisAnswers({})}
            />
          </motion.div>
        )}
        {diagnosisAnswers && Object.keys(diagnosisAnswers).length > 0 && (
          <motion.div variants={fadeInUp} className="card bg-blue-50 ring-1 ring-blue-100 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <p className="text-xs font-semibold text-blue-700 flex-1">
              Diagnosis saved — worker will arrive prepared
            </p>
            <button onClick={() => setDiagnosisAnswers(null)} className="text-[10px] text-blue-400">Redo</button>
          </motion.div>
        )}

        {/* Description + images */}
        <motion.div
          className="rounded-2xl bg-white ring-1 ring-slate-100 p-4"
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}
          variants={fadeInUp}
        >
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
              <FileText size={15} strokeWidth={2} className="text-slate-600" />
            </div>
            <div>
              <p className="font-bold text-[#0F172A] text-sm">Describe the Issue</p>
              <p className="text-[10px] text-slate-400">Optional but helps the worker prepare</p>
            </div>
          </div>
          <textarea
            rows={3}
            className="input resize-none text-sm"
            placeholder="e.g. Water leaking from kitchen pipe near the sink…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {/* Image upload */}
          <div className="mt-3.5">
            <div className="flex items-center gap-2 mb-2.5">
              <ImageIcon size={13} strokeWidth={2} className="text-slate-400" />
              <p className="text-xs font-bold text-slate-500">Add photos <span className="text-slate-300 font-normal">(optional · up to 5)</span></p>
            </div>
            <div className="flex flex-wrap gap-2">
              {images.map((img) => (
                <motion.div
                  key={img.id}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-100 ring-2 ring-slate-200"
                >
                  {img.uploading ? (
                    <div className="w-full h-full flex items-center justify-center bg-slate-50">
                      <Loader2 size={16} className="animate-spin text-blue-400" />
                    </div>
                  ) : (
                    <>
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setImages(prev => prev.filter(i => i.id !== img.id))}
                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center backdrop-blur-sm"
                      >
                        <X size={10} className="text-white" />
                      </button>
                    </>
                  )}
                </motion.div>
              ))}
              {images.filter(i => !i.uploading).length < 5 && (
                <motion.button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center hover:border-blue-300 hover:bg-blue-50/50 transition-all gap-0.5"
                  whileTap={{ scale: 0.95 }}
                >
                  <Plus size={16} strokeWidth={2.5} className="text-slate-400" />
                  <span className="text-[9px] text-slate-400 font-medium">Add</span>
                </motion.button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={onFileChange}
            />
          </div>
        </motion.div>

        {/* Schedule booking */}
        <motion.div
          className="rounded-2xl bg-white ring-1 ring-slate-100 p-4"
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}
          variants={fadeInUp}
        >
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
              <Calendar size={15} strokeWidth={2} className="text-slate-600" />
            </div>
            <p className="font-bold text-[#0F172A] text-sm">When do you need it?</p>
          </div>
          {/* Book Now / Schedule Later toggle pills */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {[
              { key: 'now',   label: 'Book Now',           icon: Zap,      sub: 'Worker dispatched instantly' },
              { key: 'later', label: 'Schedule Later',      icon: Calendar, sub: 'Pick a convenient time'      },
            ].map(({ key, label, icon: Icon, sub }) => (
              <motion.button
                key={key}
                onClick={() => setBookMode(key)}
                className={`flex flex-col items-start p-3.5 rounded-xl border-2 transition-all text-left ${
                  bookMode === key
                    ? 'border-transparent text-white'
                    : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200'
                }`}
                style={bookMode === key ? { background: 'linear-gradient(135deg, #0F172A 0%, #1e293b 100%)', borderColor: 'transparent' } : {}}
                whileTap={{ scale: 0.97 }}
              >
                <Icon size={16} strokeWidth={2.5} className={bookMode === key ? 'text-white mb-2' : 'text-slate-500 mb-2'} />
                <p className={`text-xs font-bold ${bookMode === key ? 'text-white' : 'text-[#0F172A]'}`}>{label}</p>
                <p className={`text-[10px] mt-0.5 ${bookMode === key ? 'text-white/60' : 'text-slate-400'}`}>{sub}</p>
              </motion.button>
            ))}
          </div>

          {/* Animated date + time picker — visible when "Schedule Later" selected */}
          <AnimatePresence>
            {bookMode === 'later' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="pt-2 space-y-3">
                  {/* Date picker */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                      <Calendar size={11} className="text-slate-400" />
                      Date
                    </label>
                    <input
                      type="date"
                      min={(() => {
                        const d = new Date();
                        d.setHours(d.getHours() + 1);
                        return d.toISOString().slice(0, 10);
                      })()}
                      max={(() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 7);
                        return d.toISOString().slice(0, 10);
                      })()}
                      value={schedDate}
                      onChange={(e) => setSchedDate(e.target.value)}
                      className="input text-sm w-full"
                    />
                  </div>

                  {/* Time picker — 30-min slots 7:00 AM to 9:00 PM */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                      <Clock size={11} className="text-slate-400" />
                      Time
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {(() => {
                        const slots = [];
                        for (let h = 7; h <= 21; h++) {
                          for (const m of [0, 30]) {
                            if (h === 21 && m === 30) break;
                            const hh = String(h).padStart(2, '0');
                            const mm = String(m).padStart(2, '0');
                            const val = `${hh}:${mm}`;
                            const ampm = h < 12 ? 'AM' : 'PM';
                            const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
                            const label = `${displayH}:${mm} ${ampm}`;
                            slots.push({ val, label });
                          }
                        }
                        return slots;
                      })().map(({ val, label }) => (
                        <motion.button
                          key={val}
                          onClick={() => setSchedTime(val)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                            schedTime === val
                              ? 'text-white border-transparent'
                              : 'bg-slate-50 text-slate-600 border-slate-150 hover:border-slate-300'
                          }`}
                          style={schedTime === val ? { background: 'linear-gradient(135deg, #0F172A 0%, #1e293b 100%)' } : {}}
                          whileTap={{ scale: 0.93 }}
                        >
                          {label}
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* Selected slot chip */}
                  {schedDate && schedTime && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 bg-slate-900 text-white rounded-xl px-3.5 py-2.5"
                    >
                      <CheckCircle size={13} className="text-green-400 shrink-0" />
                      <p className="text-xs font-bold">
                        {new Date(`${schedDate}T${schedTime}`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                        {' · '}
                        {(() => {
                          const [hh, mm] = schedTime.split(':').map(Number);
                          const ampm = hh < 12 ? 'AM' : 'PM';
                          const dh = hh > 12 ? hh - 12 : hh === 0 ? 12 : hh;
                          return `${dh}:${String(mm).padStart(2, '0')} ${ampm}`;
                        })()}
                      </p>
                    </motion.div>
                  )}

                  <p className="text-xs text-slate-400">Dispatch starts 5 min before scheduled time</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Payment method */}
        <motion.div
          className="rounded-2xl bg-white ring-1 ring-slate-100 p-4"
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}
          variants={fadeInUp}
        >
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
              <CreditCard size={15} strokeWidth={2} className="text-slate-600" />
            </div>
            <p className="font-bold text-[#0F172A] text-sm">Payment Method</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_OPTIONS.map(({ key, label, icon, desc }) => (
              <motion.button
                key={key}
                onClick={() => setPaymentMethod(key)}
                className={`flex flex-col items-center py-3 px-2 rounded-xl border-2 transition-all ${
                  paymentMethod === key
                    ? 'border-transparent text-white'
                    : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                }`}
                style={paymentMethod === key ? { background: 'linear-gradient(135deg, #0F172A 0%, #1e293b 100%)' } : {}}
                whileTap={{ scale: 0.95 }}
              >
                <span className="text-xl mb-1">{icon}</span>
                <span className={`text-xs font-bold ${paymentMethod === key ? 'text-white' : 'text-[#0F172A]'}`}>{label}</span>
                <span className={`text-[9px] mt-0.5 text-center ${paymentMethod === key ? 'text-white/50' : 'text-slate-400'}`}>{desc}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Promo code */}
        <motion.div
          className="rounded-2xl bg-white ring-1 ring-slate-100 p-4"
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}
          variants={fadeInUp}
        >
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-xl bg-green-50 flex items-center justify-center">
              <Ticket size={15} strokeWidth={2} className="text-green-600" />
            </div>
            <p className="font-bold text-[#0F172A] text-sm">Promo Code</p>
            {promoResult && (
              <span className="ml-auto text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                {promoResult.discountDisplay} off
              </span>
            )}
          </div>

          {promoResult ? (
            <div className="flex items-center gap-2 bg-green-50 rounded-xl px-3 py-2.5 ring-1 ring-green-100">
              <Tag size={13} className="text-green-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-green-700">{promoResult.code}</p>
                <p className="text-[10px] text-green-600">{promoResult.discountDisplay} will be deducted at checkout</p>
              </div>
              <button onClick={clearPromo} className="w-6 h-6 rounded-full bg-green-200/60 flex items-center justify-center shrink-0">
                <X size={11} className="text-green-700" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={promoCode}
                onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && applyPromo()}
                placeholder="Enter promo code"
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono font-semibold text-slate-800 uppercase tracking-widest outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent transition placeholder:font-normal placeholder:tracking-normal placeholder:uppercase-none"
              />
              <motion.button
                onClick={applyPromo}
                disabled={!promoCode.trim() || validatingPromo}
                className="flex items-center gap-1.5 bg-green-600 disabled:opacity-50 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition"
                whileTap={{ scale: 0.95 }}
              >
                {validatingPromo ? <Loader2 size={13} className="animate-spin" /> : 'Apply'}
              </motion.button>
            </div>
          )}
          {promoError && (
            <p className="text-xs text-red-500 font-semibold mt-2 flex items-center gap-1.5">
              <X size={11} /> {promoError}
            </p>
          )}
        </motion.div>

        {/* Assurance strip */}
        <motion.div variants={fadeInUp} className="flex items-center justify-center gap-6 py-2">
          {[
            { label: 'Insured Work', emoji: '🛡️' },
            { label: 'No Hidden Fee', emoji: '✅' },
            { label: 'Verified Pro', emoji: '⭐' },
          ].map(({ label, emoji }) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <span className="text-xl">{emoji}</span>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{label}</p>
            </div>
          ))}
        </motion.div>

      </motion.div>

      {/* Fixed confirm bar */}
      <div className="fixed bottom-0 inset-x-0 backdrop-blur-md" style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 -8px 32px rgba(0,0,0,0.08)', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="w-full max-w-2xl lg:max-w-4xl mx-auto px-4 sm:px-6 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {hasUploadingImages && (
            <p className="text-xs text-slate-400 text-center mb-2 flex items-center justify-center gap-1.5">
              <Loader2 size={11} className="animate-spin" />
              Uploading photos…
            </p>
          )}
          {pricingMode === 'wait' ? (
            <div className="text-center py-2">
              <p className="text-sm font-semibold text-slate-500">Waiting for a better price…</p>
              <p className="text-xs text-slate-400 mt-0.5">You can still book now at ₹{finalDisplayPrice || q?.total}</p>
              <button
                onClick={() => setPricingMode('now')}
                className="mt-2 text-xs font-bold text-blue-600 underline"
              >
                Book at current price
              </button>
            </div>
          ) : (
            <>
              {/* Cashback teaser — shows estimated cashback before user books */}
              {canBook && finalDisplayPrice > 0 && Math.round(finalDisplayPrice * 0.05) >= 1 && (
                <div className="flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl mb-2"
                  style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))' }}>
                  <span className="text-base">✨</span>
                  <p className="text-xs font-bold text-violet-700">
                    You'll earn <span className="text-violet-900">₹{Math.round(finalDisplayPrice * 0.05)}</span> cashback after this order
                  </p>
                </div>
              )}

            <motion.button
              disabled={!canBook}
              onClick={placeOrder}
              className="w-full relative overflow-hidden rounded-2xl py-4 flex items-center justify-center gap-2.5 text-white font-bold text-base disabled:opacity-50 disabled:pointer-events-none"
              style={{
                background: canBook
                  ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                  : '#94a3b8',
                boxShadow: canBook ? '0 8px 24px rgba(34,197,94,0.35)' : 'none',
              }}
              whileTap={canBook ? { scale: 0.98 } : {}}
            >
              {/* Animated shimmer */}
              {canBook && (
                <div
                  className="absolute inset-0 opacity-30 pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, transparent 0%, white 50%, transparent 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 2.5s ease-in-out infinite',
                  }}
                />
              )}
              {creating ? (
                <><Loader2 size={18} className="animate-spin" /> Placing order…</>
              ) : bookMode === 'later' ? (
                <><Calendar size={18} strokeWidth={2.5} /> Schedule Booking · ₹{finalDisplayPrice || '—'}</>
              ) : (
                <>
                  <Zap size={18} strokeWidth={2.5} />
                  {(promoDiscountRs > 0 || selectedTier !== 'standard' || tipAmount > 0)
                    ? <>Confirm Booking · <s className="opacity-60 text-sm">₹{q?.total}</s> ₹{finalDisplayPrice}</>
                    : <>Confirm Booking · ₹{finalDisplayPrice || '—'}</>
                  }
                </>
              )}
            </motion.button>
            </>
          )}
        </div>
      </div>

    </div>
    </PageTransition>

    {/* ── Rapido-style worker matching overlay ──────────────────────── */}
    <AnimatePresence>
      {(creating || showOverlay) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #0c0a1e 100%)' }}
        >
          {/* Stars */}
          <div className="absolute inset-0 pointer-events-none">
            {STARS.map(s => (
              <motion.div
                key={s.id}
                className="absolute rounded-full bg-white"
                style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size }}
                animate={{ opacity: [0.15, 0.9, 0.15] }}
                transition={{ duration: s.dur, repeat: Infinity, delay: s.delay }}
              />
            ))}
          </div>

          {/* Radar + orbit zone */}
          <div className="relative flex items-center justify-center" style={{ width: 300, height: 300 }}>

            {/* Pulsing radar rings */}
            {[70, 120, 170, 220].map((r, i) => (
              <motion.div
                key={i}
                className="absolute rounded-full border"
                style={{
                  width: r, height: r,
                  borderColor: matchFound ? 'rgba(34,197,94,0.35)' : 'rgba(99,102,241,0.25)',
                }}
                animate={matchFound
                  ? { scale: [1, 3.5], opacity: [0.7, 0], transition: { duration: 0.7, delay: i * 0.08 } }
                  : { scale: [1, 1.18, 1], opacity: [0.55, 0.06, 0.55] }
                }
                transition={!matchFound ? { duration: 2.2, repeat: Infinity, delay: i * 0.45 } : undefined}
              />
            ))}

            {/* Orbiting workers */}
            <AnimatePresence>
              {!matchFound && (
                <motion.div
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  {/* Single rotating container so all icons orbit together */}
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
                  >
                    {[0, 90, 180, 270].map((deg, i) => (
                      <div
                        key={i}
                        className="absolute"
                        style={{ transform: `rotate(${deg}deg) translateX(125px)` }}
                      >
                        {/* Counter-rotate so emoji stays upright */}
                        <motion.div
                          animate={{ rotate: -360 }}
                          transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
                          className="text-2xl drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]"
                        >
                          {i % 2 === 0 ? '🛵' : '🏍️'}
                        </motion.div>
                      </div>
                    ))}
                  </motion.div>

                  {/* Trailing glow dots on orbit path */}
                  <motion.div
                    className="absolute rounded-full border border-indigo-400/20"
                    style={{ width: 250, height: 250 }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Center service icon */}
            <motion.div
              className={`relative z-10 w-20 h-20 rounded-2xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center`}
              animate={matchFound
                ? { scale: [1, 1.25, 1], rotate: [0, 8, -8, 0] }
                : { scale: [1, 1.05, 1] }
              }
              transition={matchFound
                ? { duration: 0.5 }
                : { duration: 2, repeat: Infinity }
              }
              style={{ boxShadow: `0 0 48px ${meta.accent}55, 0 0 16px ${meta.accent}33` }}
            >
              <AnimatePresence mode="wait">
                {matchFound ? (
                  <motion.div
                    key="check"
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                  >
                    <CheckCircle size={36} className="text-white" strokeWidth={2.5} />
                  </motion.div>
                ) : (
                  <motion.div key="icon">
                    <ServiceIcon size={32} strokeWidth={2} className="text-white" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>

          {/* Status text */}
          <AnimatePresence mode="wait">
            {matchFound ? (
              <motion.div
                key="found"
                initial={{ opacity: 0, scale: 0.75, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                className="text-center mt-2 px-6"
              >
                <p className="text-2xl font-black text-white mb-1">Worker found! 🎉</p>
                <p className="text-sm font-semibold text-green-400">On the way to your location…</p>
              </motion.div>
            ) : (
              <motion.div
                key="searching"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center mt-2 px-6"
              >
                <p className="text-xl font-black text-white">Finding your worker…</p>
                <p className="text-sm text-white/45 mt-1">
                  {meta.label} · {nearbyData?.count ? `${nearbyData.count} workers nearby` : 'Scanning nearby workers'}
                </p>
                {/* Animated dots */}
                <div className="flex justify-center gap-2 mt-4">
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      className="w-2.5 h-2.5 rounded-full bg-indigo-400"
                      animate={{ opacity: [0.25, 1, 0.25], scale: [0.75, 1.3, 0.75] }}
                      transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.32 }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Live status pill */}
          <AnimatePresence>
            {!matchFound && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.5 }}
                className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full ring-1 ring-white/10 mt-2"
              >
                <motion.div className="w-1.5 h-1.5 rounded-full bg-green-400"
                  animate={{ scale: [1, 1.6, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 0.9, repeat: Infinity }} />
                <span className="text-[11px] font-bold text-white/70">Matching with nearby workers</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Boost is on the Order Tracking page (/orders/:id) after redirect */}
        </motion.div>
      )}
    </AnimatePresence>

    {/* ── No workers in area — emotional expansion modal ─────────────── */}
    <AnimatePresence>
      {noWorkersModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
        >
          <motion.div
            initial={{ y: 80, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl"
          >
            {/* Gradient header */}
            <div className="relative px-6 pt-10 pb-8 text-center"
              style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #7c3aed 100%)' }}>
              {/* Floating rings */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {[0,1,2].map(i => (
                  <motion.div key={i}
                    animate={{ scale: [1, 1.6, 1], opacity: [0.15, 0, 0.15] }}
                    transition={{ duration: 3, delay: i * 0.9, repeat: Infinity }}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white"
                    style={{ width: 80 + i * 60, height: 80 + i * 60 }}
                  />
                ))}
              </div>
              {/* Rocket icon */}
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                className="relative z-10 text-6xl mb-3"
              >🚀</motion.div>
              <h2 className="relative z-10 text-white text-xl font-bold leading-snug">
                We&apos;re not in your area yet
              </h2>
              <p className="relative z-10 text-blue-200 text-sm mt-1 font-medium">
                But we&apos;re expanding fast!
              </p>
            </div>

            {/* Body */}
            <div className="px-6 py-6 text-center space-y-4">
              <p className="text-slate-700 text-sm leading-relaxed">
                Zappy is growing city by city across India — and your area is next on our radar. 🌏
                <br /><br />
                <span className="font-semibold text-slate-900">
                  We&apos;re onboarding verified professionals near you right now.
                </span>{' '}
                Very soon you&apos;ll get the fastest, most reliable service at your doorstep.
              </p>

              {/* Timeline pill */}
              <div className="flex items-center justify-center gap-2 bg-amber-50 border border-amber-100 rounded-2xl py-3 px-4">
                <span className="text-amber-500 text-lg">⚡</span>
                <span className="text-amber-800 text-xs font-semibold">
                  Launching in your city within weeks
                </span>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-1">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    setNoWorkersModal(false);
                    nav('/services');
                  }}
                  className="w-full py-3.5 rounded-2xl font-semibold text-sm text-white"
                  style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)' }}
                >
                  Explore Available Services
                </motion.button>
                <button
                  onClick={() => setNoWorkersModal(false)}
                  className="w-full py-3 rounded-2xl text-sm font-medium text-slate-500 hover:text-slate-700"
                >
                  Go back
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* ── Price Changed confirmation modal ────────────────────────────── */}
    <AnimatePresence>
      {priceChangedModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 20 }}
            className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{ background: '#fff' }}
          >
            <div className="p-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4 text-2xl">⚡</div>
              <h2 className="text-lg font-black text-slate-900 mb-1">Price Updated</h2>
              <p className="text-sm text-slate-500 mb-5">
                Demand just changed in your area. The updated price is shown below.
              </p>
              <div className="flex items-center justify-center gap-4 mb-6">
                <div className="text-center">
                  <p className="text-xs text-slate-400 mb-0.5">Your quote</p>
                  <p className="text-2xl font-black text-slate-400 line-through">₹{priceChangedModal.quotedTotal}</p>
                </div>
                <div className="text-slate-300 text-xl">→</div>
                <div className="text-center">
                  <p className="text-xs text-slate-400 mb-0.5">New price</p>
                  <p className="text-2xl font-black text-amber-600">₹{priceChangedModal.freshTotal}</p>
                </div>
              </div>
              <div className="space-y-2">
                <button
                  onClick={confirmPriceChange}
                  disabled={creating}
                  className="w-full py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                >
                  {creating ? 'Booking…' : `Confirm ₹${priceChangedModal.freshTotal}`}
                </button>
                <button
                  onClick={() => setPriceChangedModal(null)}
                  className="w-full py-3 text-sm font-medium text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
