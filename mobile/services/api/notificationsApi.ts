/** In-app notification center. URLs mirror client/src/services/api.js. */

import { apiSlice } from './apiSlice';
import type { AppNotification } from '../../types/api';

interface NotificationsEnvelope { notifications: AppNotification[]; unreadCount?: number }

export const notificationsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listNotifications: builder.query<NotificationsEnvelope, { page?: number; unreadOnly?: boolean } | void>({
      query: ({ page = 1, unreadOnly = false } = {}) => ({
        url: '/notifications',
        params: { page, unreadOnly },
      }),
      transformResponse: (r: NotificationsEnvelope | AppNotification[]) =>
        Array.isArray(r) ? { notifications: r } : r,
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
