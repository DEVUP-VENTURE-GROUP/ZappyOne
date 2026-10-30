/**
 * Every ZappyOne server call, written once.
 * ----------------------------------------------------------------------------
 * The websites (services/api.js) and the mobile apps (mobile/packages/core)
 * build their API from this same list, each with its own sign-in transport:
 * cookies on the web, secure tokens on the phone. Add or change a call here
 * and every app gets it.
 *
 * Keep this file platform-free: no browser APIs, no `import.meta`, no toasts.
 * Anything an endpoint needs from the platform is passed in (`adminApiPath`).
 * ----------------------------------------------------------------------------
 */

export const TAG_TYPES = ['CheckoutDrafts', 'PartnerRates', 'PriceRequest', 'Reviews', 'Fees', 'JobChat', 'Account', 'AdminTeam', 'Payments', 'Me', 'Order', 'Worker', 'Earnings', 'AdminMetrics', 'Kyc', 'Plan', 'Subscription', 'Wallet', 'Notification', 'AdminUsers', 'Disputes', 'Payouts', 'Incentives', 'CancellationConfig', 'PricingCfg', 'AuditLogs', 'Addresses', 'Ad', 'Promo', 'Gamification', 'Recommendations', 'FeatureFlags', 'SupportTickets', 'Referral', 'ShieldFund', 'EventTheme', 'EventBooking', 'EventPartner', 'EventConfig', 'EventCategory', 'PartnerNotification', 'Fraud', 'Zone', 'City', 'PaymentMethods', 'UserDisputes', 'UserTickets', 'AdminAppeals', 'AdminTraining', 'WorkerGoals', 'Plans', 'Content', 'Rewards', 'WorkerOps', 'ReadyMode', 'Shop', 'ShopWorkers', 'ShopKyc',
    'RepairCatalog', 'RepairConfig', 'RepairPricing', 'RepairRequests', 'RepairBookings', 'RepairProvider', 'MyAssets',
    'HelpingConfig', 'HelpingTasks', 'HelpingAvailable', 'AdminHelpingTasks',
    'PetCatalog', 'MyPets', 'PetBookings', 'PetAvailable', 'PetRecurring', 'AdminPetBookings', 'AdminPetPricing', 'AdminPetCapabilities',
    'RepairIdentification', 'Onboarding', 'AdminBookings', 'ErrorIssues', 'Surge', 'IdCheck', 'WorkerHours', 'AutoAccept', 'Seasons', 'Workforce', 'WorkforceAdmin', 'Repeats', 'ShopPayouts', 'AppReleases'];

/**
 * The finished API these endpoints live in, for the optimistic cache patches
 * below (api.util.updateQueryData). Each platform binds it right after building
 * its API; until then a patch is skipped and the request still goes through.
 */
let api = null;
export function bindApi(built) { api = built; }
/** Patch a cached query when the API is bound; a harmless no-op otherwise. */
const patchQuery = (dispatch, name, args, recipe) => (api ? dispatch(api.util.updateQueryData(name, args, recipe)) : { undo() {} });

/** `b` is RTK Query's endpoint builder. */
export function endpoints(b, { adminApiPath }) {
  return {
    // --- Auth ---
    // Messages between a customer and the provider on any job (jobs/job-chat).
    /** Customer: what cancelling costs now, and whether the provider changed or is late (jobs/give-back). */
    lensStatus: b.query({ query: () => '/lens/status', keepUnusedDataFor: 3600 }),
    /** Customer: unpaid cancellation fees the next booking will carry. */
    myPendingCancelFee: b.query({ query: () => '/jobs/pending-fee', keepUnusedDataFor: 0 }),
    // A booking started and left (jobs/checkout-draft): home's "Continue your booking".
    myCheckoutDrafts: b.query({ query: () => '/jobs/checkout-drafts', providesTags: ['CheckoutDrafts'] }),
    // Several vehicles or devices in one booking (repair/services/group), and "also add…" suggestions.
    quoteRepairGroup: b.mutation({ query: (body) => ({ url: '/repair/booking-groups/quote', method: 'POST', body }) }),
    createRepairGroup: b.mutation({ query: (body) => ({ url: '/repair/booking-groups', method: 'POST', body }), invalidatesTags: ['RepairBookings', 'CheckoutDrafts'] }),
    repairGroup: b.query({ query: (id) => `/repair/booking-groups/${id}`, providesTags: ['RepairBookings'] }),
    repairSuggestions: b.query({ query: ({ vertical, repairCode }) => ({ url: '/repair/suggestions', params: { vertical, repairCode } }) }),
    saveCheckoutDraft: b.mutation({ query: ({ kind, ...body }) => ({ url: `/jobs/checkout-drafts/${kind}`, method: 'PUT', body }), invalidatesTags: ['CheckoutDrafts'] }),
    clearCheckoutDraft: b.mutation({ query: (kind) => ({ url: `/jobs/checkout-drafts/${kind}`, method: 'DELETE' }), invalidatesTags: ['CheckoutDrafts'] }),
    jobOptions: b.query({ query: ({ id }) => `/jobs/${id}/options`, keepUnusedDataFor: 0 }),
    /** How soon someone can be at this spot for a service, before booking (jobs/arrival). */
    /** Surge lines + a 10-minute lock for a price screen (jobs/surge). */
    surgeQuote: b.query({ query: (params) => ({ url: '/jobs/surge-quote', params }), keepUnusedDataFor: 0 }),
    /** Worker: where surge is on near them, for the services they do (jobs/surge). */
    workerHotZones: b.query({ query: ({ lat, lng } = {}) => ({ url: '/workers/hot-zones', params: { lat, lng } }), keepUnusedDataFor: 30 }),
    /** Provider rates the customer after the job (jobs/customer-rating). */
    /** The money on one finished job, for its provider (server jobs/earnings forJob). */
    jobEarnings: b.query({ query: (id) => `/jobs/${id}/earnings`, keepUnusedDataFor: 0 }),
    rateCustomer: b.mutation({ query: ({ id, ...body }) => ({ url: `/jobs/${id}/rate-customer`, method: 'POST', body }), invalidatesTags: ['RepairBookings', 'PetBookings', 'HelpingTasks'] }),
    /** Worker's week: hours and days off (jobs/work-hours). */
    // Auto-accept: jobs nearby come with no tap (server jobs/fast-assign). `who` is 'workers' or 'shops'.
    autoAccept: b.query({ query: (who) => `/${who}/me/auto-accept`, providesTags: ['AutoAccept'], keepUnusedDataFor: 0 }),
    saveAutoAccept: b.mutation({ query: ({ who, ...body }) => ({ url: `/${who}/me/auto-accept`, method: 'PUT', body }), invalidatesTags: ['AutoAccept'] }),
    // ZappyOne's own staff in the Rakshak app (server workforce/): shifts, check-in, salary, leave.
    workforceMe: b.query({ query: () => '/workforce/me', providesTags: ['Workforce'] }),
    bookShift: b.mutation({ query: (body) => ({ url: '/workforce/shifts', method: 'POST', body }), invalidatesTags: ['Workforce'] }),
    cancelShift: b.mutation({ query: (id) => ({ url: `/workforce/shifts/${id}`, method: 'DELETE' }), invalidatesTags: ['Workforce'] }),
    checkInShift: b.mutation({ query: (body) => ({ url: '/workforce/check-in', method: 'POST', body }), invalidatesTags: ['Workforce'] }),
    checkOutShift: b.mutation({ query: () => ({ url: '/workforce/check-out', method: 'POST' }), invalidatesTags: ['Workforce'] }),
    staffSalary: b.query({ query: (month) => ({ url: '/workforce/salary', params: month ? { month } : {} }), providesTags: ['Workforce'] }),
    staffLeave: b.query({ query: () => '/workforce/leave', providesTags: ['Workforce'] }),
    requestLeave: b.mutation({ query: (body) => ({ url: '/workforce/leave', method: 'POST', body }), invalidatesTags: ['Workforce'] }),
    adminHubs: b.query({ query: () => adminApiPath('/workforce/hubs'), providesTags: ['WorkforceAdmin'] }),
    adminCreateHub: b.mutation({ query: (body) => ({ url: adminApiPath('/workforce/hubs'), method: 'POST', body }), invalidatesTags: ['WorkforceAdmin'] }),
    adminUpdateHub: b.mutation({ query: ({ id, ...body }) => ({ url: adminApiPath(`/workforce/hubs/${id}`), method: 'PUT', body }), invalidatesTags: ['WorkforceAdmin'] }),
    adminStaff: b.query({ query: (q) => ({ url: adminApiPath('/workforce/staff'), params: q ? { q } : {} }), providesTags: ['WorkforceAdmin'] }),
    adminSetStaff: b.mutation({ query: ({ workerId, ...body }) => ({ url: adminApiPath(`/workforce/staff/${workerId}`), method: 'PATCH', body }), invalidatesTags: ['WorkforceAdmin'] }),
    adminRoster: b.query({ query: ({ hubId, from }) => ({ url: adminApiPath('/workforce/roster'), params: { hubId, ...(from ? { from } : {}) } }), providesTags: ['WorkforceAdmin'] }),
    adminAssignShift: b.mutation({ query: (body) => ({ url: adminApiPath('/workforce/roster'), method: 'POST', body }), invalidatesTags: ['WorkforceAdmin'] }),
    adminRemoveShift: b.mutation({ query: (id) => ({ url: adminApiPath(`/workforce/roster/${id}`), method: 'DELETE' }), invalidatesTags: ['WorkforceAdmin'] }),
    adminLeave: b.query({ query: (status) => ({ url: adminApiPath('/workforce/leave'), params: status ? { status } : {} }), providesTags: ['WorkforceAdmin'] }),
    adminDecideLeave: b.mutation({ query: ({ id, decision }) => ({ url: adminApiPath(`/workforce/leave/${id}`), method: 'POST', body: { decision } }), invalidatesTags: ['WorkforceAdmin'] }),
    adminPayroll: b.query({ query: (month) => ({ url: adminApiPath('/workforce/payroll'), params: month ? { month } : {} }), providesTags: ['WorkforceAdmin'] }),
    /** The month's payroll as CSV text (the server writes it), for download. */
    adminPayrollCsv: b.mutation({ query: (month) => ({ url: adminApiPath('/workforce/payroll'), params: { format: 'csv', ...(month ? { month } : {}) }, responseHandler: 'text' }) }),
    adminFleetAttention: b.query({ query: () => adminApiPath('/workforce/attention'), providesTags: ['WorkforceAdmin'] }),
    adminAutoFillRoster: b.mutation({ query: (hubId) => ({ url: adminApiPath('/workforce/roster/auto-fill'), method: 'POST', body: { hubId } }), invalidatesTags: ['WorkforceAdmin'] }),
    adminFleetPlaces: b.query({ query: ({ q, lat, lng }) => ({ url: adminApiPath('/workforce/places'), params: { q, ...(lat != null ? { lat, lng } : {}) } }) }),
    adminFleetArea: b.query({ query: ({ q, lat, lng }) => ({ url: adminApiPath('/workforce/areas'), params: { q, ...(lat != null ? { lat, lng } : {}) } }) }),
    adminFleetAiBriefing: b.query({ query: (month) => ({ url: adminApiPath('/workforce/ai/briefing'), params: month ? { month } : {} }) }),
    adminFleetAiAsk: b.mutation({ query: (body) => ({ url: adminApiPath('/workforce/ai/ask'), method: 'POST', body }) }),
    adminFleetNextHub: b.query({ query: (days = 30) => ({ url: adminApiPath('/workforce/next-hub'), params: { days } }), providesTags: ['WorkforceAdmin'] }),
    adminFleetInsights: b.query({ query: (month) => ({ url: adminApiPath('/workforce/insights'), params: month ? { month } : {} }), providesTags: ['WorkforceAdmin'] }),
    adminFleetMissedOrders: b.query({ query: (days = 7) => ({ url: adminApiPath('/workforce/missed-orders'), params: { days } }) }),
    adminFleetActivity: b.query({ query: ({ page = 1, actorId } = {}) => ({ url: adminApiPath('/workforce/activity'), params: { page, ...(actorId ? { actorId } : {}) } }), providesTags: ['WorkforceAdmin'] }),
    adminFleetOverview: b.query({ query: (days) => ({ url: adminApiPath('/workforce/overview'), params: days ? { days } : {} }), providesTags: ['WorkforceAdmin'] }),
    adminFleetFinance: b.query({ query: (month) => ({ url: adminApiPath('/workforce/finance'), params: month ? { month } : {} }), providesTags: ['WorkforceAdmin'] }),
    adminFleetExpenses: b.query({ query: ({ month, hubId } = {}) => ({ url: adminApiPath('/workforce/expenses'), params: { ...(month ? { month } : {}), ...(hubId ? { hubId } : {}) } }), providesTags: ['WorkforceAdmin'] }),
    adminAddFleetExpense: b.mutation({ query: (body) => ({ url: adminApiPath('/workforce/expenses'), method: 'POST', body }), invalidatesTags: ['WorkforceAdmin'] }),
    adminRemoveFleetExpense: b.mutation({ query: (id) => ({ url: adminApiPath(`/workforce/expenses/${id}`), method: 'DELETE' }), invalidatesTags: ['WorkforceAdmin'] }),
    adminFleetCashDeposit: b.mutation({ query: (body) => ({ url: adminApiPath('/workforce/cash-deposit'), method: 'POST', body }), invalidatesTags: ['WorkforceAdmin'] }),
    adminFleetStock: b.query({ query: ({ hubId, month } = {}) => ({ url: adminApiPath('/workforce/stock'), params: { ...(hubId ? { hubId } : {}), ...(month ? { month } : {}) } }), providesTags: ['WorkforceAdmin'] }),
    adminAddStockItem: b.mutation({ query: (body) => ({ url: adminApiPath('/workforce/stock/items'), method: 'POST', body }), invalidatesTags: ['WorkforceAdmin'] }),
    adminStockAction: b.mutation({ query: ({ itemId, action, ...body }) => ({ url: adminApiPath(`/workforce/stock/${itemId}/${action}`), method: 'POST', body }), invalidatesTags: ['WorkforceAdmin'] }),
    adminWorkforceSettings: b.query({ query: () => adminApiPath('/workforce/settings'), providesTags: ['WorkforceAdmin'] }),
    adminSaveWorkforceSettings: b.mutation({ query: (body) => ({ url: adminApiPath('/workforce/settings'), method: 'PUT', body }), invalidatesTags: ['WorkforceAdmin'] }),
    workerHours: b.query({ query: () => '/workers/me/hours', providesTags: ['WorkerHours'], keepUnusedDataFor: 0 }),
    saveWorkerHours: b.mutation({ query: (body) => ({ url: '/workers/me/hours', method: 'PUT', body }), invalidatesTags: ['WorkerHours'] }),
    /** Repeats for repair and helping bookings (jobs/recurring). */
    myRepeats: b.query({ query: () => '/jobs/recurring', providesTags: ['Repeats'], keepUnusedDataFor: 0 }),
    repeatJob: b.mutation({ query: ({ id, every, endAfter }) => ({ url: `/jobs/${id}/repeat`, method: 'POST', body: { every, endAfter } }), invalidatesTags: ['Repeats'] }),
    repeatAction: b.mutation({ query: ({ planId, action }) => ({ url: `/jobs/recurring/${planId}/${action}`, method: 'POST' }), invalidatesTags: ['Repeats'] }),
    jobArrival: b.query({ query: ({ line, lat, lng }) => ({ url: '/jobs/arrival', params: { line, lat, lng } }), keepUnusedDataFor: 30 }),
    /** Move a booking made for later (jobs/reschedule): repairs, pet care, helping. */
    rescheduleJob: b.mutation({ query: ({ id, scheduledAt }) => ({ url: `/jobs/${id}/reschedule`, method: 'POST', body: { scheduledAt } }), invalidatesTags: ['RepairBookings', 'PetBookings', 'HelpingTasks'] }),
    /** Customer: boost while searching, tip once done (jobs/boost-tip). */
    boostJob: b.mutation({ query: ({ id, amountPaise }) => ({ url: `/jobs/${id}/boost`, method: 'POST', body: { amountPaise } }) }),
    // A tip on the bill changes what the booking says is due: refresh the bookings too.
    tipJob: b.mutation({ query: ({ id, ...body }) => ({ url: `/jobs/${id}/tip`, method: 'POST', body }), invalidatesTags: ['Wallet', 'RepairBookings', 'PetBookings', 'HelpingTasks'] }),
    /** Admin → Messages: every automatic email and push (messaging/). */
    adminMessages: b.query({ query: () => adminApiPath('/messages'), providesTags: ['Content'] }),
    adminMessagePreview: b.query({ query: (key) => adminApiPath(`/messages/${key}/preview`), keepUnusedDataFor: 0 }),
    adminMessageLog: b.query({ query: (key) => ({ url: adminApiPath('/messages/log'), params: key ? { key } : {} }), keepUnusedDataFor: 0 }),
    adminSendTestMessage: b.mutation({ query: ({ key, to }) => ({ url: adminApiPath(`/messages/${key}/test`), method: 'POST', body: { to } }) }),
    adminUpdateMessageSettings: b.mutation({ query: (body) => ({ url: adminApiPath('/messages/settings'), method: 'PUT', body }), invalidatesTags: ['Content'] }),
    /** Admin: Economics → Boost & tips. */
    adminBoostTips: b.query({ query: () => adminApiPath('/economics/boost-tips'), providesTags: ['PricingCfg'] }),
    adminUpdateBoostTips: b.mutation({ query: (body) => ({ url: adminApiPath('/economics/boost-tips'), method: 'PUT', body }), invalidatesTags: ['PricingCfg'] }),
    adminDispatch: b.query({ query: () => adminApiPath('/economics/dispatch'), providesTags: ['PricingCfg'] }),
    adminUpdateDispatch: b.mutation({ query: (body) => ({ url: adminApiPath('/economics/dispatch'), method: 'PUT', body }), invalidatesTags: ['PricingCfg'] }),
    adminPartnerCommission: b.query({ query: () => adminApiPath('/economics/partner-commission'), providesTags: ['PricingCfg'] }),
    adminUpdatePartnerCommission: b.mutation({ query: (body) => ({ url: adminApiPath('/economics/partner-commission'), method: 'PUT', body }), invalidatesTags: ['PricingCfg'] }),
    adminPartnerRate: b.query({ query: ({ kind, id }) => adminApiPath(`/economics/partner-commission/${kind}/${id}`), providesTags: ['PartnerRates'] }),
    adminSetPartnerRate: b.mutation({ query: ({ kind, id, ...body }) => ({ url: adminApiPath(`/economics/partner-commission/${kind}/${id}`), method: 'PUT', body }), invalidatesTags: ['PartnerRates', 'ShopWorkers'] }),
    adminPartnerRateOverrides: b.query({ query: () => adminApiPath('/economics/partner-commission/overrides'), providesTags: ['PartnerRates'] }),
    reportProviderAbsent: b.mutation({ query: (id) => ({ url: `/jobs/${id}/provider-absent`, method: 'POST' }) }),
    /** Provider: may they hand it back, what it costs, and the wait at the door. */
    jobGiveBack: b.query({ query: ({ id, reason = 'other' }) => `/jobs/${id}/give-back?reason=${reason}`, keepUnusedDataFor: 0 }),
    giveBackJob: b.mutation({ query: ({ id, ...body }) => ({ url: `/jobs/${id}/give-back`, method: 'POST', body }) }),
    reportCustomerAbsent: b.mutation({ query: (id) => ({ url: `/jobs/${id}/customer-absent`, method: 'POST' }) }),
    jobChat: b.query({ query: (id) => `/jobs/${id}/chat`, providesTags: (r, e, id) => [{ type: 'JobChat', id }] }),
    sendJobChat: b.mutation({
      query: ({ id, text }) => ({ url: `/jobs/${id}/chat`, method: 'POST', body: { text } }),
      invalidatesTags: (r, e, a) => [{ type: 'JobChat', id: a.id }],
    }),

    // Account: password, verified email and first-time setup (every account type).
    accountMe: b.query({ query: () => '/account/me', providesTags: ['Account'] }),
    // Profile photo (asked once) and "What's new" seen, for every account type.
    setAccountPhoto: b.mutation({ query: (key) => ({ url: '/account/photo', method: 'POST', body: { key } }), invalidatesTags: ['Account', 'Me'] }),
    skipAccountPhoto: b.mutation({ query: () => ({ url: '/account/photo/skip', method: 'POST' }), invalidatesTags: ['Account'] }),
    markReleaseSeen: b.mutation({ query: (release) => ({ url: '/account/release-seen', method: 'POST', body: { release } }), invalidatesTags: ['Account'] }),
    // A provider's own reviews, and reporting one for moderation.
    myReviews: b.query({ query: (page = 1) => ({ url: '/reviews/mine', params: { page } }), providesTags: ['Reviews'] }),
    reportReview: b.mutation({ query: ({ id, reason }) => ({ url: `/reviews/${id}/report`, method: 'POST', body: { reason } }), invalidatesTags: ['Reviews'] }),
    // Admin review moderation.
    adminReviews: b.query({ query: (params = {}) => ({ url: adminApiPath('/reviews'), params }), providesTags: ['Reviews'] }),
    adminModerateReview: b.mutation({ query: ({ id, ...body }) => ({ url: adminApiPath(`/reviews/${id}`), method: 'PATCH', body }), invalidatesTags: ['Reviews'] }),
    // What sign-in may offer before anyone is signed in (email only once mail is set up).
    accountCapabilities: b.query({ query: () => '/account/capabilities', keepUnusedDataFor: 3600 }),
    setAccountName: b.mutation({ query: (body) => ({ url: '/account/name', method: 'POST', body }), invalidatesTags: ['Account', 'Me'] }),
    setAccountPassword: b.mutation({ query: (body) => ({ url: '/account/password', method: 'POST', body }), invalidatesTags: ['Account'] }),
    startEmailVerification: b.mutation({ query: (body) => ({ url: '/account/email', method: 'POST', body }), invalidatesTags: ['Account'] }),
    confirmEmail: b.mutation({ query: (body) => ({ url: '/account/email/verify', method: 'POST', body }), invalidatesTags: ['Account'] }),
    completeAccountSetup: b.mutation({ query: () => ({ url: '/account/setup/complete', method: 'POST' }), invalidatesTags: ['Account'] }),
    forgotPassword: b.mutation({ query: (body) => ({ url: '/account/password/forgot', method: 'POST', body }) }),
    resetPassword: b.mutation({ query: (body) => ({ url: '/account/password/reset', method: 'POST', body }) }),
    passwordLogin: b.mutation({ query: (body) => ({ url: '/auth/password/login', method: 'POST', body }) }),

    requestOtp: b.mutation({
      query: (body) => ({ url: '/auth/otp/request', method: 'POST', body }),
    }),
    /** Re-confirm with an OTP before a sensitive change (bank details, payouts): 10 minutes. */
    verifyActionOtp: b.mutation({ query: (body) => ({ url: '/auth/otp/verify-action', method: 'POST', body }) }),
    /** Shop withdraw (shop/shop-payout). */
    shopPayouts: b.query({ query: () => '/shops/me/payouts', providesTags: ['ShopPayouts'], keepUnusedDataFor: 0 }),
    requestShopPayout: b.mutation({ query: (body) => ({ url: '/shops/me/payouts', method: 'POST', body }), invalidatesTags: ['ShopPayouts'] }),
    adminShopPayouts: b.query({ query: (status = 'requested') => ({ url: adminApiPath('/payouts/shops'), params: { status } }), providesTags: ['ShopPayouts'], keepUnusedDataFor: 0 }),
    adminDecideShopPayout: b.mutation({ query: ({ id, ...body }) => ({ url: adminApiPath(`/payouts/shops/${id}/decide`), method: 'POST', body }), invalidatesTags: ['ShopPayouts'] }),
    resendOtp: b.mutation({
      query: (body) => ({ url: '/auth/otp/resend', method: 'POST', body }),
    }),
    loginUser: b.mutation({
      query: (body) => ({ url: '/auth/user/login', method: 'POST', body }),
    }),
    loginWorker: b.mutation({
      query: (body) => ({ url: '/auth/worker/login', method: 'POST', body }),
    }),
    // Worker credential login
    loginWorkerPassword: b.mutation({
      query: (body) => ({ url: '/auth/worker/login-password', method: 'POST', body }),
    }),
    setWorkerCredentials: b.mutation({
      query: (body) => ({ url: '/auth/worker/set-credentials', method: 'POST', body }),
    }),
    forgotWorkerPassword: b.mutation({
      query: (body) => ({ url: '/auth/worker/forgot-password', method: 'POST', body }),
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
    loginShop: b.mutation({
      query: (body) => ({ url: '/auth/shop/login', method: 'POST', body }),
    }),
    logout: b.mutation({
      query: (refreshToken) => ({ url: '/auth/logout', method: 'POST', body: { refreshToken } }),
    }),

    // --- User ---
    getMe: b.query({ query: () => '/users/me', providesTags: ['Me'] }),
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


    // --- Unified Search (Zepto-level: fuzzy + intent + rank + never-empty) ---
    smartSearch: b.query({ query: (params) => ({ url: '/search', params }) }),
    searchTrending: b.query({ query: (params = {}) => ({ url: '/search/trending', params }) }),
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
    cancelOrder: b.mutation({
      query: ({ id, reason }) => ({ url: `/orders/${id}/cancel`, method: 'POST', body: { reason } }),
      // Optimistic: flip status to cancelled immediately, roll back on failure.
      async onQueryStarted({ id }, { dispatch, queryFulfilled }) {
        const patch = patchQuery(dispatch, 'getOrder', id, (draft) => {
          if (draft?.order) draft.order.status = 'cancelled';
        });
        try { await queryFulfilled; } catch { patch.undo(); }
      },
      invalidatesTags: (r, e, a) => ['Order', { type: 'Order', id: a.id }],
    }),
    rateOrder: b.mutation({
      query: ({ id, rating, review }) => ({
        url: `/orders/${id}/rate`,
        method: 'POST',
        body: { rating, review },
      }),
      // Optimistic: reflect the rating instantly so the UI switches to "rated".
      async onQueryStarted({ id, rating, review }, { dispatch, queryFulfilled }) {
        const patch = patchQuery(dispatch, 'getOrder', id, (draft) => {
          if (draft?.order) { draft.order.rating = rating; if (review != null) draft.order.review = review; }
        });
        try { await queryFulfilled; } catch { patch.undo(); }
      },
      invalidatesTags: (r, e, a) => [{ type: 'Order', id: a.id }],
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
    /** Shop technicians only: who they work for, and the value of jobs they finished. */
    getMyShop: b.query({ query: () => '/workers/me/shop', providesTags: ['Worker'] }),
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
    respondShopHandoff: b.mutation({
      query: ({ id, accept }) => ({ url: `/orders/${id}/shop-handoff/respond`, method: 'POST', body: { accept } }),
      invalidatesTags: (r, e, a) => ['Order', { type: 'Order', id: a.id }],
    }),
    getNearbyWorkers: b.query({
      query: ({ lat, lng }) => `/workers/nearby?lat=${lat}&lng=${lng}`,
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

    // --- Content (admin-managed FAQs + policy pages) ---
    getFaqs: b.query({
      query: (audience) => `/content/faqs${audience ? `?audience=${audience}` : ''}`,
      providesTags: ['Content'],
    }),
    /** The festive season on the customer home now, or { season: null } (server content/season). */
    currentSeason: b.query({ query: () => '/content/season', providesTags: ['Seasons'] }),
    adminSeasons: b.query({ query: () => adminApiPath('/seasons'), providesTags: ['Seasons'] }),
    adminCreateSeason: b.mutation({ query: (body) => ({ url: adminApiPath('/seasons'), method: 'POST', body }), invalidatesTags: ['Seasons'] }),
    adminUpdateSeason: b.mutation({ query: ({ id, ...body }) => ({ url: adminApiPath(`/seasons/${id}`), method: 'PUT', body }), invalidatesTags: ['Seasons'] }),
    adminDeleteSeason: b.mutation({ query: (id) => ({ url: adminApiPath(`/seasons/${id}`), method: 'DELETE' }), invalidatesTags: ['Seasons'] }),
    /** Published policy pages (slug + title) — the footer's legal links. */
    getPolicies: b.query({ query: () => '/content/policies' }),
    getPolicy: b.query({
      query: (slug) => `/content/policy/${slug}`,
      providesTags: (r, e, slug) => [{ type: 'Content', id: slug }],
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

    adminRunKycVerify: b.mutation({
      query: ({ id, pan }) => ({ url: adminApiPath(`/workers/${id}/kyc/verify`), method: 'POST', body: pan ? { pan } : {} }),
      invalidatesTags: ['Kyc'],
    }),

    // --- Admin ---
    adminMetrics: b.query({ query: () => adminApiPath('/metrics'), providesTags: ['AdminMetrics'] }),
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
    /** Worker: what they owe from cash jobs, the limit, and how to pay (worker-dues). */
    workerDues: b.query({ query: () => '/wallet/dues', providesTags: ['Wallet'] }),
    claimDuesPayment: b.mutation({ query: (body) => ({ url: '/wallet/dues/claims', method: 'POST', body }), invalidatesTags: ['Wallet'] }),
    /** Admin: who owes what, and recording what they paid. */
    adminDues: b.query({ query: () => adminApiPath('/dues'), providesTags: ['Wallet'] }),
    adminRecordDuesPayment: b.mutation({ query: ({ workerId, ...body }) => ({ url: adminApiPath(`/dues/${workerId}/payments`), method: 'POST', body }), invalidatesTags: ['Wallet'] }),
    // Partner shops' commission owed from cash jobs (shop/shop-dues).
    shopDues: b.query({ query: () => '/shops/me/dues', providesTags: ['Wallet'] }),
    adminShopDues: b.query({ query: () => adminApiPath('/dues/shops'), providesTags: ['Wallet'] }),
    adminRecordShopDuesPayment: b.mutation({ query: ({ shopId, ...body }) => ({ url: adminApiPath(`/dues/shops/${shopId}/payment`), method: 'POST', body }), invalidatesTags: ['Wallet'] }),
    adminRejectDuesClaim: b.mutation({ query: ({ id, note }) => ({ url: adminApiPath(`/dues/claims/${id}/reject`), method: 'POST', body: { note } }), invalidatesTags: ['Wallet'] }),
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
      invalidatesTags: ['Subscription', 'Wallet', 'RepairBookings', 'PetBookings', 'HelpingTasks'],
    }),
    // Whether "Pay online" may be offered. The server is the only side that knows.
    getPaymentAvailability: b.query({
      query: () => '/payments/availability',
      keepUnusedDataFor: 60,
    }),
    // Cashfree order for a repair, pet or helping booking; the amount comes from the booking.
    createBookingPayment: b.mutation({
      query: ({ bookingSource, bookingId }) => ({
        url: '/payments/create-order', method: 'POST',
        body: { purpose: 'booking_payment', bookingSource, bookingId },
      }),
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
          patches.push(patchQuery(dispatch, 'listNotifications', { page: 1, unreadOnly }, (draft) => {
            if (!draft?.notifications) return;
            if (unreadOnly) {
              draft.notifications = draft.notifications.filter((n) => String(n._id) !== String(id));
            } else {
              const n = draft.notifications.find((x) => String(x._id) === String(id));
              if (n && !n.readAt) n.readAt = new Date().toISOString();
            }
          }));
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

    // --- Admin: Extended ---
    adminOtpAnalytics: b.query({
      query: (days = 7) => adminApiPath(`/otp-analytics?days=${days}`),
    }),
    // The signed-in admin: role, scope and the areas they may open.
    adminMe: b.query({
      query: () => adminApiPath('/me'),
      providesTags: ['AdminTeam'],
    }),
    // System → Team (super admins).
    adminTeam: b.query({
      query: () => adminApiPath('/admins'),
      providesTags: ['AdminTeam'],
    }),
    adminRoles: b.query({
      query: () => adminApiPath('/admins/roles'),
    }),
    adminCreateAdmin: b.mutation({
      query: (body) => ({ url: adminApiPath('/admins'), method: 'POST', body }),
      invalidatesTags: ['AdminTeam'],
    }),
    adminUpdateAdmin: b.mutation({
      query: ({ id, ...body }) => ({ url: adminApiPath(`/admins/${id}`), method: 'PATCH', body }),
      invalidatesTags: ['AdminTeam'],
    }),
    // Service areas → where customers asked us to launch ("notify me").
    adminLaunchInterest: b.query({
      query: (days = 90) => ({ url: adminApiPath('/launch-interest'), params: { days } }),
      providesTags: ['Zone'],
    }),
    // Money → Payments: every online payment, and the ones that need a person.
    adminPayments: b.query({
      query: (params = {}) => ({ url: adminApiPath('/payments'), params }),
      providesTags: ['Payments'],
    }),
    adminPaymentsSummary: b.query({
      query: (days = 7) => ({ url: adminApiPath('/payments/summary'), params: { days } }),
      providesTags: ['Payments'],
    }),
    adminReconcilePayment: b.mutation({
      query: ({ cfOrderId, notes }) => ({ url: adminApiPath(`/payments/${cfOrderId}/reconcile`), method: 'POST', body: { notes } }),
      invalidatesTags: ['Payments'],
    }),
    adminRetryRefund: b.mutation({
      query: (cfOrderId) => ({ url: adminApiPath(`/payments/${cfOrderId}/retry-refund`), method: 'POST' }),
      invalidatesTags: ['Payments'],
    }),
    adminMarkRefunded: b.mutation({
      query: ({ cfOrderId, reference }) => ({ url: adminApiPath(`/payments/${cfOrderId}/mark-refunded`), method: 'POST', body: { reference } }),
      invalidatesTags: ['Payments'],
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
    adminMarkPayoutPaid: b.mutation({
      query: ({ id, reference }) => ({ url: adminApiPath(`/payouts/${id}/mark-paid`), method: 'POST', body: { reference } }),
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
      query: ({ id, message, docCodes = [] }) => ({ url: adminApiPath(`/workers/${id}/kyc/clarify`), method: 'POST', body: { message, docCodes } }),
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
      // Mounted at /api/workers/kyc — the bare /kyc path 404s, so the worker's
      // "request a change" button did nothing on approved KYC.
      query: (message) => ({ url: '/workers/kyc/request-change', method: 'POST', body: { message } }),
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
    adminAdWallets: b.query({
      query: ({ page = 1 } = {}) => adminApiPath(`/ads/wallets?page=${page}`),
      providesTags: ['Ad'],
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




    // --- Admin: System Health ---
    adminSystemHealth: b.query({
      query: () => adminApiPath('/system/health'),
    }),

    // --- Admin: Feature Flags ---
    // Oldest version of a phone app still allowed to run (app-release); public, read on launch.
    appRelease: b.query({ query: (app) => `/app-release/${app}`, keepUnusedDataFor: 60 }),
    adminAppReleases: b.query({ query: () => adminApiPath('/app-releases'), providesTags: ['AppReleases'] }),
    adminSetAppRelease: b.mutation({
      query: ({ app, ...body }) => ({ url: adminApiPath(`/app-releases/${app}`), method: 'PUT', body }),
      invalidatesTags: ['AppReleases'],
    }),
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
    // What is waiting on a person (admin/todo.service), for the sidebar bell.
    adminTodo: b.query({ query: () => adminApiPath('/todo') }),
    adminBookingHealth: b.query({ query: (days = 7) => ({ url: adminApiPath('/insights/booking-health'), params: { days } }) }),

    // --- Admin: Retention ---

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
    adminStuckJobs: b.query({ query: () => adminApiPath('/stuck-jobs') }),
    adminLiveOps: b.query({
      query: () => adminApiPath('/liveops'),
    }),





    adminRefundOrder: b.mutation({
      query: ({ orderId, reason }) => ({ url: adminApiPath(`/orders/${orderId}/refund`), method: 'POST', body: { reason } }),
    }),

    // --- Warranty (correct server path: /service-features/warranties/order/:orderId) ---
    getOrderWarranty: b.query({
      query: (orderId) => `/service-features/warranties/order/${orderId}`,
    }),




    // --- SOS ---
    triggerSOS: b.mutation({
      query: ({ orderId, jobId, lat, lng, type }) => ({ url: `/workers/sos`, method: 'POST', body: { orderId, jobId, lat, lng, type } }),
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



    // --- Worker: Public Profile + Leaderboard ---
    getWorkerPublicProfile: b.query({
      query: (workerId) => `/workers/${workerId}/public`,
      providesTags: (r, e, id) => [{ type: 'Worker', id }],
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


    // --- Referrals ---
    getReferralCode: b.query({
      // Server route is /referrals/me (getMyCode); /my-code 404s.
      query: () => '/referrals/me',
      providesTags: ['Referral'],
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
    // A five-minute link to open a receipt, invoice or service report in the browser (account/doc-link).
    docLink: b.mutation({ query: (path) => ({ url: '/account/doc-link', method: 'POST', body: { path } }) }),
    // A finished booking's bill as data, for the app's own Bill screen (no browser).
    jobBill: b.query({ query: (id) => ({ url: `/jobs/${id}/receipt`, params: { view: 'json' } }) }),
    orderBill: b.query({ query: (id) => ({ url: `/orders/${id}/invoice`, params: { view: 'json' } }) }),
    // Every account type (account/account-deletion): refused while a job is open or money is in the wallet.
    deleteAccount: b.mutation({
      query: () => ({ url: '/account/me', method: 'DELETE' }),
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

    // Economics: fee, commission and tax for every service line (admin → Economics)
    // Bookings → Needs intervention, and Overview → what customers search for
    // Insights, from the bookings the platform takes today
    adminInsightsOverview: b.query({ query: (days = 7) => ({ url: adminApiPath('/insights/overview'), params: { days } }) }),
    adminInsightsSupply: b.query({ query: (days = 7) => ({ url: adminApiPath('/insights/supply'), params: { days } }) }),
    adminInsightsFunnel: b.query({ query: (days = 7) => ({ url: adminApiPath('/insights/funnel'), params: { days } }) }),
    adminInsightsCustomers: b.query({ query: (days = 30) => ({ url: adminApiPath('/insights/customers'), params: { days } }) }),
    adminInsightsMoney: b.query({ query: (days = 30) => ({ url: adminApiPath('/insights/money'), params: { days } }) }),
    adminInsightsLive: b.query({ query: () => adminApiPath('/insights/live') }),
    adminInsightsGeo: b.query({ query: ({ days = 30, service } = {}) => ({ url: adminApiPath('/insights/geo'), params: { days, ...(service && { service }) } }) }),
    adminInsightsDemand: b.query({ query: (days = 7) => ({ url: adminApiPath('/insights/demand'), params: { days } }) }),
    adminBookingAttention: b.query({ query: () => adminApiPath('/bookings/attention'), providesTags: ['AdminMetrics'] }),
    adminSearchDemand: b.query({ query: () => adminApiPath('/alerts/search-demand') }),
    adminFees: b.query({
      query: () => adminApiPath('/fees'),
      providesTags: ['Fees'],
    }),
    adminUpdateFee: b.mutation({
      query: ({ line, key, ...body }) => ({ url: adminApiPath(`/fees/${line}/${key}`), method: 'PUT', body }),
      // Each line's own console reads the same numbers.
      invalidatesTags: ['Fees', 'RepairConfig', 'HelpingConfig', 'AdminPetPricing', 'EventConfig'],
    }),

    // Event Partner dashboard
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
    partnerBooking: b.query({
      query: (id) => `/events/partner/bookings/${id}`,
      providesTags: (r, e, id) => [{ type: 'EventBooking', id }, 'EventBooking'],
    }),
    addPartnerSetupPhotos: b.mutation({
      query: ({ id, stage, keys }) => ({ url: `/events/partner/bookings/${id}/photos`, method: 'POST', body: { stage, keys } }),
      invalidatesTags: ['EventBooking'],
    }),
    eventThemeAvailability: b.query({
      query: (id) => `/events/themes/${id}/availability`,
    }),
    updatePartnerBookingStatus: b.mutation({
      query: ({ id, status, code }) => ({ url: `/events/partner/bookings/${id}/status`, method: 'PATCH', body: { status, ...(code ? { code } : {}) } }),
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
      // confirm: true once the partner has seen the cost (events/partner-cancel).
      query: ({ id, reason }) => ({ url: `/events/partner/bookings/${id}/decline`, method: 'POST', body: { reason, confirm: true } }),
      invalidatesTags: ['EventBooking'],
    }),
    eventDeclineQuote: b.query({ query: (id) => `/events/partner/bookings/${id}/decline-quote`, keepUnusedDataFor: 0 }),

    // Events (user-facing)
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

    // Events (admin)
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
    adminDeleteEventCategory: b.mutation({
      query: (slug) => ({ url: adminApiPath(`/events/categories/${slug}`), method: 'DELETE' }),
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
    /** Ask an event partner for named documents again (stays in review). */
    adminClarifyEventPartnerKyc: b.mutation({
      query: ({ id, message, docCodes }) => ({ url: adminApiPath(`/events/partners/${id}/kyc/clarify`), method: 'POST', body: { message, docCodes } }),
      invalidatesTags: ['EventPartner'],
    }),
    adminRejectEventPartnerKyc: b.mutation({
      query: ({ id, reason }) => ({ url: adminApiPath(`/events/partners/${id}/kyc/reject`), method: 'POST', body: { reason } }),
      invalidatesTags: ['EventPartner'],
    }),
    /** Back on after a pause for cancelling (events/partner-cancel). */
    adminReinstateEventPartner: b.mutation({ query: (id) => ({ url: adminApiPath(`/events/partners/${id}/reinstate`), method: 'POST' }), invalidatesTags: ['EventPartner'] }),
    adminBlockEventPartner: b.mutation({
      query: ({ id, block }) => ({ url: adminApiPath(`/events/partners/${id}/block`), method: 'POST', body: { block } }),
      invalidatesTags: ['EventPartner'],
    }),

    // Shop owner dashboard
    shopMe: b.query({ query: () => '/shops/me/profile', providesTags: ['Shop'] }),
    updateShopMe: b.mutation({
      query: (body) => ({ url: '/shops/me/profile', method: 'PATCH', body }),
      // The setup flow reads the profile (hours, address) from the repair onboarding status.
      invalidatesTags: ['Shop', 'RepairProvider'],
    }),
    shopKycStatus: b.query({ query: () => '/shops/me/kyc/status', providesTags: ['ShopKyc'] }),
    submitShopKyc: b.mutation({
      query: (body) => ({ url: '/shops/me/kyc/submit', method: 'POST', body }),
      invalidatesTags: ['ShopKyc', 'Shop'],
    }),
    shopWorkers: b.query({ query: () => '/shops/me/workers', providesTags: ['ShopWorkers'] }),
    // ServicePro partner OS (server shop/partner.service): type, dispatch, capacity, team, numbers.
    partnerSettings: b.query({ query: () => '/shops/me/partner', providesTags: ['ShopWorkers'] }),
    savePartnerSettings: b.mutation({ query: (body) => ({ url: '/shops/me/partner', method: 'PUT', body }), invalidatesTags: ['ShopWorkers'] }),
    // Partner terms: public before sign-up (by type), and this shop's acceptance (shop/partner-terms).
    partnerTerms: b.query({ query: (type) => ({ url: '/auth/shop/partner-terms', params: { type } }) }),
    shopAgreement: b.query({ query: () => '/shops/me/agreement', providesTags: ['ShopWorkers'] }),
    acceptShopAgreement: b.mutation({ query: () => ({ url: '/shops/me/agreement', method: 'POST' }), invalidatesTags: ['ShopWorkers'] }),
    inviteShopTeam: b.mutation({ query: (rows) => ({ url: '/shops/me/workers/bulk', method: 'POST', body: { rows } }), invalidatesTags: ['ShopWorkers'] }),
    setShopWorkerTeam: b.mutation({ query: ({ workerId, ...body }) => ({ url: `/shops/me/workers/${workerId}/team`, method: 'PATCH', body }), invalidatesTags: ['ShopWorkers'] }),
    partnerInsights: b.query({ query: (days) => ({ url: '/shops/me/insights', params: days ? { days } : {} }), providesTags: ['ShopWorkers'] }),
    /** A team lead's group and the jobs they may give out (POST /jobs/:id/assign does the giving). */
    teamBoard: b.query({ query: () => '/jobs/team-board', providesTags: ['RepairBookings', 'PetBookings'] }),
    addShopWorker: b.mutation({
      query: (body) => ({ url: '/shops/me/workers', method: 'POST', body }),
      invalidatesTags: ['ShopWorkers'],
    }),
    removeShopWorker: b.mutation({
      query: (workerId) => ({ url: `/shops/me/workers/${workerId}`, method: 'DELETE' }),
      invalidatesTags: ['ShopWorkers'],
    }),
    shopEarnings: b.query({
      query: (range = 'today') => `/shops/me/earnings?range=${range}`,
      providesTags: ['Shop'],
    }),

    // Shops (customer-facing discovery)
    nearbyShops: b.query({
      query: (params) => ({ url: '/shops/nearby', params }),
      providesTags: ['Shop'],
    }),
    getShopProfile: b.query({
      query: (id) => `/shops/${id}`,
      providesTags: (r, e, id) => [{ type: 'Shop', id }],
    }),

    // Shops (admin)
    adminShops: b.query({
      query: (params = {}) => ({ url: adminApiPath('/shops'), params }),
      providesTags: ['Shop'],
    }),
    adminApproveShopKyc: b.mutation({
      query: (id) => ({ url: adminApiPath(`/shops/${id}/kyc/approve`), method: 'POST' }),
      invalidatesTags: ['Shop', 'ShopKyc'],
    }),
    /** Ask a shop for named documents again (stays in review). */
    adminClarifyShopKyc: b.mutation({
      query: ({ id, message, docCodes }) => ({ url: adminApiPath(`/shops/${id}/kyc/clarify`), method: 'POST', body: { message, docCodes } }),
      invalidatesTags: ['Shop', 'ShopKyc'],
    }),
    adminRejectShopKyc: b.mutation({
      query: ({ id, reason }) => ({ url: adminApiPath(`/shops/${id}/kyc/reject`), method: 'POST', body: { reason } }),
      invalidatesTags: ['Shop', 'ShopKyc'],
    }),
    adminBlockShop: b.mutation({
      query: ({ id, blocked }) => ({ url: adminApiPath(`/shops/${id}/block`), method: 'POST', body: { blocked } }),
      invalidatesTags: ['Shop'],
    }),
    adminShopKycDocUrls: b.query({
      query: (id) => adminApiPath(`/shops/${id}/kyc/docs`),
      providesTags: (r, e, id) => [{ type: 'ShopKyc', id }],
    }),

    // Repair vertical (admin)
    // One generic pair of hooks serves every catalog resource — the resource
    // name is a parameter, so adding a new one needs no new endpoint.
    adminRepairList: b.query({
      query: ({ resource, vertical = 'mobile', ...params }) => ({
        url: adminApiPath(`/repair/${resource}`), params: { ...params, vertical },
      }),
      providesTags: (r, e, a) => [{ type: 'RepairCatalog', id: `${a.vertical || 'mobile'}:${a.resource}` }],
    }),
    adminRepairCreate: b.mutation({
      query: ({ resource, vertical = 'mobile', ...body }) => ({
        url: adminApiPath(`/repair/${resource}`), method: 'POST', body: { ...body, vertical },
      }),
      invalidatesTags: (r, e, a) => [{ type: 'RepairCatalog', id: `${a.vertical || 'mobile'}:${a.resource}` }],
    }),
    adminRepairUpdate: b.mutation({
      query: ({ resource, id, vertical = 'mobile', ...body }) => ({
        url: adminApiPath(`/repair/${resource}/${id}`), method: 'PATCH', body,
      }),
      invalidatesTags: (r, e, a) => [{ type: 'RepairCatalog', id: `${a.vertical || 'mobile'}:${a.resource}` }],
    }),
    adminRepairArchive: b.mutation({
      query: ({ resource, id }) => ({ url: adminApiPath(`/repair/${resource}/${id}`), method: 'DELETE' }),
      invalidatesTags: (r, e, a) => [{ type: 'RepairCatalog', id: `${a.vertical || 'mobile'}:${a.resource}` }],
    }),
    adminRepairDashboard: b.query({
      query: (vertical = 'mobile') => ({ url: adminApiPath('/repair/dashboard'), params: { vertical } }),
      providesTags: ['RepairCatalog'],
    }),
    adminRepairConfig: b.query({
      query: (vertical = 'mobile') => ({ url: adminApiPath('/repair/config'), params: { vertical } }),
      providesTags: (r, e, a) => [{ type: 'RepairConfig', id: a || 'mobile' }],
    }),
    adminUpdateRepairConfig: b.mutation({
      query: ({ vertical = 'mobile', ...body }) => ({
        url: adminApiPath('/repair/config'), method: 'PUT', body: { ...body, vertical },
      }),
      invalidatesTags: (r, e, a) => [{ type: 'RepairConfig', id: a.vertical || 'mobile' }, 'RepairCatalog'],
    }),
    adminRepairPendingPrices: b.query({
      query: () => adminApiPath('/repair/provider-pricing/pending'),
      providesTags: ['RepairPricing'],
    }),
    adminDecideRepairPrice: b.mutation({
      query: ({ id, decision, note }) => ({ url: adminApiPath(`/repair/provider-pricing/${id}/decide`), method: 'POST', body: { decision, note } }),
      invalidatesTags: ['RepairPricing'],
    }),
    adminRepairIdentifications: b.query({
      query: ({ vertical = 'mobile', ...params } = {}) => ({
        url: adminApiPath('/repair/identification-requests'), params: { ...params, vertical },
      }),
      providesTags: ['RepairIdentification'],
    }),
    adminResolveRepairIdentification: b.mutation({
      query: ({ id, ...body }) => ({
        url: adminApiPath(`/repair/identification-requests/${id}/resolve`), method: 'POST', body,
      }),
      invalidatesTags: ['RepairIdentification'],
    }),
    adminRepairCatalogRequests: b.query({
      query: (params = {}) => ({ url: adminApiPath('/repair/catalog-requests'), params }),
      providesTags: ['RepairRequests'],
    }),
    adminApproveCatalogRequest: b.mutation({
      query: ({ id, ...body }) => ({ url: adminApiPath(`/repair/catalog-requests/${id}/approve`), method: 'POST', body }),
      invalidatesTags: ['RepairRequests', 'RepairCatalog'],
    }),
    adminRejectCatalogRequest: b.mutation({
      query: ({ id, note }) => ({ url: adminApiPath(`/repair/catalog-requests/${id}/reject`), method: 'POST', body: { note } }),
      invalidatesTags: ['RepairRequests'],
    }),
    adminRepairBookings: b.query({
      query: (params = {}) => ({ url: adminApiPath('/repair/bookings'), params }),
      providesTags: ['RepairBookings'],
    }),


    // Provider onboarding (shop owner OR individual technician)
    //
    // One surface for both actors: the server reads which one is calling from
    // the token and answers with the documents that kind of provider must show.
    /** What a customer can book today — public, drives the home page. */
    liveCatalog: b.query({
      query: () => '/provider/onboarding/catalog',
      providesTags: ['Onboarding'],
    }),
    /** Can we serve this point, with which live services — see coverage.service. */
    getServiceability: b.query({
      query: ({ lat, lng }) => ({ url: '/serviceability', params: { lat, lng } }),
      keepUnusedDataFor: 60,
    }),
    notifyLaunch: b.mutation({
      query: (body) => ({ url: '/serviceability/notify', method: 'POST', body }),
    }),
    providerOnboardingStatus: b.query({
      query: () => '/provider/onboarding/status',
      providesTags: ['Onboarding'],
    }),
    /** What this provider uploaded: identity once, then each service's application (onboarding/my-documents). */
    /** Instant ID check (onboarding/idcheck): Aadhaar by OTP and PAN; manual review when not available. */
    providerIdCheck: b.query({ query: () => '/provider/onboarding/id-check', providesTags: ['IdCheck'], keepUnusedDataFor: 0 }),
    startAadhaarCheck: b.mutation({ query: (body) => ({ url: '/provider/onboarding/id-check/aadhaar', method: 'POST', body }) }),
    submitAadhaarOtp: b.mutation({ query: (body) => ({ url: '/provider/onboarding/id-check/aadhaar/otp', method: 'POST', body }), invalidatesTags: ['IdCheck', 'Onboarding'] }),
    verifyPanCheck: b.mutation({ query: (body) => ({ url: '/provider/onboarding/id-check/pan', method: 'POST', body }), invalidatesTags: ['IdCheck'] }),
    providerMyDocuments: b.query({
      query: () => '/provider/onboarding/my-documents',
      providesTags: ['Onboarding', 'Kyc'],
      keepUnusedDataFor: 0,
    }),
    providerDomains: b.query({
      query: () => '/provider/onboarding/domains',
      providesTags: ['Onboarding'],
    }),
    providerServiceLines: b.query({
      query: (domainCode) => ({ url: '/provider/onboarding/lines', params: { domainCode } }),
      providesTags: ['Onboarding'],
    }),
    providerLineRequirements: b.query({
      query: (lineCode) => `/provider/onboarding/lines/${lineCode}/requirements`,
      providesTags: ['Onboarding'],
    }),
    providerEnrol: b.mutation({
      query: (body) => ({ url: '/provider/onboarding/enrolments', method: 'POST', body }),
      invalidatesTags: ['Onboarding'],
    }),
    providerSaveEnrolment: b.mutation({
      query: ({ id, ...body }) => ({ url: `/provider/onboarding/enrolments/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Onboarding'],
    }),
    providerSubmitEnrolment: b.mutation({
      query: (id) => ({ url: `/provider/onboarding/enrolments/${id}/submit`, method: 'POST' }),
      invalidatesTags: ['Onboarding'],
    }),
    providerRequestServiceLine: b.mutation({
      query: (body) => ({ url: '/provider/onboarding/line-requests', method: 'POST', body }),
      invalidatesTags: ['Onboarding'],
    }),

    // Provider onboarding: admin
    adminOnboardingList: b.query({
      query: ({ resource, ...params }) => ({
        url: adminApiPath(`/onboarding/${resource}`), params,
      }),
      providesTags: (r, e, a) => [{ type: 'Onboarding', id: a.resource }],
    }),
    /** Services hub: domains → services, with approved / waiting provider counts. */
    adminServicesOverview: b.query({
      query: () => adminApiPath('/onboarding/overview'),
      providesTags: [{ type: 'Onboarding', id: 'domains' }, { type: 'Onboarding', id: 'lines' }, 'Onboarding'],
    }),
    adminOnboardingCreate: b.mutation({
      query: ({ resource, ...body }) => ({
        url: adminApiPath(`/onboarding/${resource}`), method: 'POST', body,
      }),
      invalidatesTags: (r, e, a) => [{ type: 'Onboarding', id: a.resource }],
    }),
    adminOnboardingUpdate: b.mutation({
      query: ({ resource, id, ...body }) => ({
        url: adminApiPath(`/onboarding/${resource}/${id}`), method: 'PATCH', body,
      }),
      invalidatesTags: (r, e, a) => [{ type: 'Onboarding', id: a.resource }],
    }),
    adminOnboardingArchive: b.mutation({
      query: ({ resource, id }) => ({
        url: adminApiPath(`/onboarding/${resource}/${id}`), method: 'DELETE',
      }),
      invalidatesTags: (r, e, a) => [{ type: 'Onboarding', id: a.resource }],
    }),
    adminOnboardingEnrolments: b.query({
      query: (params = {}) => ({ url: adminApiPath('/onboarding/enrolments'), params }),
      providesTags: ['Onboarding'],
    }),
    adminDecideEnrolment: b.mutation({
      query: ({ id, ...body }) => ({
        url: adminApiPath(`/onboarding/enrolments/${id}/decide`), method: 'POST', body,
      }),
      invalidatesTags: ['Onboarding'],
    }),
    /** Repairs customers can see but nobody can do, and unanswered price requests. */
    adminCoverageGaps: b.query({ query: () => ({ url: adminApiPath('/onboarding/gaps') }), providesTags: ['Onboarding'] }),
    /** Admin → Live errors (telemetry/errors): pulse, live feed, issues, plan, message. */
    adminErrorPulse: b.query({ query: () => adminApiPath('/errors/pulse'), keepUnusedDataFor: 0 }),
    /** Live operations → Arrivals: promises kept (jobs/promise) and how sure we are where workers are. */
    adminSurge: b.query({ query: (days = 7) => ({ url: adminApiPath('/economics/surge'), params: { days } }), providesTags: ['Surge'], keepUnusedDataFor: 0 }),
    adminUpdateSurge: b.mutation({ query: (body) => ({ url: adminApiPath('/economics/surge'), method: 'PUT', body }), invalidatesTags: ['Surge'] }),
    adminArrivalReport: b.query({ query: (days = 7) => ({ url: adminApiPath('/liveops/arrivals'), params: { days } }), keepUnusedDataFor: 0 }),
    adminWorkerLocations: b.query({ query: () => adminApiPath('/liveops/locations'), keepUnusedDataFor: 0 }),
    adminErrorLive: b.query({ query: (params = {}) => ({ url: adminApiPath('/errors/live'), params }), keepUnusedDataFor: 0 }),
    adminErrorIssues: b.query({ query: (params = {}) => ({ url: adminApiPath('/errors/issues'), params }), providesTags: ['ErrorIssues'], keepUnusedDataFor: 0 }),
    adminErrorIssue: b.query({ query: (id) => adminApiPath(`/errors/issues/${id}`), providesTags: ['ErrorIssues'], keepUnusedDataFor: 0 }),
    adminPlanErrorIssue: b.mutation({ query: ({ id, ...body }) => ({ url: adminApiPath(`/errors/issues/${id}/plan`), method: 'PATCH', body }), invalidatesTags: ['ErrorIssues'] }),
    adminMessageErrorIssue: b.mutation({ query: ({ id, ...body }) => ({ url: adminApiPath(`/errors/issues/${id}/message`), method: 'POST', body }), invalidatesTags: ['ErrorIssues'] }),
    adminOnboardingLineRequests: b.query({
      query: (params = {}) => ({ url: adminApiPath('/onboarding/line-requests'), params }),
      providesTags: ['Onboarding'],
    }),
    adminApproveLineRequest: b.mutation({
      query: ({ id, ...body }) => ({
        url: adminApiPath(`/onboarding/line-requests/${id}/approve`), method: 'POST', body,
      }),
      invalidatesTags: ['Onboarding'],
    }),
    adminRejectLineRequest: b.mutation({
      query: ({ id, note }) => ({
        url: adminApiPath(`/onboarding/line-requests/${id}/reject`), method: 'POST', body: { note },
      }),
      invalidatesTags: ['Onboarding'],
    }),

    // Repair vertical (customer + worker)
    //
    // `vertical` is threaded through every catalog call and defaults to mobile,
    // so existing callers keep working while laptop (and whatever comes next)
    // reads its own catalog from the same endpoints.
    repairBrands: b.query({
      query: (vertical = 'mobile') => ({ url: '/repair/brands', params: { vertical } }),
      providesTags: (r, e, vertical = 'mobile') => [{ type: 'RepairCatalog', id: `${vertical}:brands` }],
    }),
    repairProductTypes: b.query({
      // vertical, or { vertical, brandCode } for the types that brand makes.
      query: (arg = 'mobile') => ({ url: '/repair/product-types', params: typeof arg === 'string' ? { vertical: arg } : arg }),
      providesTags: (r, e, arg = 'mobile') => [{ type: 'RepairCatalog', id: `${typeof arg === 'string' ? arg : `${arg.vertical}:${arg.brandCode}`}:product-types` }],
    }),
    repairFamilies: b.query({
      query: ({ brandCode, productTypeCode, vertical = 'mobile' }) => ({
        url: `/repair/brands/${brandCode}/families`, params: { productTypeCode, vertical },
      }),
      providesTags: ['RepairCatalog'],
    }),
    repairModels: b.query({
      query: ({ brandCode, q, page = 1, productTypeCode, familyCode, seriesCode, vertical = 'mobile' }) => ({
        url: `/repair/brands/${brandCode}/models`,
        params: { q, page, productTypeCode, familyCode, seriesCode, vertical },
      }),
      providesTags: ['RepairCatalog'],
    }),
    repairConfigurations: b.query({
      query: ({ modelCode, vertical = 'mobile' }) => ({
        url: `/repair/models/${modelCode}/configurations`, params: { vertical },
      }),
      providesTags: ['RepairCatalog'],
    }),
    repairProblems: b.query({
      query: ({ vertical = 'mobile', ...params } = {}) => ({ url: '/repair/problems', params: { ...params, vertical } }),
      providesTags: (r, e, a = {}) => [{ type: 'RepairCatalog', id: `${a.vertical || 'mobile'}:problems` }],
    }),
    submitRepairDiagnostic: b.mutation({
      query: ({ problemCode, answers, vertical = 'mobile' }) => ({
        url: `/repair/diagnostics/${problemCode}`, method: 'POST', params: { vertical }, body: { answers },
      }),
    }),
    /** "I don't know my model" — a human identifies it (§7). */
    submitModelIdentification: b.mutation({
      query: (body) => ({ url: '/repair/identify', method: 'POST', body }),
      invalidatesTags: ['RepairIdentification'],
    }),
    myModelIdentifications: b.query({
      query: (vertical = 'mobile') => ({ url: '/repair/identify/mine', params: { vertical } }),
      providesTags: ['RepairIdentification'],
    }),
    repairPricePreview: b.query({ query: (params) => ({ url: '/repair/price-preview', params }) }),
    // Add-ons priced by the chosen provider — see listAddOns on the server.
    repairAddOns: b.query({ query: (params) => ({ url: '/repair/addons', params }) }),
    // "My Water Assets" and the same for any other vertical — one saved
    // tank/phone/vehicle the customer can rebook against without re-typing it.
    myAssets: b.query({
      query: (params) => ({ url: '/repair/assets', params }),
      providesTags: ['MyAssets'],
    }),
    createAsset: b.mutation({
      query: (body) => ({ url: '/repair/assets', method: 'POST', body }),
      invalidatesTags: ['MyAssets'],
    }),
    deleteAsset: b.mutation({
      query: (id) => ({ url: `/repair/assets/${id}`, method: 'DELETE' }),
      invalidatesTags: ['MyAssets'],
    }),

    /* Helping Services */
    helpingServices: b.query({
      query: () => '/helping/services',
      providesTags: ['HelpingConfig'],
    }),
    helpingQuote: b.mutation({ query: (body) => ({ url: '/helping/quote', method: 'POST', body }) }),
    createHelpingTask: b.mutation({
      query: (body) => ({ url: '/helping/tasks', method: 'POST', body }),
      invalidatesTags: ['HelpingTasks'],
    }),
    myHelpingTasks: b.query({
      query: (params) => ({ url: '/helping/tasks', params }),
      providesTags: ['HelpingTasks'],
    }),
    getHelpingTask: b.query({
      query: (id) => `/helping/tasks/${id}`,
      providesTags: (r, e, id) => [{ type: 'HelpingTasks', id }],
    }),
    respondHelpingApproval: b.mutation({
      query: ({ id, approvalId, approved }) => ({
        url: `/helping/tasks/${id}/approvals/${approvalId}`, method: 'POST', body: { approved },
      }),
      invalidatesTags: (r, e, a) => [{ type: 'HelpingTasks', id: a.id }],
    }),
    cancelHelpingTask: b.mutation({
      query: ({ id, reason }) => ({ url: `/helping/tasks/${id}/cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: (r, e, a) => [{ type: 'HelpingTasks', id: a.id }, 'HelpingTasks'],
    }),
    rateHelpingTask: b.mutation({
      query: ({ id, ...body }) => ({ url: `/helping/tasks/${id}/rate`, method: 'POST', body }),
      invalidatesTags: (r, e, a) => [{ type: 'HelpingTasks', id: a.id }],
    }),

    // Worker side
    availableHelpingTasks: b.query({
      query: () => '/helping/tasks/available',
      providesTags: ['HelpingAvailable'],
    }),
    acceptHelpingTask: b.mutation({
      query: (id) => ({ url: `/helping/tasks/${id}/accept`, method: 'POST' }),
      invalidatesTags: (r, e, id) => [{ type: 'HelpingTasks', id }, 'HelpingAvailable', 'HelpingTasks'],
    }),
    advanceHelpingStatus: b.mutation({
      query: ({ id, ...body }) => ({ url: `/helping/tasks/${id}/status`, method: 'POST', body }),
      invalidatesTags: (r, e, a) => [{ type: 'HelpingTasks', id: a.id }],
    }),
    updateHelpingItem: b.mutation({
      query: ({ id, itemId, ...body }) => ({ url: `/helping/tasks/${id}/items/${itemId}`, method: 'PATCH', body }),
      invalidatesTags: (r, e, a) => [{ type: 'HelpingTasks', id: a.id }],
    }),
    proposeHelpingAlternative: b.mutation({
      query: ({ id, itemId, ...body }) => ({ url: `/helping/tasks/${id}/items/${itemId}/alternative`, method: 'POST', body }),
      invalidatesTags: (r, e, a) => [{ type: 'HelpingTasks', id: a.id }],
    }),
    recordHelpingAdvance: b.mutation({
      query: ({ id, amountPaise }) => ({ url: `/helping/tasks/${id}/advance`, method: 'POST', body: { amountPaise } }),
      invalidatesTags: (r, e, a) => [{ type: 'HelpingTasks', id: a.id }],
    }),
    addHelpingProof: b.mutation({
      query: ({ id, ...body }) => ({ url: `/helping/tasks/${id}/proof`, method: 'POST', body }),
      invalidatesTags: (r, e, a) => [{ type: 'HelpingTasks', id: a.id }],
    }),
    recordHelpingHandover: b.mutation({
      query: ({ id, ...body }) => ({ url: `/helping/tasks/${id}/handover`, method: 'POST', body }),
      invalidatesTags: (r, e, a) => [{ type: 'HelpingTasks', id: a.id }],
    }),
    completeHelpingTask: b.mutation({
      // Accepts an id, or { id, code } when the customer's code is needed on delivery.
      query: (arg) => {
        const { id, code } = typeof arg === 'object' ? arg : { id: arg };
        return { url: `/helping/tasks/${id}/complete`, method: 'POST', body: code ? { code } : {} };
      },
      invalidatesTags: (r, e, arg) => [{ type: 'HelpingTasks', id: typeof arg === 'object' ? arg.id : arg }],
    }),
    // The helper's own tasks still in hand.
    assignedHelpingTasks: b.query({
      query: () => '/helping/tasks/assigned',
      providesTags: ['HelpingTasks'],
    }),
    // Helper took the service fee in cash.
    collectHelpingCash: b.mutation({
      query: (id) => ({ url: `/helping/tasks/${id}/collect-cash`, method: 'POST' }),
      invalidatesTags: (r, e, id) => [{ type: 'HelpingTasks', id }],
    }),

    // Admin
    adminHelpingTasks: b.query({
      query: (params) => ({ url: adminApiPath('/helping/tasks'), params }),
      providesTags: ['AdminHelpingTasks'],
    }),
    adminHelpingConfig: b.query({
      query: () => adminApiPath('/helping/config'),
      providesTags: ['HelpingConfig'],
    }),
    adminUpdateHelpingConfig: b.mutation({
      query: ({ serviceType, ...body }) => ({
        url: adminApiPath(`/helping/config/${serviceType}`), method: 'PUT', body,
      }),
      invalidatesTags: ['HelpingConfig'],
    }),
    adminHelpingRefundOutcome: b.mutation({
      query: ({ id, ...body }) => ({ url: adminApiPath(`/helping/tasks/${id}/refund-outcome`), method: 'POST', body }),
      invalidatesTags: ['AdminHelpingTasks'],
    }),

    /* Pet Services */
    petCategories: b.query({ query: () => '/pet/categories', providesTags: ['PetCatalog'] }),
    petVariants: b.query({ query: (params) => ({ url: '/pet/variants', params }), providesTags: ['PetCatalog'] }),
    petBreeds: b.query({ query: (params) => ({ url: '/pet/breeds', params }), providesTags: ['PetCatalog'] }),
    petAddons: b.query({ query: (params) => ({ url: '/pet/addons', params }), providesTags: ['PetCatalog'] }),
    petCompatibility: b.query({ query: (params) => ({ url: '/pet/compatibility', params }) }),
    myPets: b.query({ query: () => '/pet/my-pets', providesTags: ['MyPets'] }),
    createMyPet: b.mutation({
      query: (body) => ({ url: '/pet/my-pets', method: 'POST', body }),
      invalidatesTags: ['MyPets'],
    }),
    updateMyPet: b.mutation({
      query: ({ id, ...body }) => ({ url: `/pet/my-pets/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['MyPets'],
    }),
    deleteMyPet: b.mutation({
      query: (id) => ({ url: `/pet/my-pets/${id}`, method: 'DELETE' }),
      invalidatesTags: ['MyPets'],
    }),
    myPetHistory: b.query({ query: (id) => `/pet/my-pets/${id}/history` }),

    petQuote: b.mutation({ query: (body) => ({ url: '/pet/quote', method: 'POST', body }) }),
    petProviderSearch: b.mutation({ query: (body) => ({ url: '/pet/providers/search', method: 'POST', body }) }),

    createPetBooking: b.mutation({
      query: (body) => ({ url: '/pet/bookings', method: 'POST', body }),
      invalidatesTags: ['PetBookings'],
    }),
    myPetBookings: b.query({
      query: (params) => ({ url: '/pet/bookings', params }),
      providesTags: ['PetBookings'],
    }),
    getPetBooking: b.query({
      query: (id) => `/pet/bookings/${id}`,
      providesTags: (r, e, id) => [{ type: 'PetBookings', id }],
    }),
    cancelPetBooking: b.mutation({
      query: ({ id, ...body }) => ({ url: `/pet/bookings/${id}/cancel`, method: 'POST', body }),
      invalidatesTags: (r, e, a) => [{ type: 'PetBookings', id: a.id }, 'PetBookings'],
    }),
    ratePetBooking: b.mutation({
      query: ({ id, ...body }) => ({ url: `/pet/bookings/${id}/rate`, method: 'POST', body }),
      invalidatesTags: (r, e, a) => [{ type: 'PetBookings', id: a.id }],
    }),

    availablePetBookings: b.query({ query: (params) => ({ url: '/pet/bookings/available', params }), providesTags: ['PetAvailable'] }),
    acceptPetBooking: b.mutation({
      query: (id) => ({ url: `/pet/bookings/${id}/accept`, method: 'POST' }),
      invalidatesTags: (r, e, id) => [{ type: 'PetBookings', id }, 'PetAvailable'],
    }),
    declinePetBooking: b.mutation({
      query: ({ id, reason }) => ({ url: `/pet/bookings/${id}/decline`, method: 'POST', body: { reason } }),
      invalidatesTags: (r, e, a) => [{ type: 'PetBookings', id: a.id }, 'PetBookings'],
    }),
    advancePetBookingStatus: b.mutation({
      query: ({ id, ...body }) => ({ url: `/pet/bookings/${id}/status`, method: 'POST', body }),
      invalidatesTags: (r, e, a) => [{ type: 'PetBookings', id: a.id }],
    }),
    // The provider's own pet jobs still in hand (incl. waiting for payment).
    assignedPetBookings: b.query({
      query: () => '/pet/bookings/assigned',
      providesTags: ['PetBookings'],
    }),
    // Provider took the customer's cash.
    collectPetCash: b.mutation({
      query: (id) => ({ url: `/pet/bookings/${id}/collect-cash`, method: 'POST' }),
      invalidatesTags: (r, e, id) => [{ type: 'PetBookings', id }],
    }),
    addPetBookingProof: b.mutation({
      query: ({ id, ...body }) => ({ url: `/pet/bookings/${id}/proof`, method: 'POST', body }),
      invalidatesTags: (r, e, a) => [{ type: 'PetBookings', id: a.id }],
    }),

    myPetRecurring: b.query({ query: () => '/pet/recurring', providesTags: ['PetRecurring'] }),
    pausePetRecurring: b.mutation({
      query: (id) => ({ url: `/pet/recurring/${id}/pause`, method: 'POST' }),
      invalidatesTags: ['PetRecurring'],
    }),
    resumePetRecurring: b.mutation({
      query: (id) => ({ url: `/pet/recurring/${id}/resume`, method: 'POST' }),
      invalidatesTags: ['PetRecurring'],
    }),
    cancelPetRecurring: b.mutation({
      query: (id) => ({ url: `/pet/recurring/${id}/cancel`, method: 'POST' }),
      invalidatesTags: ['PetRecurring'],
    }),

    adminPetBookings: b.query({
      query: (params) => ({ url: adminApiPath('/pet/bookings'), params }),
      providesTags: ['AdminPetBookings'],
    }),
    adminPetPricing: b.query({
      query: () => adminApiPath('/pet/pricing'),
      providesTags: ['AdminPetPricing'],
    }),
    adminUpdatePetPricing: b.mutation({
      query: ({ id, ...body }) => ({ url: adminApiPath(`/pet/pricing/${id}`), method: 'PUT', body }),
      invalidatesTags: ['AdminPetPricing'],
    }),
    adminPetCapabilities: b.query({
      query: (params) => ({ url: adminApiPath('/pet/capabilities'), params }),
      providesTags: ['AdminPetCapabilities'],
    }),
    adminUpdatePetCapability: b.mutation({
      query: ({ id, ...body }) => ({ url: adminApiPath(`/pet/capabilities/${id}`), method: 'PUT', body }),
      invalidatesTags: ['AdminPetCapabilities'],
    }),
    repairProviders: b.query({ query: (params) => ({ url: '/repair/providers', params }) }),
    /* Price requests: ask nearby shops for their price (repair/services/price-request). */
    createPriceRequest: b.mutation({ query: (body) => ({ url: '/repair/price-requests', method: 'POST', body }) }),
    priceRequest: b.query({ query: (id) => ({ url: `/repair/price-requests/${id}` }), providesTags: (r, e, id) => [{ type: 'PriceRequest', id }] }),
    cancelPriceRequest: b.mutation({
      query: (id) => ({ url: `/repair/price-requests/${id}/cancel`, method: 'POST' }),
      invalidatesTags: (r, e, id) => [{ type: 'PriceRequest', id }],
    }),
    shopPriceRequests: b.query({ query: () => ({ url: '/repair/provider/price-requests' }), providesTags: ['PriceRequest'] }),
    offerPrice: b.mutation({
      query: ({ id, ...body }) => ({ url: `/repair/provider/price-requests/${id}/offer`, method: 'POST', body }),
      invalidatesTags: ['PriceRequest'],
    }),
    createRepairBooking: b.mutation({
      query: (body) => ({ url: '/repair/bookings', method: 'POST', body }),
      invalidatesTags: ['RepairBookings'],
    }),
    myRepairBookings: b.query({
      query: (page = 1) => `/repair/bookings/mine?page=${page}`,
      providesTags: ['RepairBookings'],
    }),
    getRepairBooking: b.query({
      query: (id) => `/repair/bookings/${id}`,
      providesTags: (r, e, id) => [{ type: 'RepairBookings', id }],
    }),
    transitionRepairBooking: b.mutation({
      query: ({ id, status, reason }) => ({ url: `/repair/bookings/${id}/status`, method: 'POST', body: { status, reason } }),
      invalidatesTags: (r, e, a) => ['RepairBookings', { type: 'RepairBookings', id: a.id }],
    }),
    /** The technician records taking the customer's cash. */
    /** A shop owner hands a job to one of their own technicians. */
    /** A shop owner puts one of their technicians on any job the shop holds. */
    assignJobTechnician: b.mutation({
      query: ({ id, workerId }) => ({ url: `/jobs/${id}/assign`, method: 'POST', body: { workerId } }),
      invalidatesTags: ['RepairBookings', 'RepairProvider', 'PetBookings'],
    }),
    /** Take a job offered to several pros at once; the first to claim it wins (409 ALREADY_CLAIMED after). */
    claimRepairBooking: b.mutation({
      query: (id) => ({ url: `/repair/bookings/${id}/claim`, method: 'POST' }),
      invalidatesTags: ['RepairBookings', 'RepairProvider'],
    }),
    /** Provider passes on a job — it goes back for reassignment. */
    declineRepairBooking: b.mutation({
      query: ({ id, reason }) => ({ url: `/repair/bookings/${id}/decline`, method: 'POST', body: { reason } }),
      invalidatesTags: ['RepairBookings', 'RepairProvider'],
    }),
    collectRepairCash: b.mutation({
      query: (id) => ({ url: `/repair/bookings/${id}/collect-cash`, method: 'POST' }),
      invalidatesTags: (r, e, id) => ['RepairBookings', { type: 'RepairBookings', id }],
    }),
    cancelRepairBooking: b.mutation({
      query: ({ id, reason }) => ({ url: `/repair/bookings/${id}/cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: (r, e, a) => ['RepairBookings', { type: 'RepairBookings', id: a.id }],
    }),
    submitRepairQuote: b.mutation({
      query: ({ id, ...body }) => ({ url: `/repair/bookings/${id}/quotes`, method: 'POST', body }),
      invalidatesTags: (r, e, a) => [{ type: 'RepairBookings', id: a.id }],
    }),
    respondRepairQuote: b.mutation({
      query: ({ quoteId, decision, reason }) => ({ url: `/repair/quotes/${quoteId}/respond`, method: 'POST', body: { decision, reason } }),
      invalidatesTags: ['RepairBookings'],
    }),
    repairQaChecklist: b.query({ query: (id) => `/repair/bookings/${id}/qa-checklist` }),
    submitRepairQa: b.mutation({
      query: ({ id, ...body }) => ({ url: `/repair/bookings/${id}/qa`, method: 'POST', body }),
      invalidatesTags: (r, e, a) => [{ type: 'RepairBookings', id: a.id }],
    }),
    submitRepairCatalogRequest: b.mutation({
      query: (body) => ({ url: '/repair/catalog-requests', method: 'POST', body }),
    }),

    // Repair provider self-service
    repairOnboardingStatus: b.query({
      query: (vertical = 'mobile') => ({ url: '/repair/provider/onboarding', params: { vertical } }),
      providesTags: ['RepairProvider'],
    }),
    repairProviderJobs: b.query({
      query: (params = {}) => ({ url: '/repair/provider/jobs', params }),
      providesTags: ['RepairBookings'],
    }),
    repairServiceAreas: b.query({
      query: (vertical = 'mobile') => ({ url: '/repair/provider/service-areas', params: { vertical } }),
      providesTags: ['RepairProvider'],
    }),
    upsertRepairServiceArea: b.mutation({
      query: (body) => ({ url: '/repair/provider/service-areas', method: 'PUT', body }),
      invalidatesTags: ['RepairProvider'],
    }),
    repairProviderPricing: b.query({
      query: (vertical = 'mobile') => ({ url: '/repair/provider/pricing', params: { vertical } }),
      providesTags: ['RepairProvider'],
    }),
    /** Headings + the repairs under them, with what this provider already claims. */
    repairWorkCatalog: b.query({
      query: ({ vertical = 'mobile', cityCode } = {}) => ({
        url: '/repair/provider/work-catalog', params: { vertical, cityCode },
      }),
      providesTags: ['RepairProvider'],
    }),
    /** Save a screenful of tick-boxes in one request. */
    saveRepairCapabilities: b.mutation({
      query: (body) => ({ url: '/repair/provider/capabilities/bulk', method: 'PUT', body }),
      invalidatesTags: ['RepairProvider'],
    }),
    requestRepairCatalogAddition: b.mutation({
      query: (body) => ({ url: '/repair/provider/catalog-requests', method: 'POST', body }),
      invalidatesTags: ['RepairProvider'],
    }),


    /**
     * A model's whole price sheet in one request.
     *
     * The vertical rides in the query string as well as the body: the body is
     * schema-validated with stripUnknown, so a field the schema forgets is
     * dropped before the server reads it, and a laptop price would quietly be
     * filed under mobile.
     */
    /** Photographs of the finished work. */
    attachRepairCompletionPhotos: b.mutation({
      query: ({ id, photos }) => ({
        url: `/repair/bookings/${id}/completion-photos`, method: 'POST', body: { photos },
      }),
      invalidatesTags: (r, e, { id }) => [{ type: 'RepairBookings', id }],
    }),
    /** The customer rates a finished repair. Once. */
    rateRepairBooking: b.mutation({
      query: ({ id, rating, comment }) => ({
        url: `/repair/bookings/${id}/rate`, method: 'POST', body: { rating, comment },
      }),
      invalidatesTags: (r, e, { id }) => [{ type: 'RepairBookings', id }],
    }),
    /** The customer's own code for whichever handover step is due. */
    repairHandoverCode: b.query({
      query: (id) => ({ url: `/repair/bookings/${id}/handover-code` }),
      providesTags: (r, e, id) => [{ type: 'RepairBookings', id }],
    }),
    /** The technician types what the customer reads out. */
    verifyRepairHandoverCode: b.mutation({
      query: ({ id, kind, code }) => ({
        url: `/repair/bookings/${id}/handover-code/verify`,
        method: 'POST',
        body: { kind, code },
      }),
      invalidatesTags: (r, e, { id }) => [{ type: 'RepairBookings', id }],
    }),
    /** ZappyOne market prices for this provider's jobs — fills a price sheet. */
    repairProviderSuggestedPricing: b.query({
      query: ({ vertical = 'mobile', brandCode, modelCode }) => ({
        url: '/repair/provider/pricing/suggested', params: { vertical, brandCode, modelCode },
      }),
    }),
    /** A shop's warranty on one repair, applied to all its prices for it. */
    setShopWarranty: b.mutation({ query: (body) => ({ url: '/repair/provider/pricing/warranty', method: 'PATCH', body }) }),
    repairWarranty: b.query({ query: (id) => ({ url: `/repair/bookings/${id}/warranty` }), providesTags: (r, e, id) => [{ type: 'RepairBookings', id }] }),
    claimRepairWarranty: b.mutation({
      query: ({ id, ...body }) => ({ url: `/repair/bookings/${id}/warranty-claims`, method: 'POST', body }),
      invalidatesTags: (r, e, { id }) => [{ type: 'RepairBookings', id }],
    }),
    adminWarrantyClaims: b.query({ query: () => ({ url: adminApiPath('/repair/warranty-claims'), params: { limit: 100 } }) }),
    adminDecideWarrantyClaim: b.mutation({ query: ({ id, ...body }) => ({ url: adminApiPath(`/repair/warranty-claims/${id}`), method: 'PATCH', body }) }),
    bulkRepairProviderPricing: b.mutation({
      query: ({ vertical = 'mobile', rows }) => ({
        url: '/repair/provider/pricing/bulk',
        method: 'POST',
        params: { vertical },
        body: { vertical, rows },
      }),
      invalidatesTags: ['RepairProvider'],
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

    /* Unified bookings (orders + repair + helping + pet) */
    adminBookings: b.query({
      query: (params = {}) => ({ url: adminApiPath('/bookings'), params }),
      providesTags: ['AdminBookings'],
    }),
    adminJobCandidates: b.query({
      query: ({ source, id }) => adminApiPath(`/bookings/${source}/${id}/candidates`),
      providesTags: (r, e, a) => [{ type: 'AdminBookings', id: `${a.source}:${a.id}` }],
    }),
    adminAssignJob: b.mutation({
      query: ({ source, id, ...body }) => ({ url: adminApiPath(`/bookings/${source}/${id}/assign`), method: 'POST', body }),
      invalidatesTags: (r, e, a) => [{ type: 'AdminBookings', id: `${a.source}:${a.id}` }, 'AdminBookings'],
    }),
    adminJobNotes: b.query({
      query: ({ source, id }) => adminApiPath(`/bookings/${source}/${id}/notes`),
      providesTags: (r, e, a) => [{ type: 'AdminBookings', id: `notes:${a.source}:${a.id}` }],
    }),
    adminAddJobNote: b.mutation({
      query: ({ source, id, text }) => ({ url: adminApiPath(`/bookings/${source}/${id}/notes`), method: 'POST', body: { text } }),
      invalidatesTags: (r, e, a) => [{ type: 'AdminBookings', id: `notes:${a.source}:${a.id}` }],
    }),
    adminBookingDetail: b.query({
      query: ({ source, id }) => adminApiPath(`/bookings/${source}/${id}`),
      providesTags: (r, e, a) => [{ type: 'AdminBookings', id: `${a.source}:${a.id}` }],
    }),
    adminCancelPetBooking: b.mutation({
      query: ({ id, reason }) => ({ url: adminApiPath(`/pet/bookings/${id}/cancel`), method: 'POST', body: { reason } }),
      invalidatesTags: ['AdminBookings', 'AdminPetBookings'],
    }),
    adminCancelHelpingTask: b.mutation({
      query: ({ id, reason }) => ({ url: adminApiPath(`/helping/tasks/${id}/cancel`), method: 'POST', body: { reason } }),
      invalidatesTags: ['AdminBookings', 'AdminHelpingTasks'],
    }),
    adminForceCancelOrder: b.mutation({
      query: ({ id, reason, refundFull }) => ({ url: adminApiPath(`/orders/${id}/force-cancel`), method: 'POST', body: { reason, refundFull } }),
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
  };
}
