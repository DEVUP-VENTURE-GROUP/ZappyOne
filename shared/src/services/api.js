import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { reportApiFailure, setReporterToken } from '../utils/errorReporter';
import { Mutex } from 'async-mutex';
import toast from 'react-hot-toast';
import { setAuth, logout } from '../modules/auth/authSlice';
import { adminApiPath } from '../config/admin';
import { TAG_TYPES, bindApi, endpoints } from './endpoints';

// Debounced "signed out on another device" notice — a burst of in-flight requests
// all 401 at once, but the user should see the message only once.
let _sessionReplacedAt = 0;
function sessionReplacedToast() {
  if (Date.now() - _sessionReplacedAt < 4000) return;
  _sessionReplacedAt = Date.now();
  toast.error('You were signed out - your account was opened on another device.', { id: 'session-replaced', duration: 5000 });
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: `${import.meta.env.VITE_API_URL || ''}/api`,
  // credentials: 'include' sends the httpOnly refresh-token cookie on every request.
  // The server only reads it on /auth/refresh and /auth/logout — all other routes
  // ignore it. Required for the silent refresh flow.
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = getState().auth.accessToken;
    if (token) headers.set('authorization', `Bearer ${token}`);
    // Set only by the admin portal's build — the server then uses the admin
    // refresh cookie instead of the customer one.
    if (import.meta.env.VITE_CLIENT_SURFACE) headers.set('x-client-type', import.meta.env.VITE_CLIENT_SURFACE);
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

const baseQueryWithReauthRaw = async (args, api, extraOptions) => {
  setReporterToken(() => api.getState().auth?.accessToken);
  let result = await rawBaseQuery(args, api, extraOptions);

  // What the person was shown going wrong reaches Admin → Live errors (utils/errorReporter).
  if (result.error && result.error.status !== 401) reportApiFailure(args, result.error);
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

/**
 * A fault on our side is never shown as one. When the server fails (5xx) or
 * the reply is not ours to read (a gateway page, a dropped connection), its
 * text is taken off the error, so every screen's own calm line shows instead
 * ("Could not take this job"). A 4xx message tells the person what to change
 * and passes through. The full failure was already sent to Live errors.
 */
const OUR_SIDE = new Set(['FETCH_ERROR', 'PARSING_ERROR', 'TIMEOUT_ERROR']);
function calm(result) {
  const e = result?.error;
  if (!e || !(OUR_SIDE.has(e.status) || (typeof e.status === 'number' && e.status >= 500))) return result;
  const data = e.data && typeof e.data === 'object' ? { ...e.data } : {};
  delete data.error;
  delete data.message;
  return { ...result, error: { ...e, data } };
}

const baseQueryWithReauth = async (args, api, extraOptions) => calm(await baseQueryWithReauthRaw(args, api, extraOptions));

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  // Disable refetch-on-focus — dashboard fires 6-8 queries; tab switching floods the limiter
  refetchOnFocus: false,
  refetchOnReconnect: true,
  // Keep fetched data cached for 5 min after a component unmounts, so jumping
  // back to a tab shows data instantly (no skeleton) instead of refetching.
  keepUnusedDataFor: 300,
  tagTypes: TAG_TYPES,
  // Every server call, written once for the websites and the apps (services/endpoints).
  endpoints: (b) => endpoints(b, { adminApiPath }),
});
// The optimistic patches in endpoints.js need the finished API.
bindApi(api);

export const {
  useRequestOtpMutation,
  useResendOtpMutation,
  useLoginUserMutation,
  useLoginWorkerMutation,
  useLoginWorkerPasswordMutation,
  useSetWorkerCredentialsMutation,
  useForgotWorkerPasswordMutation,
  useLoginAdminMutation,
  useLogoutMutation,
  useGetMeQuery,
  useLazySmartSearchQuery,
  useSearchTrendingQuery,
  useGetOrderQuery,
  useGetOrderTimelineQuery,
  useListOrdersQuery,
  useGetCancelPreviewQuery,
  useCancelOrderMutation,
  useRateOrderMutation,
  useGetWorkerMeQuery,
  useGetMyShopQuery,
  useUpdateWorkerProfileMutation,
  useGoOnlineMutation,
  useGoOfflineMutation,
  useGetEarningsQuery,
  useGetKycStatusQuery,
  useSubmitKycMutation,
  usePresignUploadMutation,
  useLensUploadUrlMutation,
  useAnalyzeLensMutation,
  useGetFaqsQuery,
  useGetPoliciesQuery,
  useGetPolicyQuery,
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
  useAdminRunKycVerifyMutation,
  useAdminMetricsQuery,
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
  useWorkerDuesQuery,
  useClaimDuesPaymentMutation,
  useAdminDuesQuery,
  useAdminRecordDuesPaymentMutation,
  useAdminRejectDuesClaimMutation,
  useWalletTransactionsQuery,
  useWalletTopupMutation,
  useVerifyPaymentMutation,
  useGetPaymentAvailabilityQuery,
  useCreateBookingPaymentMutation,
  useGetPricingConfigQuery,
  useAdminPaymentsQuery,
  useAdminLaunchInterestQuery,
  useAdminMeQuery,
  useAdminTeamQuery,
  useAdminRolesQuery,
  useAdminCreateAdminMutation,
  useAdminUpdateAdminMutation,
  useAdminPaymentsSummaryQuery,
  useAdminRetryRefundMutation,
  useAdminMarkRefundedMutation,
  useAdminReconcilePaymentMutation,
  useLazyAdminNotificationHealthQuery,
  useLazyAdminNotificationStatsQuery,
  useAdminSendNotificationMutation,
  useAdminBroadcastNotificationMutation,
  useAdminListUsersQuery,
  useAdminGetUserQuery,
  useAdminBlockUserMutation,
  useAdminWaiveCashDueMutation,
  useAdminWalletAdjustMutation,
  useAdminWalletReconcileMutation,
  useAdminAuditLogsQuery,
  useAdminDisputesQuery,
  useAdminResolveDisputeMutation,
  useAdminPayoutsQuery,
  useAdminApprovePayoutMutation,
  useAdminRejectPayoutMutation,
  useAdminProcessPayoutMutation,
  useAdminMarkPayoutPaidMutation,
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
  useGetChatMessagesQuery,
  useSendChatMessageMutation,
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
  useAdminAdWalletsQuery,
  // Promos
  useAdminListPromosQuery,
  useAdminCreatePromoMutation,
  useAdminUpdatePromoMutation,
  useAdminDeletePromoMutation,
  // Gamification + Recommendations
  // Enterprise admin
  useAdminSystemHealthQuery,
  useAdminFeatureFlagsQuery,
  useAppReleaseQuery,
  useDocLinkMutation,
  useJobBillQuery,
  useOrderBillQuery,
  useAdminAppReleasesQuery,
  useAdminSetAppReleaseMutation,
  useAdminSetFeatureFlagMutation,
  useAdminAlertsQuery,
  useAdminTodoQuery,
  useAdminBookingHealthQuery,
  useAdminSupportTicketsQuery,
  useAdminReplyTicketMutation,
  useAdminLiveOpsQuery, useAdminStuckJobsQuery,
  // Referrals
  useGetReferralCodeQuery,
  useGetReferralHistoryQuery,
  // Worker public profile + leaderboard
  useGetWorkerPublicProfileQuery,
  // Diagnosis flow
  // Surge info
  // Tip
  useSendTipMutation,
  // Price revision
  useGetPriceRevisionQuery,
  useRespondPriceRevisionMutation,
  // Warranty + checklist
  useGetOrderWarrantyQuery,
  // Shifts
  // Wellness + earned wage
  // SOS + bonus
  useTriggerSOSMutation,
  // Construction timer
  // Phone + vehicle health
  // Admin catalog + verticals
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
  useAdminFeesQuery,
  useAdminBookingAttentionQuery,
  useAdminInsightsOverviewQuery,
  useAdminInsightsDemandQuery,
  useAdminInsightsSupplyQuery,
  useAdminInsightsFunnelQuery,
  useAdminInsightsCustomersQuery,
  useAdminInsightsMoneyQuery,
  useAdminInsightsGeoQuery,
  useAdminFleetNextHubQuery,
  useAdminInsightsLiveQuery,
  useAdminSearchDemandQuery,
  useAdminUpdateFeeMutation,
  // Job chat
  useJobChatQuery,
  useJobOptionsQuery,
  useProviderMyDocumentsQuery,
  useProviderIdCheckQuery, useStartAadhaarCheckMutation, useSubmitAadhaarOtpMutation, useVerifyPanCheckMutation,
  useAdminErrorPulseQuery, useAdminErrorLiveQuery, useAdminErrorIssuesQuery, useAdminErrorIssueQuery,
  useAdminPlanErrorIssueMutation, useAdminMessageErrorIssueMutation,
  useAdminArrivalReportQuery, useAdminWorkerLocationsQuery, useAdminSurgeQuery, useAdminUpdateSurgeMutation,
  useRescheduleJobMutation,
  useJobArrivalQuery,
  useAdminReinstateEventPartnerMutation,
  useEventDeclineQuoteQuery,
  useVerifyActionOtpMutation, useShopPayoutsQuery, useRequestShopPayoutMutation, useAdminShopPayoutsQuery, useAdminDecideShopPayoutMutation,
  useMyRepeatsQuery, useRepeatJobMutation, useRepeatActionMutation,
  useWorkerHoursQuery, useSaveWorkerHoursMutation,
  useRateCustomerMutation,
  useJobEarningsQuery,
  useSurgeQuoteQuery,
  useWorkerHotZonesQuery,
  useMyPendingCancelFeeQuery,
  useMyCheckoutDraftsQuery,
  useSaveCheckoutDraftMutation,
  useClearCheckoutDraftMutation,
  useQuoteRepairGroupMutation,
  useCreateRepairGroupMutation,
  useRepairGroupQuery,
  useRepairSuggestionsQuery,
  useRepairVerticalsQuery,
  useStorefrontsQuery,
  useStorefrontMenuQuery,
  usePlansNearQuery, usePlansNearAnyQuery, usePlanQuoteQuery, useSubscribePlanMutation, useMyPlansQuery, usePausePlanDayMutation, useCancelPlanMutation, useRatePlanVisitMutation,
  useProviderPlanCatalogQuery, useProviderPlansQuery, useSaveProviderPlanMutation, useSubmitProviderPlanMutation, useSetProviderPlanLiveMutation, useProviderPlanSubscriptionsQuery,
  useProviderPlanVisitsQuery, useAssignPlanVisitMutation, useStartPlanVisitMutation, useCompletePlanVisitMutation,
  useLensStatusQuery,
  useReportProviderAbsentMutation,
  useBoostJobMutation,
  useTipJobMutation,
  useAdminBoostTipsQuery,
  useAdminMessagesQuery,
  useAdminMessagePreviewQuery,
  useAdminMessageLogQuery,
  useAdminSendTestMessageMutation,
  useAdminUpdateMessageSettingsMutation,
  useAdminUpdateBoostTipsMutation,
  useAdminDispatchQuery,
  useAdminUpdateDispatchMutation,
  useAdminPartnerCommissionQuery,
  useAdminUpdatePartnerCommissionMutation,
  useAdminPartnerRateQuery,
  useAdminSetPartnerRateMutation,
  useAdminPartnerRateOverridesQuery,
  useJobGiveBackQuery,
  useGiveBackJobMutation,
  useConfirmJobSafeMutation,
  useAskJobMoreTimeMutation,
  useBlockJobCustomerMutation,
  useReportCustomerAbsentMutation, useReportCashRefusedMutation,
  useSendJobChatMutation,
  // Account
  useAccountMeQuery,
  useAccountCapabilitiesQuery,
  useMyReviewsQuery,
  useSetAccountPhotoMutation,
  useSkipAccountPhotoMutation,
  useMarkReleaseSeenMutation,
  useReportReviewMutation,
  useAdminReviewsQuery,
  useAdminModerateReviewMutation,
  useSetAccountNameMutation,
  useSetAccountPasswordMutation,
  useStartEmailVerificationMutation,
  useConfirmEmailMutation,
  useCompleteAccountSetupMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  usePasswordLoginMutation,
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
  usePartnerBookingQuery,
  useAddPartnerSetupPhotosMutation,
  useEventThemeAvailabilityQuery,
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
  useAdminEventConfigQuery,
  useAdminUpdateEventConfigMutation,
  useAdminEventAnalyticsQuery,
  useAdminEventCategoriesQuery,
  useAdminUpsertEventCategoryMutation,
  useAdminDeleteEventCategoryMutation,
  useAdminCancelEventBookingMutation,
  useDeclineEventBookingMutation,
  useAdminGetEventPartnerQuery,
  useAdminApproveEventPartnerKycMutation,
  useAdminRejectEventPartnerKycMutation,
  useAdminClarifyEventPartnerKycMutation,
  useAdminBlockEventPartnerMutation,
  // Shop
  useLoginShopMutation,
  useShopMeQuery,
  useShopShareLinkQuery,
  useServiceproLoginMutation, useServiceproRegisterMutation, useProviderWorkspaceQuery, useProviderProfileStatusQuery, useProviderSetupJourneyQuery,
  useUpdateShopMeMutation,
  useShopKycStatusQuery,
  useSubmitShopKycMutation,
  useShopWorkersQuery,
  useAddShopWorkerMutation,
  useRemoveShopWorkerMutation,
  useShopEarningsQuery,
  useNearbyShopsQuery,
  useGetShopProfileQuery,
  useAdminShopsQuery,
  useAdminApproveShopKycMutation,
  useAdminRejectShopKycMutation,
  useAdminClarifyShopKycMutation,
  useAdminBlockShopMutation,
  useAdminShopKycDocUrlsQuery,
  // Repair vertical (admin)
  useAdminRepairListQuery,
  useAdminRepairCreateMutation,
  useAdminRepairUpdateMutation,
  useAdminRepairArchiveMutation,
  useAdminRepairDashboardQuery,
  useAdminRepairConfigQuery,
  useAdminUpdateRepairConfigMutation,
  useAdminRepairPendingPricesQuery,
  useAdminDecideRepairPriceMutation,
  useAdminRepairCatalogRequestsQuery,
  useAdminRepairIdentificationsQuery,
  useAdminResolveRepairIdentificationMutation,
  useAdminApproveCatalogRequestMutation,
  useAdminRejectCatalogRequestMutation,
  useAdminRepairBookingsQuery,
  // Repair vertical (customer + worker)
  useLiveCatalogQuery,
  useGetServiceabilityQuery,
  useLazyGetServiceabilityQuery,
  useNotifyLaunchMutation,
  useProviderOnboardingStatusQuery,
  useProviderDomainsQuery,
  useProviderServiceLinesQuery,
  useProviderLineRequirementsQuery,
  useProviderEnrolMutation,
  useProviderSaveEnrolmentMutation,
  useProviderSubmitEnrolmentMutation,
  useProviderRequestServiceLineMutation,
  useAdminOnboardingListQuery,
  useAdminServicesOverviewQuery,
  useAdminOnboardingCreateMutation,
  useAdminOnboardingUpdateMutation,
  useAdminOnboardingArchiveMutation,
  useAdminOnboardingEnrolmentsQuery,
  useAdminDecideEnrolmentMutation,
  useAdminOnboardingLineRequestsQuery,
  useAdminPendingPlansQuery, useAdminReviewPlanMutation, useAdminPlanConfigQuery, useAdminSetPlanConfigMutation,
  useAdminApproveLineRequestMutation,
  useAdminRejectLineRequestMutation,
  useRepairWorkCatalogQuery,
  useSaveRepairCapabilitiesMutation,
  useRequestRepairCatalogAdditionMutation,
  useRepairBrandsQuery,
  useRepairProductTypesQuery,
  useRepairFamiliesQuery,
  useRepairModelsQuery,
  useRepairConfigurationsQuery,
  useRepairProblemsQuery,
  useSubmitModelIdentificationMutation,
  useMyModelIdentificationsQuery,
  useSubmitRepairDiagnosticMutation,
  useRepairPricePreviewQuery,
  useRepairAddOnsQuery,
  useMyAssetsQuery, useMyAssetHistoryQuery, useCreateAssetMutation, useDeleteAssetMutation,
  useHelpingServicesQuery, useHelpingQuoteMutation,
  useCreateHelpingTaskMutation, useMyHelpingTasksQuery, useGetHelpingTaskQuery,
  useRespondHelpingApprovalMutation, useCancelHelpingTaskMutation, useRateHelpingTaskMutation,
  useAvailableHelpingTasksQuery, useAcceptHelpingTaskMutation, useAdvanceHelpingStatusMutation,
  useUpdateHelpingItemMutation, useProposeHelpingAlternativeMutation, useRecordHelpingAdvanceMutation,
  useAddHelpingProofMutation, useRecordHelpingHandoverMutation, useCompleteHelpingTaskMutation, useCollectHelpingCashMutation, useAssignedHelpingTasksQuery,
  useAdminHelpingTasksQuery, useAdminHelpingConfigQuery,
  useAdminUpdateHelpingConfigMutation, useAdminHelpingRefundOutcomeMutation,
  usePetCategoriesQuery, usePetVariantsQuery, usePetBreedsQuery, usePetAddonsQuery,
  useLazyPetCompatibilityQuery,
  useMyPetsQuery, useCreateMyPetMutation, useUpdateMyPetMutation, useDeleteMyPetMutation, useMyPetHistoryQuery,
  usePetQuoteMutation, usePetProviderSearchMutation,
  useCreatePetBookingMutation, useMyPetBookingsQuery, useGetPetBookingQuery,
  useCancelPetBookingMutation, useRatePetBookingMutation,
  useAvailablePetBookingsQuery, useAcceptPetBookingMutation, useDeclinePetBookingMutation, useAdvancePetBookingStatusMutation, useCollectPetCashMutation, useAssignedPetBookingsQuery,
  useAddPetBookingProofMutation, useMyPetRecurringQuery, usePausePetRecurringMutation,
  useResumePetRecurringMutation, useCancelPetRecurringMutation, useAdminPetBookingsQuery, useAdminPetPricingQuery, useAdminUpdatePetPricingMutation,
  useAdminPetCapabilitiesQuery, useAdminUpdatePetCapabilityMutation,
  useRepairProvidersQuery,
  useCreatePriceRequestMutation,
  usePriceRequestQuery,
  useCancelPriceRequestMutation,
  useShopPriceRequestsQuery,
  useOfferPriceMutation,
  useCreateRepairBookingMutation,
  useMyRepairBookingsQuery,
  useGetRepairBookingQuery,
  useTransitionRepairBookingMutation,
  useAssignJobTechnicianMutation,
  useDeclineRepairBookingMutation,
  useClaimRepairBookingMutation,
  usePartnerSettingsQuery,
  useSavePartnerSettingsMutation,
  usePartnerTermsQuery,
  useShopDuesQuery, useClaimShopDuesPaymentMutation, useMyBookingPaymentQuery,
  useAdminShopDuesQuery,
  useAdminRecordShopDuesPaymentMutation,
  useShopAgreementQuery,
  useAcceptShopAgreementMutation,
  useInviteShopTeamMutation,
  useSetShopWorkerTeamMutation,
  usePartnerInsightsQuery,
  useTeamBoardQuery,
  useWorkforceMeQuery,
  useBookShiftMutation,
  useCancelShiftMutation,
  useCheckInShiftMutation,
  useCheckOutShiftMutation,
  useStaffSalaryQuery,
  useStaffLeaveQuery,
  useRequestLeaveMutation,
  useAdminHubsQuery,
  useAdminCreateHubMutation,
  useAdminUpdateHubMutation,
  useAdminStaffQuery,
  useAdminSetStaffMutation,
  useAdminRosterQuery,
  useAdminAssignShiftMutation,
  useAdminRemoveShiftMutation,
  useAdminLeaveQuery,
  useAdminDecideLeaveMutation,
  useAdminPayrollQuery,
  useAdminWorkforceSettingsQuery,
  useAdminPayrollCsvMutation,
  useAdminFleetAttentionQuery,
  useAdminAutoFillRosterMutation,
  useAdminFleetOverviewQuery,
  useAdminFleetActivityQuery,
  useAdminFleetMissedOrdersQuery,
  useAdminFleetInsightsQuery,
  useLazyAdminFleetAiBriefingQuery,
  useAdminFleetAiAskMutation,
  useLazyAdminFleetPlacesQuery,
  useLazyAdminFleetAreaQuery,
  useAdminFleetFinanceQuery,
  useAdminFleetExpensesQuery,
  useAdminAddFleetExpenseMutation,
  useAdminRemoveFleetExpenseMutation,
  useAdminFleetCashDepositMutation,
  useAdminFleetStockQuery,
  useAdminAddStockItemMutation,
  useAdminStockActionMutation,
  useAdminSaveWorkforceSettingsMutation,
  useCurrentSeasonQuery,
  useAdminSeasonsQuery,
  useAdminCreateSeasonMutation,
  useAdminUpdateSeasonMutation,
  useAdminDeleteSeasonMutation,
  useAutoAcceptQuery,
  useSaveAutoAcceptMutation,
  useCollectRepairCashMutation,
  useCancelRepairBookingMutation,
  useSubmitRepairQuoteMutation,
  useRespondRepairQuoteMutation,
  useRepairQaChecklistQuery,
  useSubmitRepairQaMutation,
  useSubmitRepairCatalogRequestMutation,
  // Repair provider self-service
  useRepairOnboardingStatusQuery,
  useRepairProviderJobsQuery,
  useRepairServiceAreasQuery,
  useUpsertRepairServiceAreaMutation,
  useRepairProviderPricingQuery,
  useBulkRepairProviderPricingMutation,
  useLazyRepairProviderSuggestedPricingQuery,
  useRepairProviderSuggestedPricingQuery,
  useAdminCoverageGapsQuery,
  useSetShopWarrantyMutation,
  useRepairWarrantyQuery,
  useClaimRepairWarrantyMutation,
  useAdminDecideWarrantyClaimMutation,
  useAdminWarrantyClaimsQuery,
  useRepairHandoverCodeQuery,
  useAttachRepairCompletionPhotosMutation,
  useRateRepairBookingMutation,
  useVerifyRepairHandoverCodeMutation,
  useRespondShopHandoffMutation,
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
  useAdminForceCancelOrderMutation,
  useAdminBookingsQuery,
  useAdminJobCandidatesQuery,
  useAdminAssignJobMutation,
  useAdminJobNotesQuery,
  useAdminAddJobNoteMutation,
  useAdminBookingDetailQuery,
  useAdminCancelPetBookingMutation,
  useAdminCancelHelpingTaskMutation,
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
  useGetTrainingModulesQuery,
  useGetTrainingModuleQuery,
  useSubmitTrainingQuizMutation,
  useGetJobEarningsQuery,
  useGetZoneBenchmarkQuery,
  useGetWorkerGoalsQuery,
  useSetWorkerGoalMutation,
  useRequestPayoutMutation,
  // Catalog & Models Dynamic Engine
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
