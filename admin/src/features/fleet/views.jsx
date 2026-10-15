import { lazy } from 'react';
import { CalendarDays, CalendarOff, IndianRupee, LineChart, Package, Users, Wallet, Warehouse } from 'lucide-react';

/**
 * The fleet's screens, once: shown as Admin → Fleet and as the whole of the
 * Fleet portal (fleet/ app, fleet.zappyone.com), where fleet managers work.
 */
export const FLEET_VIEWS = [
  { id: 'overview', label: 'Overview', icon: LineChart, Comp: lazy(() => import('./FleetOverview')) },
  { id: 'hubs', label: 'Hubs', icon: Warehouse, Comp: lazy(() => import('./FleetHubs')) },
  { id: 'stock', label: 'Stock', icon: Package, Comp: lazy(() => import('./FleetStock')) },
  { id: 'staff', label: 'Staff', icon: Users, Comp: lazy(() => import('./FleetStaff')) },
  { id: 'roster', label: 'Roster', icon: CalendarDays, Comp: lazy(() => import('./FleetRoster')) },
  { id: 'leave', label: 'Leave', icon: CalendarOff, Comp: lazy(() => import('./FleetLeave')) },
  { id: 'payroll', label: 'Payroll', icon: Wallet, Comp: lazy(() => import('./FleetPayroll')) },
  { id: 'finance', label: 'Finance', icon: IndianRupee, Comp: lazy(() => import('./FleetFinance')) },
];

export const FLEET_TITLE = 'ZappyOne Fleet';
export const FLEET_SUBTITLE = 'Your own staff and dark stores: people, shifts, stock and money';
