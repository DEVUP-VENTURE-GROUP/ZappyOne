import { Redirect } from 'expo-router';
import { useRepairVerticalsQuery } from '@zappy/core/api';
import { EventsHomePage } from '../../src/features/events/EventsHomePage';

// Events now run on the one store engine: once the Event decoration line is live, Events opens its stores; until then the old events page stays (the website's EventsEntry).
export default function EventsEntry() {
  const { data, isLoading } = useRepairVerticalsQuery(undefined);
  if (isLoading) return null;
  const live = ((data?.items || []) as { vertical: string; status?: string }[]).some((v) => v.vertical === 'event_decoration' && v.status === 'live');
  return live ? <Redirect href={'/providers/event-decoration' as never} /> : <EventsHomePage />;
}
