import { lazy } from 'react';
import { CalendarDays, CalendarOff, History, IndianRupee, LineChart, Package, Users, Wallet, Warehouse } from 'lucide-react';

/**
 * The Fleet portal's screens (fleet-ioc.zappyone.com), one folder each under
 * features/. Admin → Fleet shows the same list, imported from here.
 */
export const FLEET_VIEWS = [
  { id: 'overview', label: 'Overview', icon: LineChart, Comp: lazy(() => import('../features/overview/FleetOverview')) },
  { id: 'hubs', label: 'Hubs', icon: Warehouse, Comp: lazy(() => import('../features/hubs/FleetHubs')) },
  { id: 'stock', label: 'Stock', icon: Package, Comp: lazy(() => import('../features/stock/FleetStock')) },
  { id: 'staff', label: 'Staff', icon: Users, Comp: lazy(() => import('../features/staff/FleetStaff')) },
  { id: 'roster', label: 'Roster', icon: CalendarDays, Comp: lazy(() => import('../features/roster/FleetRoster')) },
  { id: 'leave', label: 'Leave', icon: CalendarOff, Comp: lazy(() => import('../features/leave/FleetLeave')) },
  { id: 'payroll', label: 'Payroll', icon: Wallet, Comp: lazy(() => import('../features/payroll/FleetPayroll')) },
  { id: 'finance', label: 'Finance', icon: IndianRupee, Comp: lazy(() => import('../features/finance/FleetFinance')) },
  { id: 'activity', label: 'Activity', icon: History, Comp: lazy(() => import('../features/activity/FleetActivity')) },
];

export const FLEET_TITLE = 'ZappyOne Fleet';
export const FLEET_SUBTITLE = 'Your own staff and dark stores: people, shifts, stock and money';
