// Unread notifications for the bell and the Profile tab badge: one query, so both read the same cache.
import { useListNotificationsQuery } from '@zappy/core/api';
import { useLivePoll } from '@zappy/core/hooks/useLivePoll';

export function useUnread(isAuthed: boolean): number {
  const { data } = useListNotificationsQuery({ page: 1, unreadOnly: true }, { skip: !isAuthed, pollingInterval: useLivePoll(60000) });
  return data?.unread ?? data?.notifications?.length ?? 0;
}
