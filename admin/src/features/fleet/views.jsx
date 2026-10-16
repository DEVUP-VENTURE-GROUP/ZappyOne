import { lazy } from 'react';
import { History, Lightbulb, Users, Warehouse } from 'lucide-react';

// Admin's Fleet page: oversight and analysis only; running hubs, rosters and payroll is the Fleet portal's job.
export const ADMIN_FLEET_VIEWS = [
  { id: 'signals', label: 'Signals', icon: Lightbulb, Comp: lazy(() => import('./FleetSignals')) },
  { id: 'hubs', label: 'Hubs compared', icon: Warehouse, Comp: lazy(() => import('./FleetHubsCompared')) },
  { id: 'people', label: 'People', icon: Users, Comp: lazy(() => import('./FleetPeople')) },
  { id: 'activity', label: 'Activity', icon: History, Comp: lazy(() => import('@fleet/features/activity/FleetActivity')) },
];
