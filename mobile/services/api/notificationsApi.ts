/** In-app notification center. URLs mirror client/src/services/api.js. */

import { apiSlice } from './apiSlice';
import type { AppNotification } from '../../types/api';

/**
 * `GET /notifications` → `{ items, unread }`. Verified against the live
 * response. The previous declaration named them `notifications` and
 * `unreadCount`, neither of which the server sends, so the unread badge could
 * never appear and the list relied on the array fallback below.
 */
export interface NotificationsEnvelope {
  items: AppNotification[];
  unread: number;
  total?: number;
  page?: number;
}

export const notificationsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listNotifications: builder.query<NotificationsEnvelope, { page?: number; unreadOnly?: boolean } | void>({
      query: ({ page = 1, unreadOnly = false } = {}) => ({
        url: '/notifications',
        params: { page, unreadOnly },
      }),
      transformResponse: (r: NotificationsEnvelope | AppNotification[]): NotificationsEnvelope =>
        Array.isArray(r) ? { items: r, unread: 0 } : { ...r, items: r.items ?? [], unread: r.unread ?? 0 },
      providesTags: ['Notification'],
    }),
    markNotificationRead: builder.mutation<void, string>({
      query: (id) => ({ url: `/notifications/${id}/read`, method: 'POST' }),
      invalidatesTags: ['Notification'],
    }),
    markAllNotificationsRead: builder.mutation<void, void>({
      query: () => ({ url: '/notifications/read-all', method: 'POST' }),
      invalidatesTags: ['Notification'],
    }),
  }),
});

export const {
  useListNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} = notificationsApi;
