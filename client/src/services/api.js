import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { Mutex } from 'async-mutex';
import toast from 'react-hot-toast';
import { setAuth, logout } from '../modules/auth/authSlice';
import { adminApiPath } from '../config/admin';

// Debounced "signed out on another device" notice — a burst of in-flight requests
// all 401 at once, but the user should see the message only once.
let _sessionReplacedAt = 0;
function sessionReplacedToast() {
  if (Date.now() - _sessionReplacedAt < 4000) return;
  _sessionReplacedAt = Date.now();
  toast.error('You were signed out — your account was opened on another device.', { id: 'session-replaced', duration: 5000 });
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: `${import.meta.env.VITE_API_URL || ''}/api`,
  // credentials: 'include' sends the httpOnly refresh-token cookie on every request.
  // The server only reads it on /auth/refresh and /auth/logout — all other routes
  // ignore it. Required for the silent refresh flow. (#78)
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = getState().auth.accessToken;
    if (token) headers.set('authorization', `Bearer ${token}`);
    return headers;
  },
});

// Mutex: guards concurrent 401s within the SAME tab.
const refreshMutex = new Mutex();

// BroadcastChannel: syncs the new access token across multiple open tabs so
// only ONE tab ever sends a /auth/refresh request at a time. Without this,
// two tabs expiring simultaneously both call refresh with the same old cookie,
// triggering RT_REUSE detection which burns the family and logs everyone out.
const _bc = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('zappy_token_refresh')
  : null;

let _lastCrossTabToken = null;    // AT broadcast from another tab
let _lastCrossTabTs   = 0;        // timestamp of that broadcast

if (_bc) {
  _bc.onmessage = (ev) => {
    if (ev.data?.type === 'TOKEN_REFRESHED' && ev.data?.accessToken) {
      _lastCrossTabToken = ev.data.accessToken;
      _lastCrossTabTs    = Date.now();
    }
  };
}

const baseQueryWithReauth = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status !== 401) return result;

  // Single-device: this worker's session was replaced by a login on another
  // device. Refreshing would fail anyway (family revoked) — log out immediately
  // with a clear message instead of a silent failure.
  if (result.error?.data?.code === 'SESSION_REPLACED') {
    api.dispatch(logout());
    try { sessionReplacedToast(); } catch { /* noop */ }
    return result;
  }

  // Never try to refresh if this IS the refresh call
  if (typeof args !== 'string' && args.url === '/auth/refresh') return result;

  // If another tab refreshed within the last 5 seconds, use that token directly.
  // This prevents the multi-tab race that triggers RT_REUSE on the server.
  if (_lastCrossTabToken && Date.now() - _lastCrossTabTs < 5000) {
    const state = api.getState();
    api.dispatch(setAuth({ accessToken: _lastCrossTabToken, profile: state.auth.profile, role: state.auth.role }));
    return rawBaseQuery(args, api, extraOptions);
  }

  // Wait if another request in THIS tab is already refreshing
  if (refreshMutex.isLocked()) {
    await refreshMutex.waitForUnlock();
    return rawBaseQuery(args, api, extraOptions);
  }

  const release = await refreshMutex.acquire();
  try {
    const state = api.getState();
    const refreshRes = await rawBaseQuery(
      { url: '/auth/refresh', method: 'POST' },
      api,
      extraOptions
    );
    if (refreshRes.data?.accessToken) {
      const newAt = refreshRes.data.accessToken;
      api.dispatch(setAuth({ accessToken: newAt, profile: state.auth.profile, role: state.auth.role }));
      // Tell all other open tabs — they should NOT attempt their own refresh
      _bc?.postMessage({ type: 'TOKEN_REFRESHED', accessToken: newAt });
      _lastCrossTabToken = newAt;
      _lastCrossTabTs    = Date.now();
      result = await rawBaseQuery(args, api, extraOptions);
    } else {
      // Refresh failed (RT_REUSE, RT_REVOKED, expired). Log the user out.
      api.dispatch(logout());
    }
  } finally {
    release();
  }
  return result;
};

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  // Disable refetch-on-focus — dashboard fires 6-8 queries; tab switching floods the limiter
  refetchOnFocus: false,
  refetchOnReconnect: true,
  // Keep fetched data cached for 5 min after a component unmounts, so jumping
  // back to a tab shows data instantly (no skeleton) instead of refetching.
  keepUnusedDataFor: 300,
  tagTypes: ['Me', 'Order', 'Worker', 'Earnings', 'AdminMetrics', 'Kyc', 'Plan', 'Subscription', 'Wallet', 'Notification', 'AdminUsers', 'Disputes', 'Payouts', 'Incentives', 'CancellationConfig', 'PricingCfg', 'AuditLogs', 'Addresses', 'Ad', 'Promo', 'Gamification', 'Recommendations', 'FeatureFlags', 'SupportTickets', 'Referral', 'ShieldFund', 'EventTheme', 'EventBooking', 'EventPartner', 'EventConfig', 'EventCategory', 'PartnerNotification', 'Fraud', 'Zone', 'City', 'PaymentMethods', 'UserDisputes', 'UserTickets', 'AdminAppeals', 'AdminTraining', 'WorkerGoals', 'Plans', 'Content', 'Rewards', 'WorkerOps', 'ReadyMode'],
  endpoints: (b) => ({
    // --- Auth ---
    requestOtp: b.mutation({
      query: (body) => ({ url: '/auth/otp/request', method: 'POST', body }),
    }),
    resendOtp: b.mutation({
      query: (body) => ({ url: '/auth/otp/resend', method: 'POST', body }),
    }),
    loginUser: b.mutation({
      query: (body) => ({ url: '/auth/user/login', method: 'POST', body }),
    }),
    loginWorker: b.mutation({
      query: (body) => ({ url: '/auth/worker/login', method: 'POST', body }),
    }),
    // Worker credential login (#2)
    loginWorkerPassword: b.mutation({
      query: (body) => ({ url: '/auth/worker/login-password', method: 'POST', body }),
    }),
    setWorkerCredentials: b.mutation({
      query: (body) => ({ url: '/auth/worker/set-credentials', method: 'POST', body }),
    }),
    forgotWorkerPassword: b.mutation({
      query: (body) => ({ url: '/auth/worker/forgot-password', method: 'POST', body }),
    }),
    resetWorkerPassword: b.mutation({
      query: (body) => ({ url: '/auth/worker/reset-password', method: 'POST', body }),
    }),
    changeWorkerPassword: b.mutation({
      query: (body) => ({ url: '/auth/worker/change-password', method: 'POST', body }),
    }),
    loginAdmin: b.mutation({
      query: (body) => ({ url: '/auth/admin/login', method: 'POST', body }),
    }),
    loginEventPartner: b.mutation({
      query: (body) => ({ url: '/auth/partner/login', method: 'POST', body }),
    }),
    googlePartnerLogin: b.mutation({
      query: (body) => ({ url: '/auth/partner/google', method: 'POST', body }),
    }),
    logout: b.mutation({
      query: (refreshToken) => ({ url: '/auth/logout', method: 'POST', body: { refreshToken } }),
    }),
    revokeAllSessions: b.mutation({
      query: () => ({ url: '/auth/revoke-all', method: 'POST' }),
    }),
    verifySensitiveOtp: b.mutation({
      query: (otp) => ({ url: '/auth/otp/verify-action', method: 'POST', body: { otp } }),
    }),

    // --- User ---
    getMe: b.query({ query: () => '/users/me', providesTags: ['Me'] }),
    updateMe: b.mutation({
      query: (body) => ({ url: '/users/me', method: 'PATCH', body }),
      invalidatesTags: ['Me'],
    }),
    getAddresses: b.query({
      query: () => '/users/addresses',
      providesTags: ['Addresses'],
    }),
    addAddress: b.mutation({
      query: (body) => ({ url: '/users/addresses', method: 'POST', body }),
      invalidatesTags: ['Addresses'],
    }),
    deleteAddress: b.mutation({
      query: (addrId) => ({ url: `/users/addresses/${addrId}`, method: 'DELETE' }),
      invalidatesTags: ['Addresses'],
    }),
    editAddress: b.mutation({
      query: ({ addrId, ...body }) => ({ url: `/users/addresses/${addrId}`, method: 'PATCH', body }),
      invalidatesTags: ['Addresses'],
    }),
    setDefaultAddress: b.mutation({
      query: (addrId) => ({ url: `/users/addresses/${addrId}/default`, method: 'PATCH' }),
      invalidatesTags: ['Addresses'],
    }),
    // Payment methods
    getPaymentMethods: b.query({
      query: () => '/users/payment-methods',
      providesTags: ['PaymentMethods'],
    }),
    addPaymentMethod: b.mutation({
      query: (body) => ({ url: '/users/payment-methods', method: 'POST', body }),
      invalidatesTags: ['PaymentMethods'],
    }),
    deletePaymentMethod: b.mutation({
      query: (methodId) => ({ url: `/users/payment-methods/${methodId}`, method: 'DELETE' }),
      invalidatesTags: ['PaymentMethods'],
    }),
    setDefaultPaymentMethod: b.mutation({
      query: (methodId) => ({ url: `/users/payment-methods/${methodId}/default`, method: 'PATCH' }),
      invalidatesTags: ['PaymentMethods'],
    }),
    // Disputes (user-facing)
    getMyDisputes: b.query({
      query: () => '/disputes/mine',
      providesTags: ['UserDisputes'],
    }),
    getDispute: b.query({
      query: (id) => `/disputes/${id}`,
      providesTags: (r, e, id) => [{ type: 'UserDisputes', id }],
    }),
    openDispute: b.mutation({
      query: (body) => ({ url: '/disputes', method: 'POST', body }),
      invalidatesTags: ['UserDisputes'],
    }),
    addDisputeMessage: b.mutation({
      query: ({ id, text }) => ({ url: `/disputes/${id}/messages`, method: 'POST', body: { text } }),
      invalidatesTags: (r, e, a) => [{ type: 'UserDisputes', id: a.id }],
    }),
    // Support tickets (user-facing)
    getMyTickets: b.query({
      query: () => '/support/mine',
      providesTags: ['UserTickets'],
    }),
    getTicket: b.query({
      query: (id) => `/support/${id}`,
      providesTags: (r, e, id) => [{ type: 'UserTickets', id }],
    }),
    createTicket: b.mutation({
      query: (body) => ({ url: '/support', method: 'POST', body }),
      invalidatesTags: ['UserTickets'],
    }),
    addTicketMessage: b.mutation({
      query: ({ id, text }) => ({ url: `/support/${id}/messages`, method: 'POST', body: { text } }),
      invalidatesTags: (r, e, a) => [{ type: 'UserTickets', id: a.id }],
    }),
    saveRecentLocation: b.mutation({
      query: (body) => ({ url: '/users/recent-location', method: 'POST', body }),
    }),
    registerDeviceToken: b.mutation({
      query: (body) => ({ url: '/users/device-token', method: 'POST', body }),
    }),
    registerWorkerDeviceToken: b.mutation({
      query: (body) => ({ url: '/workers/device-token', method: 'POST', body }),
    }),

    // --- Pricing quote ---
    getQuote: b.query({ query: (params) => ({ url: '/orders/quote', params }) }),

    // Worker-choice: top-ranked available pros near pickup (optional picker at checkout).
    getNearbyPros: b.query({ query: (params) => ({ url: '/orders/nearby-pros', params }) }),

    // --- ZeroWait Instant Match ---
    // Warm dispatch: is a pre-accepted pro standing by? (checkout, before payment)
    getWarmDispatch: b.query({ query: (params) => ({ url: '/orders/warm', params }) }),
    // Worker Ready Mode (pre-accept next matching job)
    getReadyMode: b.query({ query: () => '/workers/ready', providesTags: ['ReadyMode'] }),
    setReadyMode: b.mutation({
      query: (body) => ({ url: '/workers/ready', method: 'POST', body }),
      invalidatesTags: ['ReadyMode'],
    }),

    // --- Unified Search (Zepto-level: fuzzy + intent + rank + never-empty) ---
    smartSearch: b.query({ query: (params) => ({ url: '/search', params }) }),
    searchSuggest: b.query({ query: (params) => ({ url: '/search/suggest', params }) }),
    searchTrending: b.query({ query: () => '/search/trending' }),

    // --- Orders ---
    createOrder: b.mutation({
      query: (body) => ({ url: '/orders', method: 'POST', body }),
      invalidatesTags: ['Order'],
    }),
    getOrder: b.query({
      query: (id) => `/orders/${id}`,
      providesTags: (r, e, id) => [{ type: 'Order', id }],
    }),
    // Real per-status timestamps from statusHistory — powers the tracking
    // timeline + live activity feed with grounded times (never fabricated).
    getOrderTimeline: b.query({
      query: (id) => `/orders/${id}/timeline`,
      providesTags: (r, e, id) => [{ type: 'Order', id }],
    }),
    listOrders: b.query({
      query: (page = 1) => `/orders/mine?page=${page}`,
      providesTags: ['Order'],
    }),
    getCancelPreview: b.query({
      query: (id) => `/orders/${id}/cancel-preview`,
    }),
    rebookOrder: b.mutation({
      query: (id) => ({ url: `/orders/${id}/rebook`, method: 'POST' }),
      invalidatesTags: ['Order'],
    }),
    cancelOrder: b.mutation({
      query: ({ id, reason }) => ({ url: `/orders/${id}/cancel`, method: 'POST', body: { reason } }),
      // Optimistic: flip status to cancelled immediately, roll back on failure.
      async onQueryStarted({ id }, { dispatch, queryFulfilled }) {
        const patch = dispatch(api.util.updateQueryData('getOrder', id, (draft) => {
          if (draft?.order) draft.order.status = 'cancelled';
        }));
        try { await queryFulfilled; } catch { patch.undo(); }
      },
      invalidatesTags: (r, e, a) => ['Order', { type: 'Order', id: a.id }],
    }),
    workerReportNoResponse: b.mutation({
      query: (id) => ({ url: `/orders/${id}/no-response`, method: 'POST' }),
      invalidatesTags: (r, e, id) => [{ type: 'Order', id }],
    }),
    workerReportPartUnavailable: b.mutation({
      query: ({ id, partName, notes }) => ({ url: `/orders/${id}/part-unavailable`, method: 'POST', body: { partName, notes } }),
      invalidatesTags: (r, e, a) => [{ type: 'Order', id: a.id }],
    }),
    rateOrder: b.mutation({
      query: ({ id, rating, review }) => ({
        url: `/orders/${id}/rate`,
        method: 'POST',
        body: { rating, review },
      }),
      // Optimistic: reflect the rating instantly so the UI switches to "rated".
      async onQueryStarted({ id, rating, review }, { dispatch, queryFulfilled }) {
        const patch = dispatch(api.util.updateQueryData('getOrder', id, (draft) => {
          if (draft?.order) { draft.order.rating = rating; if (review != null) draft.order.review = review; }
        }));
        try { await queryFulfilled; } catch { patch.undo(); }
      },
      invalidatesTags: (r, e, a) => [{ type: 'Order', id: a.id }],
    }),
    getOrderInvoiceUrl: b.query({
      query: (id) => `/orders/${id}/invoice`,
    }),

    // --- Chat ---
    getChatMessages: b.query({
      query: ({ orderId, limit = 50 }) => `/orders/${orderId}/chat?limit=${limit}`,
      providesTags: (r, e, { orderId }) => [{ type: 'Order', id: `chat-${orderId}` }],
    }),
    sendChatMessage: b.mutation({
      query: ({ orderId, text, cannedCode }) => ({
        url: `/orders/${orderId}/chat`,
        method: 'POST',
        body: { text, cannedCode },
      }),
    }),

    // --- Worker ---
    getWorkerMe: b.query({ query: () => '/workers/me', providesTags: ['Me', 'Worker'] }),
    updateWorkerProfile: b.mutation({
      query: (body) => ({ url: '/workers/profile', method: 'PATCH', body }),
      invalidatesTags: ['Me'],
    }),
    goOnline: b.mutation({
      query: (body) => ({ url: '/workers/online', method: 'POST', body }),
      invalidatesTags: ['Me'],
    }),
    goOffline: b.mutation({
      query: () => ({ url: '/workers/offline', method: 'POST' }),
      invalidatesTags: ['Me'],
    }),
    getEarnings: b.query({
      query: (range = 'today') => `/workers/earnings?range=${range}`,
      providesTags: ['Earnings'],
    }),
    workerAccept: b.mutation({
      query: (id) => ({ url: `/orders/${id}/accept`, method: 'POST' }),
    }),
    workerReject: b.mutation({
      query: (id) => ({ url: `/orders/${id}/reject`, method: 'POST' }),
    }),
    workerStartTrip: b.mutation({
      query: ({ id, lat, lng } = {}) => ({
        url: `/orders/${id}/start-trip`,
        method: 'POST',
        body: lat != null && lng != null ? { lat, lng } : {},
      }),
      invalidatesTags: (r, e, a) => [{ type: 'Order', id: a?.id ?? a }],
    }),
    workerArrive: b.mutation({
      query: (id) => ({ url: `/orders/${id}/arrived`, method: 'POST' }),
      invalidatesTags: (r, e, id) => [{ type: 'Order', id }],
    }),
    workerStartService: b.mutation({
      query: ({ id, otp }) => ({ url: `/orders/${id}/start-service`, method: 'POST', body: { otp } }),
      invalidatesTags: (r, e, a) => [{ type: 'Order', id: a.id }],
    }),
    workerComplete: b.mutation({
      query: ({ id, completionPhotos = [] }) => ({
        url: `/orders/${id}/complete`,
        method: 'POST',
        body: { completionPhotos },
      }),
      invalidatesTags: (r, e, a) => ['Order', 'Earnings', { type: 'Order', id: a.id }],
    }),
    getWorkerOrders: b.query({
      query: (page = 1) => `/workers/orders?page=${page}`,
      providesTags: ['Order'],
    }),
    // Worker cancels an accepted job (before service starts). Preview shows the
    // penalty/consequences for the chosen reason before they confirm.
    getWorkerCancelPreview: b.query({
      query: ({ id, reason }) => ({ url: `/orders/${id}/worker-cancel-preview`, params: reason ? { reason } : {} }),
    }),
    workerCancel: b.mutation({
      query: ({ id, reason }) => ({ url: `/orders/${id}/worker-cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: (r, e, a) => ['Order', 'Me', { type: 'Order', id: a.id }],
    }),
    getNearbyWorkers: b.query({
      query: ({ lat, lng }) => `/workers/nearby?lat=${lat}&lng=${lng}`,
    }),
    getDemandZones: b.query({
      query: ({ lat, lng }) => `/workers/demand-zones?lat=${lat}&lng=${lng}`,
    }),

    // --- KYC ---
    getKycStatus: b.query({ query: () => '/workers/kyc/status', providesTags: ['Kyc'] }),
    submitKyc: b.mutation({
      query: (body) => ({ url: '/workers/kyc/submit', method: 'POST', body }),
      invalidatesTags: ['Kyc', 'Me'],
    }),
    presignUpload: b.mutation({
      query: (body) => ({ url: '/uploads/presign', method: 'POST', body }),
    }),

    // --- ZappyLens (visual service search) ---
    lensUploadUrl: b.mutation({
      query: (body) => ({ url: '/lens/upload-url', method: 'POST', body }), // { contentType } → { uploadUrl, key }
    }),
    analyzeLens: b.mutation({
      query: (body) => ({ url: '/lens/analyze', method: 'POST', body }),    // { imageKeys, lat?, lng? }
    }),
    getLensScan: b.query({
      query: (id) => `/lens/scan/${id}`,
    }),

    // --- Content (admin-managed FAQs + policy pages) ---
    getFaqs: b.query({
      query: (audience) => `/content/faqs${audience ? `?audience=${audience}` : ''}`,
      providesTags: ['Content'],
    }),
    getPolicy: b.query({
      query: (slug) => `/content/policy/${slug}`,
      providesTags: (r, e, slug) => [{ type: 'Content', id: slug }],
    }),
    getPolicies: b.query({
      query: () => '/content/policies',
      providesTags: ['Content'],
    }),
    adminListContent: b.query({
      query: (type) => ({ url: adminApiPath('/content'), params: type ? { type } : {} }),
      providesTags: ['Content'],
    }),
    adminCreateContent: b.mutation({
      query: (body) => ({ url: adminApiPath('/content'), method: 'POST', body }),
      invalidatesTags: ['Content'],
    }),
    adminUpdateContent: b.mutation({
      query: ({ id, ...body }) => ({ url: adminApiPath(`/content/${id}`), method: 'PUT', body }),
      invalidatesTags: ['Content'],
    }),
    adminToggleContent: b.mutation({
      query: ({ id, isActive }) => ({ url: adminApiPath(`/content/${id}/active`), method: 'PATCH', body: { isActive } }),
      invalidatesTags: ['Content'],
    }),
    adminDeleteContent: b.mutation({
      query: (id) => ({ url: adminApiPath(`/content/${id}`), method: 'DELETE' }),
      invalidatesTags: ['Content'],
    }),

    // --- Rewards (points + scratch cards) ---
    getRewards: b.query({ query: () => '/rewards', providesTags: ['Rewards'] }),
    redeemRewardPoints: b.mutation({
      query: (points) => ({ url: '/rewards/redeem', method: 'POST', body: { points } }),
      invalidatesTags: ['Rewards', 'Wallet'],
    }),
    scratchRewardCard: b.mutation({
      query: (cardId) => ({ url: `/rewards/scratch/${cardId}`, method: 'POST' }),
      invalidatesTags: ['Rewards', 'Wallet'],
    }),
    adminGetRewardsConfig: b.query({ query: () => adminApiPath('/rewards-config'), providesTags: ['Rewards'] }),
    adminUpdateRewardsConfig: b.mutation({
      query: (body) => ({ url: adminApiPath('/rewards-config'), method: 'PUT', body }),
      invalidatesTags: ['Rewards'],
    }),
    adminGrantRewardPoints: b.mutation({
      query: (body) => ({ url: adminApiPath('/rewards-config/grant'), method: 'POST', body }),
    }),

    // --- Worker KYC: 3rd-party API verification ---
    adminResetWorkerDevices: b.mutation({
      query: (id) => ({ url: adminApiPath(`/workers/${id}/reset-devices`), method: 'POST' }),
    }),
    adminRunKycVerify: b.mutation({
      query: ({ id, pan }) => ({ url: adminApiPath(`/workers/${id}/kyc/verify`), method: 'POST', body: pan ? { pan } : {} }),
      invalidatesTags: ['Kyc'],
    }),

    // --- Admin ---
    adminMetrics: b.query({ query: () => adminApiPath('/metrics'), providesTags: ['AdminMetrics'] }),
    adminOrders: b.query({
      query: ({ status, page = 1, reconciliationRequired } = {}) => ({
        url: adminApiPath('/orders'),
        params: { status, page, ...(reconciliationRequired && { reconciliationRequired: 'true' }) },
      }),
    }),
    adminWorkers: b.query({
      query: ({ q, skill, online, page = 1 } = {}) => ({
        url: adminApiPath('/workers'),
        params: { q, skill, online, page },
      }),
    }),
    adminBlockWorker: b.mutation({
      query: ({ id, blocked }) => ({
        url: adminApiPath(`/workers/${id}/block`),
        method: 'POST',
        body: { blocked },
      }),
      invalidatesTags: ['Worker'],
    }),
    adminKycPending: b.query({
      query: () => adminApiPath('/kyc/pending'),
      providesTags: ['Kyc'],
    }),
    adminKycApprove: b.mutation({
      query: (id) => ({ url: adminApiPath(`/workers/${id}/kyc/approve`), method: 'POST' }),
      invalidatesTags: ['Kyc'],
    }),
    adminKycReject: b.mutation({
      query: ({ id, reason }) => ({
        url: adminApiPath(`/workers/${id}/kyc/reject`),
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: ['Kyc'],
    }),

    // --- Plans / Subscriptions ---
    listPlans: b.query({
      query: (audience) => `/subscriptions/plans${audience ? `?audience=${audience}` : ''}`,
      providesTags: ['Plan'],
    }),
    mySubscription: b.query({
      query: () => '/subscriptions/me',
      providesTags: ['Subscription'],
    }),
    subscribe: b.mutation({
      query: (planCode) => ({
        url: '/subscriptions/subscribe',
        method: 'POST',
        body: { planCode },
      }),
    }),
    cancelSubscription: b.mutation({
      query: (id) => ({ url: `/subscriptions/${id}/cancel`, method: 'POST' }),
      invalidatesTags: ['Subscription'],
    }),

    // --- Wallet ---
    getWallet: b.query({ query: () => '/wallet', providesTags: ['Wallet'] }),
    walletTransactions: b.query({
      query: ({ page = 1, limit = 50 } = {}) => `/wallet/transactions?page=${page}&limit=${limit}`,
      providesTags: ['Wallet'],
    }),
    walletTopup: b.mutation({
      query: (amountPaise) => ({
        url: '/wallet/topup',
        method: 'POST',
        body: { amountPaise },
      }),
    }),

    // --- Payments ---
    verifyPayment: b.mutation({
      query: (body) => ({ url: '/payments/verify', method: 'POST', body }),
      invalidatesTags: ['Subscription', 'Wallet'],
    }),

    // --- Notifications ---
    listNotifications: b.query({
      query: ({ page = 1, unreadOnly = false } = {}) =>
        `/notifications?page=${page}&unreadOnly=${unreadOnly}`,
      providesTags: ['Notification'],
    }),
    markNotificationRead: b.mutation({
      query: (id) => ({ url: `/notifications/${id}/read`, method: 'POST' }),
      // Optimistic: mark read instantly (set readAt in the "all" view, drop it from
      // the "unread" view), roll back if the request fails.
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        const patches = [];
        for (const unreadOnly of [false, true]) {
          patches.push(dispatch(api.util.updateQueryData('listNotifications', { page: 1, unreadOnly }, (draft) => {
            if (!draft?.notifications) return;
            if (unreadOnly) {
              draft.notifications = draft.notifications.filter((n) => String(n._id) !== String(id));
            } else {
              const n = draft.notifications.find((x) => String(x._id) === String(id));
              if (n && !n.readAt) n.readAt = new Date().toISOString();
            }
          })));
        }
        try { await queryFulfilled; } catch { patches.forEach((p) => p.undo()); }
      },
      invalidatesTags: ['Notification'],
    }),
    markAllNotificationsRead: b.mutation({
      query: () => ({ url: '/notifications/read-all', method: 'POST' }),
      invalidatesTags: ['Notification'],
    }),

    // --- Pricing (public) ---
    getPricingConfig: b.query({ query: () => '/pricing', providesTags: ['PricingCfg'] }),
    adminUpdatePricing: b.mutation({
      query: (body) => ({ url: adminApiPath('/pricing'), method: 'PATCH', body }),
      invalidatesTags: ['PricingCfg'],
    }),
    adminToggles: b.mutation({
      query: (body) => ({ url: adminApiPath('/toggles'), method: 'PATCH', body }),
      invalidatesTags: ['PricingCfg'],
    }),
    adminToggleDispatch: b.mutation({
      query: (body) => ({ url: adminApiPath('/dispatch/toggle'), method: 'PATCH', body }),
      invalidatesTags: ['PricingCfg'],
    }),
    adminRevenue: b.query({
      query: (days = 7) => adminApiPath(`/revenue?days=${days}`),
    }),

    // --- Admin: Extended ---
    adminAnalytics: b.query({
      query: (days = 30) => adminApiPath(`/analytics?days=${days}`),
    }),
    adminOtpAnalytics: b.query({
      query: (days = 7) => adminApiPath(`/otp-analytics?days=${days}`),
    }),
    // Founder Audit (scenarios 96-98)
    adminOrderAudit: b.query({
      query: (orderId) => adminApiPath(`/audit/order/${orderId}`),
    }),
    adminCommissionAudit: b.query({
      query: (days = 7) => adminApiPath(`/audit/commission?days=${days}`),
    }),
    adminWorkerTrustAudit: b.query({
      query: () => adminApiPath('/audit/worker-trust'),
    }),
    adminReconciliationQueue: b.query({
      query: () => adminApiPath('/payments/reconciliation-queue'),
    }),
    adminReconcilePayment: b.mutation({
      query: (razorpayOrderId) => ({ url: adminApiPath(`/payments/${razorpayOrderId}/reconcile`), method: 'POST' }),
    }),
    // Business Intelligence (scenarios 81-85)
    adminServicePnL: b.query({
      query: (days = 30) => adminApiPath(`/business/service-pnl?days=${days}`),
    }),
    adminChurnRisk: b.query({
      query: () => adminApiPath('/business/churn-risk'),
    }),
    adminDeadCategories: b.query({
      query: (days = 30) => adminApiPath(`/business/dead-categories?days=${days}`),
    }),
    adminGeoReadiness: b.query({
      query: ({ lat, lng, radiusKm = 15 }) => adminApiPath(`/business/geo-readiness?lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`),
    }),
    adminQuoteAbandonment: b.query({
      query: (days = 7) => adminApiPath(`/business/quote-abandonment?days=${days}`),
    }),

    // Intelligence & Expansion dashboard
    adminIntelLiveTraffic: b.query({
      query: () => adminApiPath('/intelligence/live-traffic'),
    }),
    adminIntelVisitorLocations: b.query({
      query: (days = 30) => adminApiPath(`/intelligence/visitor-locations?days=${days}`),
    }),
    adminIntelDemand: b.query({
      query: (days = 30) => adminApiPath(`/intelligence/demand?days=${days}`),
    }),
    adminIntelUnmetDemand: b.query({
      query: (days = 30) => adminApiPath(`/intelligence/unmet-demand?days=${days}`),
    }),
    adminIntelExpansion: b.query({
      query: (days = 30) => adminApiPath(`/intelligence/expansion?days=${days}`),
    }),
    adminIntelCeo: b.query({
      query: () => adminApiPath('/intelligence/ceo'),
    }),
    adminIntelFunnel: b.query({
      query: (days = 30) => adminApiPath(`/intelligence/funnel?days=${days}`),
    }),
    adminIntelReport: b.query({
      query: (period = 'daily') => adminApiPath(`/intelligence/report?period=${period}`),
    }),
    adminIntelPartners: b.query({
      query: (days = 30) => adminApiPath(`/intelligence/partners?days=${days}`),
    }),

    // Admin push notifications — via RTK so they ride the silent token-refresh
    // (previously raw fetch() → 401 'Invalid or expired token' on AT expiry).
    adminNotificationHealth: b.query({
      query: () => adminApiPath('/notifications/health'),
    }),
    adminNotificationStats: b.query({
      query: (days = 7) => adminApiPath(`/notifications/stats?days=${days}`),
    }),
    adminSendNotification: b.mutation({
      query: (body) => ({ url: adminApiPath('/notifications/send'), method: 'POST', body }),
    }),
    adminBroadcastNotification: b.mutation({
      query: (body) => ({ url: adminApiPath('/notifications/broadcast'), method: 'POST', body }),
    }),
    adminListUsers: b.query({
      query: ({ q, blocked, page = 1 } = {}) => ({ url: adminApiPath('/users'), params: { q, blocked, page } }),
      providesTags: ['AdminUsers'],
    }),
    adminGetUser: b.query({
      query: (id) => adminApiPath(`/users/${id}`),
      providesTags: (r, e, id) => [{ type: 'AdminUsers', id }],
    }),
    adminBlockUser: b.mutation({
      query: ({ id, blocked }) => ({ url: adminApiPath(`/users/${id}/block`), method: 'POST', body: { blocked } }),
      invalidatesTags: ['AdminUsers'],
    }),
    adminGetPricingConfig: b.query({
      query: () => adminApiPath('/pricing-config'),
      providesTags: ['PricingCfg'],
    }),
    adminSetPricingConfig: b.mutation({
      query: (body) => ({ url: adminApiPath('/pricing-config'), method: 'PUT', body }),
      invalidatesTags: ['PricingCfg'],
    }),
    adminWalletAdjust: b.mutation({
      query: (body) => ({ url: adminApiPath('/wallet/adjust'), method: 'POST', body }),
    }),
    adminWalletReconcile: b.mutation({
      query: ({ kind, id }) => ({ url: adminApiPath(`/wallet/reconcile/${kind}/${id}`), method: 'POST' }),
    }),
    adminAuditLogs: b.query({
      query: ({ action, actorId, page = 1 } = {}) => ({ url: adminApiPath('/audit-logs'), params: { action, actorId, page } }),
      providesTags: ['AuditLogs'],
    }),
    adminDisputes: b.query({
      query: ({ status = 'open', page = 1 } = {}) => ({ url: adminApiPath('/disputes'), params: { status, page } }),
      providesTags: ['Disputes'],
    }),
    adminResolveDispute: b.mutation({
      query: ({ id, ...body }) => ({ url: adminApiPath(`/disputes/${id}/resolve`), method: 'POST', body }),
      invalidatesTags: ['Disputes'],
    }),
    adminPayouts: b.query({
      query: ({ status, page = 1 } = {}) => ({ url: adminApiPath('/payouts'), params: { status, page } }),
      providesTags: ['Payouts'],
    }),
    adminApprovePayout: b.mutation({
      query: (id) => ({ url: adminApiPath(`/payouts/${id}/approve`), method: 'POST' }),
      invalidatesTags: ['Payouts'],
    }),
    adminRejectPayout: b.mutation({
      query: ({ id, reason }) => ({ url: adminApiPath(`/payouts/${id}/reject`), method: 'POST', body: { reason } }),
      invalidatesTags: ['Payouts'],
    }),
    adminProcessPayout: b.mutation({
      query: (id) => ({ url: adminApiPath(`/payouts/${id}/process`), method: 'POST' }),
      invalidatesTags: ['Payouts'],
    }),
    adminGetIncentives: b.query({
      query: () => adminApiPath('/incentives'),
      providesTags: ['Incentives'],
    }),
    adminSetMilestones: b.mutation({
      query: (milestones) => ({ url: adminApiPath('/incentives/milestones'), method: 'PUT', body: { milestones } }),
      invalidatesTags: ['Incentives'],
    }),
    adminRatingSweep: b.mutation({
      query: () => ({ url: adminApiPath('/incentives/rating-sweep'), method: 'POST' }),
    }),
    adminListDeferredMilestones: b.query({
      query: () => adminApiPath('/incentives/deferred'),
      providesTags: ['DeferredMilestones'],
    }),
    adminReleaseDeferredMilestone: b.mutation({
      query: ({ workerId, milestone }) => ({
        url: adminApiPath(`/incentives/deferred/${workerId}/${milestone}/release`),
        method: 'POST',
      }),
      invalidatesTags: ['DeferredMilestones'],
    }),

    // --- Admin: Cashback ---
    adminGetCashbackConfig: b.query({
      query: () => adminApiPath('/cashback/config'),
      providesTags: ['CashbackConfig'],
    }),
    adminSetCashbackConfig: b.mutation({
      query: (body) => ({ url: adminApiPath('/cashback/config'), method: 'PUT', body }),
      invalidatesTags: ['CashbackConfig'],
    }),
    adminGetCashbackStats: b.query({
      query: (days = 30) => adminApiPath(`/cashback/stats?days=${days}`),
    }),

    // --- Admin: Referrals ---
    adminGetReferralStats: b.query({
      query: (days = 30) => adminApiPath(`/referrals/stats?days=${days}`),
    }),
    adminListRecentReferrals: b.query({
      query: ({ status, page = 1 } = {}) => ({
        url: adminApiPath('/referrals/recent'),
        params: { ...(status && { status }), page },
      }),
    }),
    adminGetCancellationConfig: b.query({
      query: () => adminApiPath('/cancellation-config'),
      providesTags: ['CancellationConfig'],
    }),
    adminUpdateCancellationConfig: b.mutation({
      query: (body) => ({ url: adminApiPath('/cancellation-config'), method: 'PATCH', body }),
      invalidatesTags: ['CancellationConfig', 'WorkerOps'],
    }),
    adminWorkerOps: b.query({
      query: () => adminApiPath('/worker-ops'),
      providesTags: ['WorkerOps'],
    }),
    adminSearchAnalytics: b.query({
      query: (days = 7) => ({ url: adminApiPath('/search-analytics'), params: { days } }),
    }),
    adminWorkerPenalties: b.query({
      query: (id) => adminApiPath(`/workers/${id}/penalties`),
    }),
    adminKycDocUrls: b.query({
      query: (id) => adminApiPath(`/workers/${id}/kyc/docs`),
      providesTags: (r, e, id) => [{ type: 'Worker', id }],
    }),
    adminDeleteWorker: b.mutation({
      query: ({ id, reason }) => ({ url: adminApiPath(`/workers/${id}`), method: 'DELETE', body: { reason } }),
      invalidatesTags: ['AdminUsers'],
    }),
    adminKycClarify: b.mutation({
      query: ({ id, message }) => ({ url: adminApiPath(`/workers/${id}/kyc/clarify`), method: 'POST', body: { message } }),
    }),
    adminKycChangeRequests: b.query({
      query: () => adminApiPath('/kyc/change-requests'),
      providesTags: ['Kyc'],
    }),
    adminRespondChangeRequest: b.mutation({
      query: ({ id, decision, denialReason }) => ({
        url: adminApiPath(`/workers/${id}/kyc/change-request/respond`),
        method: 'POST',
        body: { decision, denialReason },
      }),
      invalidatesTags: ['Kyc'],
    }),

    // Worker: request document change after approved KYC
    workerRequestDocumentChange: b.mutation({
      query: (message) => ({ url: '/kyc/request-change', method: 'POST', body: { message } }),
      invalidatesTags: ['Kyc'],
    }),
    // Worker: complete onboarding
    workerCompleteOnboarding: b.mutation({
      query: (body) => ({ url: '/workers/onboarding/complete', method: 'POST', body }),
      invalidatesTags: ['Me'],
    }),

    // --- Admin: Subscription Plans ---
    adminListPlans: b.query({
      query: () => adminApiPath('/plans'),
      providesTags: ['Plan'],
    }),
    adminCreatePlan: b.mutation({
      query: (body) => ({ url: adminApiPath('/plans'), method: 'POST', body }),
      invalidatesTags: ['Plan'],
    }),
    adminUpdatePlan: b.mutation({
      query: ({ id, ...body }) => ({ url: adminApiPath(`/plans/${id}`), method: 'PATCH', body }),
      invalidatesTags: ['Plan'],
    }),
    adminDeletePlan: b.mutation({
      query: (id) => ({ url: adminApiPath(`/plans/${id}`), method: 'DELETE' }),
      invalidatesTags: ['Plan'],
    }),

    // --- Ads ---
    getActiveAds: b.query({
      query: () => '/ads',
      providesTags: ['Ad'],
    }),
    getAdsByPlacement: b.query({
      query: ({ placement, category, city, q, limit } = {}) => ({
        url: `/ads/placement/${placement}`,
        params: { category, city, q, limit },
      }),
      providesTags: ['Ad'],
    }),
    trackAdImpression: b.mutation({
      query: ({ id, placement, meta } = {}) => ({
        url: `/ads/${id}/impression`, method: 'POST', body: { placement, meta },
      }),
    }),
    trackAdClick: b.mutation({
      query: ({ id, placement, meta } = {}) => ({
        url: `/ads/${id}/click`, method: 'POST', body: { placement, meta },
      }),
    }),
    // Self-serve advertiser
    myAdCampaigns: b.query({
      query: ({ page = 1 } = {}) => `/ads/my?page=${page}`,
      providesTags: ['Ad'],
    }),
    createMyCampaign: b.mutation({
      query: (body) => ({ url: '/ads/my', method: 'POST', body }),
      invalidatesTags: ['Ad'],
    }),
    updateMyCampaign: b.mutation({
      query: ({ id, ...body }) => ({ url: `/ads/my/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Ad'],
    }),
    myCampaignAnalytics: b.query({
      query: ({ id, days = 7 }) => `/ads/my/${id}/analytics?days=${days}`,
    }),
    myAdWallet: b.query({
      query: () => '/ads/my/wallet',
      providesTags: ['Ad'],
    }),
    createAdTopUpOrder: b.mutation({
      query: (body) => ({ url: '/ads/my/wallet/topup', method: 'POST', body }),
    }),
    verifyAdTopUp: b.mutation({
      query: (body) => ({ url: '/ads/my/wallet/topup/verify', method: 'POST', body }),
      invalidatesTags: ['Ad'],
    }),
    // Admin: Ads
    adminListAds: b.query({
      query: ({ status, audience, page = 1 } = {}) => {
        const params = new URLSearchParams({ page });
        if (status)   params.set('status', status);
        if (audience) params.set('audience', audience);
        return adminApiPath(`/ads?${params}`);
      },
      providesTags: ['Ad'],
    }),
    adminCreateAd: b.mutation({
      query: (body) => ({ url: adminApiPath('/ads'), method: 'POST', body }),
      invalidatesTags: ['Ad'],
    }),
    adminUpdateAd: b.mutation({
      query: ({ id, ...body }) => ({ url: adminApiPath(`/ads/${id}`), method: 'PATCH', body }),
      invalidatesTags: ['Ad'],
    }),
    adminDeleteAd: b.mutation({
      query: (id) => ({ url: adminApiPath(`/ads/${id}`), method: 'DELETE' }),
      invalidatesTags: ['Ad'],
    }),
    adminApproveAd: b.mutation({
      query: (id) => ({ url: adminApiPath(`/ads/${id}/approve`), method: 'POST' }),
      invalidatesTags: ['Ad'],
    }),
    adminRejectAd: b.mutation({
      query: ({ id, note }) => ({ url: adminApiPath(`/ads/${id}/reject`), method: 'POST', body: { note } }),
      invalidatesTags: ['Ad'],
    }),
    adminAdAnalytics: b.query({
      query: ({ id, days = 7 }) => adminApiPath(`/ads/${id}/analytics?days=${days}`),
    }),
    adminAdWallets: b.query({
      query: ({ page = 1 } = {}) => adminApiPath(`/ads/wallets?page=${page}`),
      providesTags: ['Ad'],
    }),

    // --- Promos/Coupons ---
    validatePromo: b.mutation({
      query: (body) => ({ url: '/promos/validate', method: 'POST', body }),
    }),
    // Admin: Promos
    adminListPromos: b.query({
      query: ({ page = 1 } = {}) => adminApiPath(`/promos?page=${page}`),
      providesTags: ['Promo'],
    }),
    adminCreatePromo: b.mutation({
      query: (body) => ({ url: adminApiPath('/promos'), method: 'POST', body }),
      invalidatesTags: ['Promo'],
    }),
    adminUpdatePromo: b.mutation({
      query: ({ id, ...body }) => ({ url: adminApiPath(`/promos/${id}`), method: 'PATCH', body }),
      invalidatesTags: ['Promo'],
    }),
    adminDeletePromo: b.mutation({
      query: (id) => ({ url: adminApiPath(`/promos/${id}`), method: 'DELETE' }),
      invalidatesTags: ['Promo'],
    }),

    // --- Gamification ---
    getGamification: b.query({
      query: () => '/gamification',
      providesTags: ['Gamification'],
    }),

    // --- Recommendations ---
    getRecommendations: b.query({
      query: () => '/recommendations',
      providesTags: ['Recommendations'],
    }),

    // --- Admin: Geo Analytics (Heatmap) ---
    adminGeoAnalytics: b.query({
      query: ({ days = 30, precision = 2, service } = {}) => ({
        url: adminApiPath('/geo-analytics'),
        params: { days, precision, service },
      }),
    }),
    adminDemandPatterns: b.query({
      query: ({ days = 30, service } = {}) => ({
        url: adminApiPath('/demand-patterns'),
        params: { days, service },
      }),
    }),

    // --- Admin: System Health ---
    adminSystemHealth: b.query({
      query: () => adminApiPath('/system/health'),
    }),

    // --- Admin: Feature Flags ---
    adminFeatureFlags: b.query({
      query: () => adminApiPath('/feature-flags'),
      providesTags: ['FeatureFlags'],
    }),
    adminSetFeatureFlag: b.mutation({
      query: (body) => ({ url: adminApiPath('/feature-flags'), method: 'POST', body }),
      invalidatesTags: ['FeatureFlags'],
    }),

    // --- Admin: Alerts ---
    adminAlerts: b.query({
      query: () => adminApiPath('/alerts'),
    }),

    // --- Admin: Retention ---
    adminRetention: b.query({
      query: (days = 30) => adminApiPath(`/retention?days=${days}`),
    }),

    // --- Admin: Support Tickets ---
    adminSupportTickets: b.query({
      query: ({ status, priority, category, page = 1 } = {}) => ({
        url: adminApiPath('/support'),
        params: { status, priority, category, page },
      }),
      providesTags: ['SupportTickets'],
    }),
    adminReplyTicket: b.mutation({
      query: ({ id, ...body }) => ({ url: adminApiPath(`/support/${id}/reply`), method: 'POST', body }),
      invalidatesTags: ['SupportTickets'],
    }),

    // --- Admin: Live Operations ---
    adminLiveOps: b.query({
      query: () => adminApiPath('/liveops'),
    }),

    // --- Construction Timer (correct server path: /vertical-features/construction/timer) ---
    getConstructionTimer: b.query({ query: (orderId) => `/vertical-features/construction/timer/${orderId}` }),
    startConstructionTimer: b.mutation({ query: ({ orderId }) => ({ url: '/vertical-features/construction/timer/start', method: 'POST', body: { orderId } }) }),
    pauseConstructionTimer: b.mutation({ query: ({ orderId }) => ({ url: '/vertical-features/construction/timer/pause', method: 'POST', body: { orderId } }) }),
    resumeConstructionTimer: b.mutation({ query: ({ orderId }) => ({ url: '/vertical-features/construction/timer/resume', method: 'POST', body: { orderId } }) }),
    stopConstructionTimer: b.mutation({ query: ({ orderId }) => ({ url: '/vertical-features/construction/timer/stop', method: 'POST', body: { orderId } }) }),

    // --- Phone Health (correct server path: /vertical-features/phone/health-report) ---
    getPhoneHealthReport: b.query({ query: (orderId) => `/vertical-features/phone/health-report/${orderId}` }),
    submitPhoneHealthReport: b.mutation({
      query: ({ orderId, components, partsReplaced }) => ({ url: '/vertical-features/phone/health-report', method: 'POST', body: { orderId, components, partsReplaced } }),
    }),

    // --- Vehicle Health (correct server path: /vertical-features/vehicles/health-report) ---
    getVehicleHealthReport: b.query({ query: (orderId) => `/vertical-features/vehicles/health-report/${orderId}` }),
    submitVehicleHealthReport: b.mutation({
      query: ({ orderId, reportType, preDamageDocs }) => ({ url: '/vertical-features/vehicles/health-report', method: 'POST', body: { orderId, reportType, preDamageDocs } }),
    }),

    // --- Public Catalog — live service list + prices for home/services pages ---
    listServices: b.query({
      query: () => '/catalog/services',
      transformResponse: (r) => {
        const list = r?.services || [];
        return { list, byCode: Object.fromEntries(list.map((s) => [s.code, s])) };
      },
    }),

    // --- Admin Catalog (correct server path: /catalog/admin/services) ---
    adminGetCatalogServices: b.query({ query: () => '/catalog/admin/services' }),
    adminUpdateCatalogService: b.mutation({
      query: ({ code, ...body }) => ({ url: `/catalog/admin/services/${code}`, method: 'PUT', body }),
    }),
    adminCreateCatalogService: b.mutation({
      query: (body) => ({ url: '/catalog/admin/services', method: 'POST', body }),
    }),
    adminDeleteCatalogService: b.mutation({
      query: (code) => ({ url: `/catalog/admin/services/${code}`, method: 'DELETE' }),
    }),
    adminServiceActiveOrderCount: b.query({
      query: (code) => `/catalog/admin/services/${code}/active-orders`,
    }),

    // --- Dynamic Catalog & Models APIs ---
    getCatalogBrands: b.query({ query: (category = 'mobile') => `/catalog/services/brands?category=${category}` }),
    getCatalogModels: b.query({ query: ({ brandCode, search } = {}) => `/catalog/services/models?brandCode=${brandCode || ''}&search=${search || ''}` }),
    getCatalogVariants: b.query({ query: ({ serviceCode, modelCode } = {}) => `/catalog/services/variants?serviceCode=${serviceCode || ''}&modelCode=${modelCode || ''}` }),
    getDiagnosticFlow: b.query({ query: (code = 'mobile_diagnostic') => `/catalog/services/diagnostics/${code}` }),
    recordDemandEvent: b.mutation({ query: (body) => ({ url: '/catalog/services/demand-event', method: 'POST', body }) }),

    // --- Admin Brand, Model & Import APIs ---
    adminGetBrands: b.query({ query: () => '/catalog/admin/brands' }),
    adminCreateBrand: b.mutation({ query: (body) => ({ url: '/catalog/admin/brands', method: 'POST', body }) }),
    adminGetModels: b.query({ query: (brandCode = '') => `/catalog/admin/models?brandCode=${brandCode}` }),
    adminCreateModel: b.mutation({ query: (body) => ({ url: '/catalog/admin/models', method: 'POST', body }) }),
    adminImportModelsBulk: b.mutation({ query: (rows) => ({ url: '/catalog/admin/models/import', method: 'POST', body: { rows } }) }),
    adminGetVariants: b.query({ query: ({ modelCode = '', serviceCode = '' } = {}) => `/catalog/admin/variants?modelCode=${modelCode}&serviceCode=${serviceCode}` }),
    adminCreateVariant: b.mutation({ query: (body) => ({ url: '/catalog/admin/variants', method: 'POST', body }) }),
    adminGetDemandEvents: b.query({ query: (cityCode = '') => `/catalog/admin/demand-events?cityCode=${cityCode}` }),
    // --- Admin Verticals (correct server path: /${slug}/verticals mounted in routes) ---
    adminGetVerticals: b.query({ query: () => `${adminApiPath('/verticals')}` }),
    adminUpdateVertical: b.mutation({
      query: ({ vertical, ...body }) => ({ url: adminApiPath(`/verticals/${vertical}`), method: 'PUT', body }),
    }),
    adminAddSparePart: b.mutation({
      query: ({ vertical, ...body }) => ({ url: adminApiPath(`/verticals/mobile/spare-parts`), method: 'POST', body }),
    }),
    adminUpdateSparePart: b.mutation({
      query: ({ partId, ...body }) => ({ url: adminApiPath(`/verticals/mobile/spare-parts/${partId}`), method: 'PATCH', body }),
    }),
    adminRemoveSparePart: b.mutation({
      query: ({ partId }) => ({ url: adminApiPath(`/verticals/mobile/spare-parts/${partId}`), method: 'DELETE' }),
    }),
    adminRefundOrder: b.mutation({
      query: ({ orderId, reason }) => ({ url: adminApiPath(`/orders/${orderId}/refund`), method: 'POST', body: { reason } }),
    }),

    // --- Warranty (correct server path: /service-features/warranties/order/:orderId) ---
    getOrderWarranty: b.query({
      query: (orderId) => `/service-features/warranties/order/${orderId}`,
    }),

    // --- Service Checklist (correct server path: /service-features/checklist/:service) ---
    getServiceChecklist: b.query({
      query: (service) => `/service-features/checklist/${service}`,
    }),
    submitChecklist: b.mutation({
      query: ({ orderId, completedItems }) => ({ url: `/orders/${orderId}/checklist`, method: 'POST', body: { completedIds: completedItems } }),
    }),

    // --- Shifts (correct server paths) ---
    getShifts: b.query({
      query: ({ lat, lng } = {}) => `/workers/shifts${lat ? `?lat=${lat}&lng=${lng}` : ''}`,
    }),
    previewShift: b.query({
      query: ({ lat, lng }) => `/workers/shifts/preview?lat=${lat}&lng=${lng}`,
    }),
    commitShift: b.mutation({
      query: (body) => ({ url: '/workers/shifts', method: 'POST', body }),
    }),
    cancelShiftSlot: b.mutation({
      query: ({ slotId }) => ({ url: '/workers/shifts/cancel', method: 'DELETE', body: { slotId } }),
    }),

    // --- Wellness ---
    getWellness: b.query({ query: () => '/workers/wellness' }),

    // --- Earned Wage ---
    getEarnedWage: b.query({ query: () => '/workers/earned-wage' }),
    requestWageAdvance: b.mutation({
      query: ({ amountPaise }) => ({ url: '/workers/earned-wage/advance', method: 'POST', body: { amountPaise } }),
    }),

    // --- SOS ---
    triggerSOS: b.mutation({
      query: ({ orderId, lat, lng }) => ({ url: `/workers/sos`, method: 'POST', body: { orderId, lat, lng } }),
    }),

    // --- Break Bonus (server: POST /workers/wellness/break-bonus) ---
    claimBreakBonus: b.mutation({
      query: () => ({ url: '/workers/wellness/break-bonus', method: 'POST' }),
    }),

    // --- Price Revision ---
    getPriceRevision: b.query({
      query: (orderId) => `/orders/${orderId}/price-revision`,
      providesTags: (r, e, id) => [{ type: 'Order', id }],
    }),
    respondPriceRevision: b.mutation({
      query: ({ orderId, accept }) => ({ url: `/orders/${orderId}/price-revision/respond`, method: 'POST', body: { accept } }),
      invalidatesTags: (r, e, a) => [{ type: 'Order', id: a.orderId }],
    }),

    // --- Tip ---
    sendTip: b.mutation({
      query: ({ orderId, amountPaise, voiceNoteUrl, message }) => ({
        url: `/orders/${orderId}/tip`,
        method: 'POST',
        body: { amountPaise, ...(voiceNoteUrl && { voiceNoteUrl }), ...(message && { message }) },
      }),
      invalidatesTags: (r, e, a) => [{ type: 'Order', id: a.orderId }],
    }),

    // --- Surge Info ---
    getSurgeInfo: b.query({
      query: ({ lat, lng }) => `/pricing/surge?lat=${lat}&lng=${lng}`,
    }),

    // --- Diagnosis Flow ---
    getDiagnosisFlow: b.query({
      query: (service) => `/service-features/diagnosis/${service}`,
    }),
    analyseDiagnosis: b.mutation({
      query: ({ service, answers }) => ({
        url: `/service-features/diagnosis/${service}/analyse`,
        method: 'POST',
        body: { answers },
      }),
    }),

    // --- Worker: Public Profile + Leaderboard ---
    getWorkerPublicProfile: b.query({
      query: (workerId) => `/workers/${workerId}/public`,
      providesTags: (r, e, id) => [{ type: 'Worker', id }],
    }),
    getWorkerLeaderboard: b.query({
      query: () => '/workers/leaderboard',
      providesTags: ['Worker'],
    }),

    // --- Worker: Bank Accounts ---
    getWorkerBankAccounts: b.query({
      query: () => '/workers/bank-accounts',
      providesTags: ['Worker'],
    }),
    addWorkerBankAccount: b.mutation({
      query: (body) => ({ url: '/workers/bank-accounts', method: 'POST', body }),
      invalidatesTags: ['Worker'],
    }),
    deleteWorkerBankAccount: b.mutation({
      query: ({ id, type }) => ({ url: `/workers/bank-accounts/${type}/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Worker'],
    }),
    setDefaultWorkerBankAccount: b.mutation({
      query: ({ id, type }) => ({ url: `/workers/bank-accounts/${type}/${id}/default`, method: 'PATCH' }),
      invalidatesTags: ['Worker'],
    }),

    // --- Worker: Appeals ---
    getWorkerAppeals: b.query({
      query: () => '/worker/appeals',
      providesTags: ['Worker'],
    }),
    createWorkerAppeal: b.mutation({
      query: (body) => ({ url: '/worker/appeals', method: 'POST', body }),
      invalidatesTags: ['Worker'],
    }),
    getWorkerAppeal: b.query({
      query: (id) => `/worker/appeals/${id}`,
    }),

    // --- Worker: Training ---
    getTrainingModules: b.query({
      query: () => '/worker/training',
      providesTags: ['Worker'],
    }),
    getTrainingModule: b.query({
      query: (id) => `/worker/training/${id}`,
    }),
    submitTrainingQuiz: b.mutation({
      query: ({ id, answers }) => ({ url: `/worker/training/${id}/submit`, method: 'POST', body: { answers } }),
      invalidatesTags: ['Worker', 'Me'],
    }),

    // --- Worker: Analytics ---
    getJobEarnings: b.query({
      query: (page = 1) => `/workers/job-earnings?page=${page}`,
      providesTags: ['Earnings'],
    }),
    getZoneBenchmark: b.query({
      query: () => '/workers/zone-benchmark',
      providesTags: ['Worker'],
    }),

    // --- Worker: Block Customer ---
    blockCustomerByWorker: b.mutation({
      query: (body) => ({ url: '/workers/block-customer', method: 'POST', body }),
    }),

    // --- Worker: Profile & Skills ---
    getWorkerProfile: b.query({
      query: () => '/workers/me',
      providesTags: ['Worker'],
    }),
    updateWorkerSkills: b.mutation({
      query: (body) => ({ url: '/workers/skills', method: 'PATCH', body }),
      invalidatesTags: ['Worker'],
    }),

    // --- Worker: Goals ---
    getWorkerGoals: b.query({
      query: () => '/workers/goals',
      providesTags: ['WorkerGoals'],
    }),
    setWorkerGoal: b.mutation({
      query: (body) => ({ url: '/workers/goals', method: 'POST', body }),
      invalidatesTags: ['WorkerGoals'],
    }),

    // --- Worker: Payout (withdrawal) ---
    requestPayout: b.mutation({
      query: (body) => ({ url: '/payouts/request', method: 'POST', body }),
      invalidatesTags: ['Wallet'],
    }),

    // --- Plans ---
    getPlans: b.query({
      query: () => '/subscriptions/plans',
      providesTags: ['Plans'],
    }),

    // --- Referrals ---
    getReferralCode: b.query({
      query: () => '/referrals/my-code',
      providesTags: ['Referral'],
    }),
    applyReferralCode: b.mutation({
      query: (code) => ({ url: '/referrals/apply', method: 'POST', body: { code } }),
      invalidatesTags: ['Referral'],
    }),
    getReferralHistory: b.query({
      query: () => '/referrals/history',
      providesTags: ['Referral'],
    }),

    // --- Notification Preferences ---
    getNotificationPrefs: b.query({
      query: () => '/users/me/notification-prefs',
      providesTags: ['Me'],
    }),
    updateNotificationPrefs: b.mutation({
      query: (body) => ({ url: '/users/me/notification-prefs', method: 'PATCH', body }),
      invalidatesTags: ['Me'],
    }),

    // --- Spending Analytics ---
    getSpending: b.query({
      query: () => '/users/spending',
      providesTags: ['Me'],
    }),

    // --- Account Deletion ---
    deleteAccount: b.mutation({
      query: () => ({ url: '/users/me', method: 'DELETE' }),
    }),

    // --- Available Promos ---
    getAvailablePromos: b.query({
      query: () => '/promos/available',
      providesTags: ['Promo'],
    }),

    // --- Reschedule Order ---
    rescheduleOrder: b.mutation({
      query: ({ id, scheduledAt }) => ({ url: `/orders/${id}/reschedule`, method: 'PATCH', body: { scheduledAt } }),
      invalidatesTags: (r, e, a) => ['Order', { type: 'Order', id: a.id }],
    }),

    // --- Admin: Worker Cancellation Shield Fund ---
    adminShieldSummary: b.query({
      query: () => adminApiPath('/shield/summary'),
      providesTags: ['ShieldFund'],
    }),
    adminShieldWeeks: b.query({
      query: ({ page = 1, status } = {}) => ({ url: adminApiPath('/shield/weeks'), params: { page, ...(status && { status }) } }),
      providesTags: ['ShieldFund'],
    }),
    adminShieldWeekPayouts: b.query({
      query: (weekId) => adminApiPath(`/shield/weeks/${weekId}/payouts`),
      providesTags: (r, e, weekId) => [{ type: 'ShieldFund', id: weekId }],
    }),
    adminShieldFees: b.query({
      query: ({ page = 1, status, userId } = {}) => ({ url: adminApiPath('/shield/fees'), params: { page, ...(status && { status }), ...(userId && { userId }) } }),
      providesTags: ['ShieldFund'],
    }),
    adminShieldPendingSummary: b.query({
      query: () => adminApiPath('/shield/pending-summary'),
      providesTags: ['ShieldFund'],
    }),
    adminShieldFeeSchedule: b.query({
      query: () => adminApiPath('/shield/fee-schedule'),
      providesTags: ['ShieldFund'],
    }),
    adminShieldUpdateFeeSchedule: b.mutation({
      query: (body) => ({ url: adminApiPath('/shield/fee-schedule'), method: 'PUT', body }),
      invalidatesTags: ['ShieldFund'],
    }),
    adminShieldTriggerPayout: b.mutation({
      query: () => ({ url: adminApiPath('/shield/trigger-payout'), method: 'POST' }),
      invalidatesTags: ['ShieldFund'],
    }),
    adminShieldWriteOffFee: b.mutation({
      query: (id) => ({ url: adminApiPath(`/shield/fees/${id}/write-off`), method: 'POST' }),
      invalidatesTags: ['ShieldFund'],
    }),

    // ── Event Partner dashboard ───────────────────────────────────────────────
    partnerOverview: b.query({ query: () => '/events/partner/overview', providesTags: ['EventPartner'] }),
    partnerMe: b.query({ query: () => '/events/partner/me', providesTags: ['EventPartner'] }),
    updatePartnerMe: b.mutation({
      query: (body) => ({ url: '/events/partner/me', method: 'PATCH', body }),
      invalidatesTags: ['EventPartner'],
    }),
    partnerThemes: b.query({ query: () => '/events/partner/themes', providesTags: ['EventTheme'] }),
    createEventTheme: b.mutation({
      query: (body) => ({ url: '/events/partner/themes', method: 'POST', body }),
      invalidatesTags: ['EventTheme'],
    }),
    updateEventTheme: b.mutation({
      query: ({ id, ...body }) => ({ url: `/events/partner/themes/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['EventTheme'],
    }),
    deleteEventTheme: b.mutation({
      query: (id) => ({ url: `/events/partner/themes/${id}`, method: 'DELETE' }),
      invalidatesTags: ['EventTheme'],
    }),
    partnerBookings: b.query({
      query: (params = {}) => ({ url: '/events/partner/bookings', params }),
      providesTags: ['EventBooking'],
    }),
    updatePartnerBookingStatus: b.mutation({
      query: ({ id, status }) => ({ url: `/events/partner/bookings/${id}/status`, method: 'PATCH', body: { status } }),
      invalidatesTags: ['EventBooking'],
    }),
    partnerCalendar: b.query({ query: () => '/events/partner/calendar', providesTags: ['EventPartner'] }),
    blockEventDate: b.mutation({
      query: (body) => ({ url: '/events/partner/calendar/block', method: 'POST', body }),
      invalidatesTags: ['EventPartner'],
    }),
    unblockEventDate: b.mutation({
      query: (date) => ({ url: `/events/partner/calendar/block/${date}`, method: 'DELETE' }),
      invalidatesTags: ['EventPartner'],
    }),
    partnerEarnings: b.query({ query: () => '/events/partner/earnings', providesTags: ['EventPartner'] }),
    partnerNotifications: b.query({
      query: ({ page = 1, unreadOnly = false } = {}) => `/events/partner/notifications?page=${page}&unreadOnly=${unreadOnly}`,
      providesTags: ['PartnerNotification'],
    }),
    markPartnerNotificationRead: b.mutation({
      query: (id) => ({ url: `/events/partner/notifications/${id}/read`, method: 'POST' }),
      invalidatesTags: ['PartnerNotification'],
    }),
    markAllPartnerNotificationsRead: b.mutation({
      query: () => ({ url: '/events/partner/notifications/read-all', method: 'POST' }),
      invalidatesTags: ['PartnerNotification'],
    }),
    declineEventBooking: b.mutation({
      query: ({ id, reason }) => ({ url: `/events/partner/bookings/${id}/decline`, method: 'POST', body: { reason } }),
      invalidatesTags: ['EventBooking'],
    }),

    // ── Events (user-facing) ──────────────────────────────────────────────────
    getEventCategories: b.query({ query: () => '/events/categories', providesTags: ['EventCategory'] }),
    getEventThemes: b.query({
      query: (params = {}) => ({ url: '/events/themes', params }),
      providesTags: ['EventTheme'],
    }),
    getEventTheme: b.query({
      query: (id) => `/events/themes/${id}`,
      providesTags: (r, e, id) => [{ type: 'EventTheme', id }],
    }),
    toggleSaveEventTheme: b.mutation({
      query: (id) => ({ url: `/events/themes/${id}/save`, method: 'POST' }),
      invalidatesTags: ['EventTheme'],
    }),
    getSavedEventThemes: b.query({ query: () => '/events/saved', providesTags: ['EventTheme'] }),
    createEventBooking: b.mutation({
      query: (body) => ({ url: '/events/bookings', method: 'POST', body }),
      invalidatesTags: ['EventBooking'],
    }),
    getEventBookings: b.query({
      query: (page = 1) => `/events/bookings?page=${page}`,
      providesTags: ['EventBooking'],
    }),
    getEventBooking: b.query({
      query: (id) => `/events/bookings/${id}`,
      providesTags: (r, e, id) => [{ type: 'EventBooking', id }],
    }),
    cancelEventBooking: b.mutation({
      query: ({ id, reason }) => ({ url: `/events/bookings/${id}/cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: ['EventBooking'],
    }),
    submitEventReview: b.mutation({
      query: ({ id, ...body }) => ({ url: `/events/bookings/${id}/review`, method: 'POST', body }),
      invalidatesTags: ['EventBooking'],
    }),
    getEventConfig: b.query({ query: () => '/events/config', providesTags: ['EventConfig'] }),
    // Event payment
    createEventAdvanceOrder: b.mutation({
      query: (id) => ({ url: `/events/bookings/${id}/pay/advance`, method: 'POST' }),
    }),
    verifyEventAdvancePayment: b.mutation({
      query: ({ id, ...body }) => ({ url: `/events/bookings/${id}/pay/advance/verify`, method: 'POST', body }),
      invalidatesTags: ['EventBooking'],
    }),
    createEventRemainingOrder: b.mutation({
      query: (id) => ({ url: `/events/bookings/${id}/pay/remaining`, method: 'POST' }),
    }),
    verifyEventRemainingPayment: b.mutation({
      query: ({ id, ...body }) => ({ url: `/events/bookings/${id}/pay/remaining/verify`, method: 'POST', body }),
      invalidatesTags: ['EventBooking'],
    }),

    // ── Events (admin) ────────────────────────────────────────────────────────
    adminEventThemes: b.query({
      query: (params = {}) => ({ url: adminApiPath('/events/themes'), params }),
      providesTags: ['EventTheme'],
    }),
    adminUpdateThemeStatus: b.mutation({
      query: ({ id, ...body }) => ({ url: adminApiPath(`/events/themes/${id}`), method: 'PATCH', body }),
      invalidatesTags: ['EventTheme'],
    }),
    adminEventBookings: b.query({
      query: (params = {}) => ({ url: adminApiPath('/events/bookings'), params }),
      providesTags: ['EventBooking'],
    }),
    adminEventPartners: b.query({ query: (params = {}) => ({ url: adminApiPath('/events/partners'), params }), providesTags: ['EventPartner'] }),
    adminCreateEventPartner: b.mutation({
      query: (body) => ({ url: adminApiPath('/events/partners'), method: 'POST', body }),
      invalidatesTags: ['EventPartner'],
    }),
    adminUpdateEventPartner: b.mutation({
      query: ({ id, ...body }) => ({ url: adminApiPath(`/events/partners/${id}`), method: 'PATCH', body }),
      invalidatesTags: ['EventPartner'],
    }),
    adminEventConfig: b.query({ query: () => adminApiPath('/events/config'), providesTags: ['EventConfig'] }),
    adminUpdateEventConfig: b.mutation({
      query: (body) => ({ url: adminApiPath('/events/config'), method: 'PUT', body }),
      invalidatesTags: ['EventConfig'],
    }),
    adminEventAnalytics: b.query({ query: () => adminApiPath('/events/analytics'), providesTags: ['EventTheme'] }),
    adminCancelEventBooking: b.mutation({
      query: ({ id, reason }) => ({ url: adminApiPath(`/events/bookings/${id}/cancel`), method: 'POST', body: { reason } }),
      invalidatesTags: ['EventBooking'],
    }),
    adminDeclineEventPartnerBooking: b.mutation({
      query: ({ id, reason }) => ({ url: `/events/partner/bookings/${id}/decline`, method: 'POST', body: { reason } }),
      invalidatesTags: ['EventBooking'],
    }),
    adminEventCategories: b.query({ query: () => adminApiPath('/events/categories'), providesTags: ['EventCategory'] }),
    adminUpsertEventCategory: b.mutation({
      query: (body) => ({ url: adminApiPath('/events/categories'), method: 'POST', body }),
      invalidatesTags: ['EventCategory'],
    }),
    adminGetEventPartner: b.query({
      query: (id) => adminApiPath(`/events/partners/${id}`),
      providesTags: (r, e, id) => [{ type: 'EventPartner', id }],
    }),
    adminApproveEventPartnerKyc: b.mutation({
      query: ({ id, ...body }) => ({ url: adminApiPath(`/events/partners/${id}/kyc/approve`), method: 'POST', body }),
      invalidatesTags: ['EventPartner'],
    }),
    adminRejectEventPartnerKyc: b.mutation({
      query: ({ id, reason }) => ({ url: adminApiPath(`/events/partners/${id}/kyc/reject`), method: 'POST', body: { reason } }),
      invalidatesTags: ['EventPartner'],
    }),
    adminBlockEventPartner: b.mutation({
      query: ({ id, block }) => ({ url: adminApiPath(`/events/partners/${id}/block`), method: 'POST', body: { block } }),
      invalidatesTags: ['EventPartner'],
    }),

    // --- Admin: Fraud Detection ---
    adminFraudSummary: b.query({
      query: () => adminApiPath('/fraud/summary'),
      providesTags: ['Fraud'],
    }),
    adminFraudEvents: b.query({
      query: ({ status, severity, type, page = 1, limit = 50 } = {}) => ({
        url: adminApiPath('/fraud/events'),
        params: { ...(status && { status }), ...(severity && { severity }), ...(type && { type }), page, limit },
      }),
      providesTags: ['Fraud'],
    }),
    adminFraudActorEvents: b.query({
      query: ({ actorKind, actorId }) => adminApiPath(`/fraud/events/${actorKind}/${actorId}`),
    }),
    adminResolveFraudEvent: b.mutation({
      query: ({ id, status, adminNote }) => ({
        url: adminApiPath(`/fraud/events/${id}`),
        method: 'PATCH',
        body: { status, ...(adminNote != null && { adminNote }) },
      }),
      invalidatesTags: ['Fraud', 'Worker', 'AdminUsers'],
    }),

    // --- Admin: Zones / Geofences ---
    adminZones: b.query({
      query: () => adminApiPath('/zones'),
      providesTags: ['Zone'],
    }),
    adminCreateZone: b.mutation({
      query: (body) => ({ url: adminApiPath('/zones'), method: 'POST', body }),
      invalidatesTags: ['Zone'],
    }),
    adminUpdateZone: b.mutation({
      query: ({ id, ...body }) => ({ url: adminApiPath(`/zones/${id}`), method: 'PUT', body }),
      invalidatesTags: ['Zone'],
    }),
    adminDeleteZone: b.mutation({
      query: (id) => ({ url: adminApiPath(`/zones/${id}`), method: 'DELETE' }),
      invalidatesTags: ['Zone'],
    }),
    adminZoneStats: b.query({
      query: (id) => adminApiPath(`/zones/${id}/stats`),
    }),

    // --- Admin: Order Intervention ---
    adminOrderNearbyWorkers: b.query({
      query: (id) => adminApiPath(`/orders/${id}/nearby-workers`),
    }),
    adminReassignOrder: b.mutation({
      query: ({ id, workerId }) => ({ url: adminApiPath(`/orders/${id}/reassign`), method: 'POST', body: { workerId } }),
      invalidatesTags: ['Order'],
    }),
    adminForceOrderStatus: b.mutation({
      query: ({ id, status, reason }) => ({ url: adminApiPath(`/orders/${id}/force-status`), method: 'POST', body: { status, reason } }),
      invalidatesTags: ['Order'],
    }),
    adminForceCancelOrder: b.mutation({
      query: ({ id, reason, refundFull }) => ({ url: adminApiPath(`/orders/${id}/force-cancel`), method: 'POST', body: { reason, refundFull } }),
      invalidatesTags: ['Order'],
    }),
    adminAddOrderNote: b.mutation({
      query: ({ id, note }) => ({ url: adminApiPath(`/orders/${id}/note`), method: 'POST', body: { note } }),
      invalidatesTags: ['Order'],
    }),

    // --- Admin: Worker Earnings Drill-down ---
    adminWorkerEarnings: b.query({
      query: ({ id, period, from, to }) => ({
        url: adminApiPath(`/workers/${id}/earnings`),
        params: { ...(period && { period }), ...(from && { from }), ...(to && { to }) },
      }),
      providesTags: (r, e, a) => [{ type: 'Earnings', id: a?.id }],
    }),
    adminWorkerTimeline: b.query({
      query: (id) => adminApiPath(`/workers/${id}/timeline`),
    }),
    adminWorkerDeductions: b.query({
      query: (id) => adminApiPath(`/workers/${id}/deductions`),
    }),
    adminWorkerIncentives: b.query({
      query: (id) => adminApiPath(`/workers/${id}/incentives`),
    }),
    // Cities / SEO
    adminCities: b.query({
      query: () => adminApiPath('/cities'),
      providesTags: ['City'],
    }),
    adminCreateCity: b.mutation({
      query: (body) => ({ url: adminApiPath('/cities'), method: 'POST', body }),
      invalidatesTags: ['City'],
    }),
    adminUpdateCity: b.mutation({
      query: ({ id, ...body }) => ({ url: adminApiPath(`/cities/${id}`), method: 'PUT', body }),
      invalidatesTags: ['City'],
    }),
    adminDeleteCity: b.mutation({
      query: (id) => ({ url: adminApiPath(`/cities/${id}`), method: 'DELETE' }),
      invalidatesTags: ['City'],
    }),
    adminToggleCityActive: b.mutation({
      query: ({ id, isActive }) => ({ url: adminApiPath(`/cities/${id}/active`), method: 'PATCH', body: { isActive } }),
      invalidatesTags: ['City'],
    }),

    // --- Admin: Worker Appeals ---
    adminGetAppeals: b.query({
      query: ({ status, page = 1 } = {}) => ({
        url: adminApiPath('/worker/appeals'),
        params: { ...(status && { status }), page },
      }),
      providesTags: ['AdminAppeals'],
    }),
    adminResolveAppeal: b.mutation({
      query: ({ id, status, adminNote }) => ({
        url: adminApiPath(`/worker/appeals/${id}`),
        method: 'PATCH',
        body: { status, ...(adminNote && { adminNote }) },
      }),
      invalidatesTags: ['AdminAppeals'],
    }),

    // --- Admin: Training Modules ---
    adminGetTrainingModules: b.query({
      query: () => adminApiPath('/worker/training'),
      providesTags: ['AdminTraining'],
    }),
    adminCreateTrainingModule: b.mutation({
      query: (body) => ({ url: adminApiPath('/worker/training'), method: 'POST', body }),
      invalidatesTags: ['AdminTraining'],
    }),
    adminUpdateTrainingModule: b.mutation({
      query: ({ id, ...body }) => ({ url: adminApiPath(`/worker/training/${id}`), method: 'PATCH', body }),
      invalidatesTags: ['AdminTraining'],
    }),
  }),
});

export const {
  useRequestOtpMutation,
  useResendOtpMutation,
  useLoginUserMutation,
  useLoginWorkerMutation,
  useLoginWorkerPasswordMutation,
  useSetWorkerCredentialsMutation,
  useForgotWorkerPasswordMutation,
  useResetWorkerPasswordMutation,
  useChangeWorkerPasswordMutation,
  useLoginAdminMutation,
  useLogoutMutation,
  useRevokeAllSessionsMutation,
  useVerifySensitiveOtpMutation,
  useGetMeQuery,
  useUpdateMeMutation,
  useGetQuoteQuery,
  useLazyGetQuoteQuery,
  useGetNearbyProsQuery,
  useLazyGetNearbyProsQuery,
  useGetWarmDispatchQuery,
  useLazyGetWarmDispatchQuery,
  useGetReadyModeQuery,
  useSetReadyModeMutation,
  useLazySmartSearchQuery,
  useSmartSearchQuery,
  useLazySearchSuggestQuery,
  useSearchTrendingQuery,
  useCreateOrderMutation,
  useGetOrderQuery,
  useGetOrderTimelineQuery,
  useListOrdersQuery,
  useGetCancelPreviewQuery,
  useCancelOrderMutation,
  useRebookOrderMutation,
  useWorkerReportNoResponseMutation,
  useWorkerReportPartUnavailableMutation,
  useRateOrderMutation,
  useGetWorkerMeQuery,
  useUpdateWorkerProfileMutation,
  useGoOnlineMutation,
  useGoOfflineMutation,
  useGetEarningsQuery,
  useWorkerAcceptMutation,
  useWorkerRejectMutation,
  useWorkerStartTripMutation,
  useWorkerArriveMutation,
  useWorkerStartServiceMutation,
  useWorkerCompleteMutation,
  useLazyGetWorkerCancelPreviewQuery,
  useWorkerCancelMutation,
  useGetKycStatusQuery,
  useSubmitKycMutation,
  usePresignUploadMutation,
  useLensUploadUrlMutation,
  useAnalyzeLensMutation,
  useLazyGetLensScanQuery,
  useGetLensScanQuery,
  useGetFaqsQuery,
  useGetPolicyQuery,
  useGetPoliciesQuery,
  useAdminListContentQuery,
  useAdminCreateContentMutation,
  useAdminUpdateContentMutation,
  useAdminToggleContentMutation,
  useAdminDeleteContentMutation,
  useGetRewardsQuery,
  useRedeemRewardPointsMutation,
  useScratchRewardCardMutation,
  useAdminGetRewardsConfigQuery,
  useAdminUpdateRewardsConfigMutation,
  useAdminGrantRewardPointsMutation,
  useAdminResetWorkerDevicesMutation,
  useAdminRunKycVerifyMutation,
  useAdminMetricsQuery,
  useAdminOrdersQuery,
  useAdminWorkersQuery,
  useAdminBlockWorkerMutation,
  useAdminKycPendingQuery,
  useAdminKycApproveMutation,
  useAdminKycRejectMutation,
  useListPlansQuery,
  useMySubscriptionQuery,
  useSubscribeMutation,
  useCancelSubscriptionMutation,
  useGetWalletQuery,
  useWalletTransactionsQuery,
  useWalletTopupMutation,
  useVerifyPaymentMutation,
  useGetPricingConfigQuery,
  useAdminUpdatePricingMutation,
  useAdminTogglesMutation,
  useAdminToggleDispatchMutation,
  useAdminRevenueQuery,
  useAdminAnalyticsQuery,
  useAdminOrderAuditQuery,
  useAdminCommissionAuditQuery,
  useAdminWorkerTrustAuditQuery,
  useAdminReconciliationQueueQuery,
  useAdminReconcilePaymentMutation,
  useAdminServicePnLQuery,
  useAdminChurnRiskQuery,
  useAdminDeadCategoriesQuery,
  useAdminGeoReadinessQuery,
  useAdminQuoteAbandonmentQuery,
  useAdminIntelLiveTrafficQuery,
  useAdminIntelVisitorLocationsQuery,
  useAdminIntelDemandQuery,
  useAdminIntelUnmetDemandQuery,
  useAdminIntelExpansionQuery,
  useAdminIntelCeoQuery,
  useAdminIntelFunnelQuery,
  useAdminIntelReportQuery,
  useAdminIntelPartnersQuery,
  useLazyAdminNotificationHealthQuery,
  useLazyAdminNotificationStatsQuery,
  useAdminSendNotificationMutation,
  useAdminBroadcastNotificationMutation,
  useAdminListUsersQuery,
  useAdminGetUserQuery,
  useAdminBlockUserMutation,
  useAdminGetPricingConfigQuery,
  useAdminSetPricingConfigMutation,
  useAdminWalletAdjustMutation,
  useAdminWalletReconcileMutation,
  useAdminAuditLogsQuery,
  useAdminDisputesQuery,
  useAdminResolveDisputeMutation,
  useAdminPayoutsQuery,
  useAdminApprovePayoutMutation,
  useAdminRejectPayoutMutation,
  useAdminProcessPayoutMutation,
  useAdminGetIncentivesQuery,
  useAdminSetMilestonesMutation,
  useAdminRatingSweepMutation,
  useAdminListDeferredMilestonesQuery,
  useAdminReleaseDeferredMilestoneMutation,
  useAdminGetCashbackConfigQuery,
  useAdminSetCashbackConfigMutation,
  useAdminGetCashbackStatsQuery,
  useAdminGetReferralStatsQuery,
  useAdminListRecentReferralsQuery,
  useAdminGetCancellationConfigQuery,
  useAdminWorkerOpsQuery,
  useAdminSearchAnalyticsQuery,
  useAdminUpdateCancellationConfigMutation,
  useAdminWorkerPenaltiesQuery,
  useAdminKycDocUrlsQuery,
  useAdminKycClarifyMutation,
  useAdminDeleteWorkerMutation,
  useAdminKycChangeRequestsQuery,
  useAdminRespondChangeRequestMutation,
  useWorkerRequestDocumentChangeMutation,
  useWorkerCompleteOnboardingMutation,
  useListNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useGetAddressesQuery,
  useAddAddressMutation,
  useDeleteAddressMutation,
  useEditAddressMutation,
  useSetDefaultAddressMutation,
  useGetPaymentMethodsQuery,
  useAddPaymentMethodMutation,
  useDeletePaymentMethodMutation,
  useSetDefaultPaymentMethodMutation,
  useGetMyDisputesQuery,
  useGetDisputeQuery,
  useOpenDisputeMutation,
  useAddDisputeMessageMutation,
  useGetMyTicketsQuery,
  useGetTicketQuery,
  useCreateTicketMutation,
  useAddTicketMessageMutation,
  useSaveRecentLocationMutation,
  useRegisterDeviceTokenMutation,
  useRegisterWorkerDeviceTokenMutation,
  useGetOrderInvoiceUrlQuery,
  useGetChatMessagesQuery,
  useSendChatMessageMutation,
  useGetWorkerOrdersQuery,
  useGetNearbyWorkersQuery,
  useGetDemandZonesQuery,
  useLazyGetNearbyWorkersQuery,
  useAdminListPlansQuery,
  useAdminCreatePlanMutation,
  useAdminUpdatePlanMutation,
  useAdminDeletePlanMutation,
  // Ads — serving
  useGetActiveAdsQuery,
  useGetAdsByPlacementQuery,
  useTrackAdImpressionMutation,
  useTrackAdClickMutation,
  // Ads — self-serve advertiser
  useMyAdCampaignsQuery,
  useCreateMyCampaignMutation,
  useUpdateMyCampaignMutation,
  useMyCampaignAnalyticsQuery,
  useMyAdWalletQuery,
  useCreateAdTopUpOrderMutation,
  useVerifyAdTopUpMutation,
  // Ads — admin
  useAdminListAdsQuery,
  useAdminCreateAdMutation,
  useAdminUpdateAdMutation,
  useAdminDeleteAdMutation,
  useAdminApproveAdMutation,
  useAdminRejectAdMutation,
  useAdminAdAnalyticsQuery,
  useAdminAdWalletsQuery,
  // Promos
  useValidatePromoMutation,
  useAdminListPromosQuery,
  useAdminCreatePromoMutation,
  useAdminUpdatePromoMutation,
  useAdminDeletePromoMutation,
  // Gamification + Recommendations
  useGetGamificationQuery,
  useGetRecommendationsQuery,
  // Enterprise admin
  useAdminGeoAnalyticsQuery,
  useAdminDemandPatternsQuery,
  useAdminSystemHealthQuery,
  useAdminFeatureFlagsQuery,
  useAdminSetFeatureFlagMutation,
  useAdminAlertsQuery,
  useAdminRetentionQuery,
  useAdminSupportTicketsQuery,
  useAdminReplyTicketMutation,
  useAdminLiveOpsQuery,
  // Referrals
  useGetReferralCodeQuery,
  useApplyReferralCodeMutation,
  useGetReferralHistoryQuery,
  // Worker public profile + leaderboard
  useGetWorkerPublicProfileQuery,
  useGetWorkerLeaderboardQuery,
  // Diagnosis flow
  useGetDiagnosisFlowQuery,
  useAnalyseDiagnosisMutation,
  // Surge info
  useLazyGetSurgeInfoQuery,
  // Tip
  useSendTipMutation,
  // Price revision
  useGetPriceRevisionQuery,
  useRespondPriceRevisionMutation,
  // Warranty + checklist
  useGetOrderWarrantyQuery,
  useGetServiceChecklistQuery,
  useSubmitChecklistMutation,
  // Shifts
  useGetShiftsQuery,
  useLazyPreviewShiftQuery,
  useCommitShiftMutation,
  useCancelShiftSlotMutation,
  // Wellness + earned wage
  useGetWellnessQuery,
  useGetEarnedWageQuery,
  useRequestWageAdvanceMutation,
  // SOS + bonus
  useTriggerSOSMutation,
  useClaimBreakBonusMutation,
  // Construction timer
  useGetConstructionTimerQuery,
  useStartConstructionTimerMutation,
  usePauseConstructionTimerMutation,
  useResumeConstructionTimerMutation,
  useStopConstructionTimerMutation,
  // Phone + vehicle health
  useGetPhoneHealthReportQuery,
  useSubmitPhoneHealthReportMutation,
  useGetVehicleHealthReportQuery,
  useSubmitVehicleHealthReportMutation,
  // Admin catalog + verticals
  useListServicesQuery,
  useAdminGetCatalogServicesQuery,
  useAdminUpdateCatalogServiceMutation,
  useAdminCreateCatalogServiceMutation,
  useAdminDeleteCatalogServiceMutation,
  useAdminServiceActiveOrderCountQuery,
  useAdminGetVerticalsQuery,
  useAdminUpdateVerticalMutation,
  useAdminAddSparePartMutation,
  useAdminUpdateSparePartMutation,
  useAdminRemoveSparePartMutation,
  useAdminRefundOrderMutation,
  // Shield Fund
  useAdminShieldSummaryQuery,
  useAdminShieldWeeksQuery,
  useAdminShieldWeekPayoutsQuery,
  useAdminShieldFeesQuery,
  useAdminShieldPendingSummaryQuery,
  useAdminShieldFeeScheduleQuery,
  useAdminShieldTriggerPayoutMutation,
  useAdminShieldWriteOffFeeMutation,
  useAdminShieldUpdateFeeScheduleMutation,
  // Event Partner
  useLoginEventPartnerMutation,
  useGooglePartnerLoginMutation,
  usePartnerNotificationsQuery,
  useMarkPartnerNotificationReadMutation,
  useMarkAllPartnerNotificationsReadMutation,
  usePartnerOverviewQuery,
  usePartnerMeQuery,
  useUpdatePartnerMeMutation,
  usePartnerThemesQuery,
  useCreateEventThemeMutation,
  useUpdateEventThemeMutation,
  useDeleteEventThemeMutation,
  usePartnerBookingsQuery,
  useUpdatePartnerBookingStatusMutation,
  usePartnerCalendarQuery,
  useBlockEventDateMutation,
  useUnblockEventDateMutation,
  usePartnerEarningsQuery,
  // Events (user)
  useGetEventCategoriesQuery,
  useGetEventThemesQuery,
  useGetEventThemeQuery,
  useToggleSaveEventThemeMutation,
  useGetSavedEventThemesQuery,
  useCreateEventBookingMutation,
  useGetEventBookingsQuery,
  useGetEventBookingQuery,
  useCancelEventBookingMutation,
  useSubmitEventReviewMutation,
  useGetEventConfigQuery,
  useCreateEventAdvanceOrderMutation,
  useVerifyEventAdvancePaymentMutation,
  useCreateEventRemainingOrderMutation,
  useVerifyEventRemainingPaymentMutation,
  // Events (admin)
  useAdminEventThemesQuery,
  useAdminUpdateThemeStatusMutation,
  useAdminEventBookingsQuery,
  useAdminEventPartnersQuery,
  useAdminCreateEventPartnerMutation,
  useAdminUpdateEventPartnerMutation,
  useAdminEventConfigQuery,
  useAdminUpdateEventConfigMutation,
  useAdminEventAnalyticsQuery,
  useAdminEventCategoriesQuery,
  useAdminUpsertEventCategoryMutation,
  useAdminCancelEventBookingMutation,
  useDeclineEventBookingMutation,
  useAdminGetEventPartnerQuery,
  useAdminApproveEventPartnerKycMutation,
  useAdminRejectEventPartnerKycMutation,
  useAdminBlockEventPartnerMutation,
  // Fraud Detection
  useAdminFraudSummaryQuery,
  useAdminFraudEventsQuery,
  useAdminFraudActorEventsQuery,
  useAdminResolveFraudEventMutation,
  // Zones
  useAdminZonesQuery,
  useAdminCreateZoneMutation,
  useAdminUpdateZoneMutation,
  useAdminDeleteZoneMutation,
  useAdminZoneStatsQuery,
  // Order Intervention
  useAdminOrderNearbyWorkersQuery,
  useAdminReassignOrderMutation,
  useAdminForceOrderStatusMutation,
  useAdminForceCancelOrderMutation,
  useAdminAddOrderNoteMutation,
  // Worker Earnings
  useAdminWorkerEarningsQuery,
  useAdminWorkerTimelineQuery,
  useAdminWorkerDeductionsQuery,
  useAdminWorkerIncentivesQuery,
  // Cities
  useAdminCitiesQuery,
  useAdminCreateCityMutation,
  useAdminUpdateCityMutation,
  useAdminDeleteCityMutation,
  useAdminToggleCityActiveMutation,
  // Worker features batch
  useGetWorkerBankAccountsQuery,
  useAddWorkerBankAccountMutation,
  useDeleteWorkerBankAccountMutation,
  useSetDefaultWorkerBankAccountMutation,
  useGetWorkerAppealsQuery,
  useCreateWorkerAppealMutation,
  useGetWorkerAppealQuery,
  useGetTrainingModulesQuery,
  useGetTrainingModuleQuery,
  useSubmitTrainingQuizMutation,
  useGetJobEarningsQuery,
  useGetZoneBenchmarkQuery,
  useBlockCustomerByWorkerMutation,
  useGetWorkerProfileQuery,
  useUpdateWorkerSkillsMutation,
  useGetWorkerGoalsQuery,
  useSetWorkerGoalMutation,
  useRequestPayoutMutation,
  useGetPlansQuery,

  // Catalog & Models Dynamic Engine
  useGetCatalogBrandsQuery,
  useGetCatalogModelsQuery,
  useGetCatalogVariantsQuery,
  useGetDiagnosticFlowQuery,
  useRecordDemandEventMutation,
  useAdminGetBrandsQuery,
  useAdminCreateBrandMutation,
  useAdminGetModelsQuery,
  useAdminCreateModelMutation,
  useAdminImportModelsBulkMutation,
  useAdminGetVariantsQuery,
  useAdminCreateVariantMutation,
  useAdminGetDemandEventsQuery,
  // Batch 2 user features
  useGetNotificationPrefsQuery,
  useUpdateNotificationPrefsMutation,
  useGetSpendingQuery,
  useDeleteAccountMutation,
  useGetAvailablePromosQuery,
  useRescheduleOrderMutation,
  // Admin: Appeals
  useAdminGetAppealsQuery,
  useAdminResolveAppealMutation,
  // Admin: Training
  useAdminGetTrainingModulesQuery,
  useAdminCreateTrainingModuleMutation,
  useAdminUpdateTrainingModuleMutation,
  useAdminOtpAnalyticsQuery,
} = api;
