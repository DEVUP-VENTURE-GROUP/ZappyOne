import { Navigate } from 'react-router-dom';
import { useRepairVerticalsQuery } from '@shared/services/api';
import EventsHomePage from './EventsHomePage';

// Events now run on the one store engine: once the Event decoration line is live, /events opens its stores; until then the old events page stays.
export default function EventsEntry() {
  const { data, isLoading } = useRepairVerticalsQuery();
  if (isLoading) return null;
  const live = (data?.items || []).some((v) => v.vertical === 'event_decoration' && v.status === 'live');
  return live ? <Navigate to="/providers/event-decoration" replace /> : <EventsHomePage />;
}
