# Apps v1: exactly the websites, nothing new

Version 1 of each app is a copy of its website as it is today: the same
screens, flows, rules and server calls. No new features. Every server call
is already shared (`@zappy/core/api`, generated from the websites' list), so
porting a screen means rebuilding its layout for the phone, not its logic.

Order: Rakshak → ServicePro (shop screens on top of the same worker screens)
→ Customer. Tick a row when it works on a phone against the live API.

Legend: ☐ to do · ◐ in progress · ▣ built, to check on a phone · ☑ done (works on a phone against the live API)

## Rakshak: individual workers (web: rakshak.zappyone.com)

Mapped from the web code (each screen and every file it imports). A row is
done only when every call and live event listed works in the app.
All 119 calls these screens use already exist in `@zappy/core/api`.

### Always on (the web app's frame, every screen)

| Piece | Web source | Server calls | Live events | Status |
|---|---|---|---|---|
| Job-offer popup: new work rings on any screen, accept or pass with a reason | JobOfferHost, JobOfferAlert, PassReasonPicker | acceptHelpingTask, acceptPetBooking, assignedPetBookings, declinePetBooking, declineRepairBooking, getWorkerMe, repairProviderJobs, transitionRepairBooking | job.offer, job.available, repair.offer, repair.offer_closed | ◐ built; ring sound needs the next dev build (expo-audio), vibration works now |
| Location shared while online | OnlineLocation, useLocationBroadcast | getWorkerMe | worker:location (sent), worker.presence | ▣ |
| Live job updates (lists refresh, tip toast) | useJobRealtime | (refreshes lists) | job.status, job.update, job.available, repair.quote, repair.quote_decision | ▣ |
| Account setup gate (name, photo, password, what's new) | AccountSetupGate | accountMe, completeAccountSetup, setAccountName, setAccountPassword, setAccountPhoto, skipAccountPhoto, startEmailVerification, markReleaseSeen, presignUpload, logout | | ☐ |
| Connection banner, error boundary | ConnectionBanner, ErrorBoundary | | | ◐ banner done; error screen to add |

### Screens

| Screen | Web route | Calls | Live events | Status |
|---|---|---|---|---|
| Sign in: OTP **and Worker ID + password, forgot password** | `/login` | requestOtp, resendOtp, loginWorker, loginWorkerPassword, forgotWorkerPassword | | ◐ OTP done; password sign-in to add |
| Home / dashboard | `/worker` | 20: getWorkerMe, goOnline, goOffline, getEarnings, workerDues, claimDuesPayment, workerHotZones, getKycStatus, providerOnboardingStatus, workerCompleteOnboarding, accountMe, listNotifications, repairProviderJobs, assigned/available pet + helping, accept pet + helping, logout | notification, kyc.rejected, session:replaced | ▣ |
| Work board | `/worker/work` | 11: repairProviderJobs, assigned/available pet + helping, accept pet + helping, workerDues, claimDuesPayment, workerHotZones, getWorkerMe | | ▣ |
| Repair job | `/worker/repair/:id` | 21: getRepairBooking, transitionRepairBooking, verifyRepairHandoverCode, submitRepairQuote, repairWorkCatalog, repairQaChecklist, submitRepairQa, attachRepairCompletionPhotos, collectRepairCash, declineRepairBooking, giveBackJob, jobGiveBack, reportCustomerAbsent, jobEarnings, rateCustomer, jobChat, sendJobChat, presignUpload, triggerSOS, assignJobTechnician, shopWorkers | chat.message, eta.update, worker.location, room join | ☐ |
| Pet job | `/worker/pet/:id` | 17: getPetBooking, acceptPetBooking, advancePetBookingStatus, addPetBookingProof, collectPetCash, declinePetBooking, giveBack, jobGiveBack, reportCustomerAbsent, jobEarnings, rateCustomer, jobChat, sendJobChat, presignUpload, triggerSOS, assignJobTechnician, shopWorkers | chat.message, eta.update, worker.location, room join | ☐ |
| Helping job | `/worker/helping/:id` | 18: getHelpingTask, advanceHelpingStatus, addHelpingProof, updateHelpingItem, proposeHelpingAlternative, recordHelpingAdvance, recordHelpingHandover, completeHelpingTask, collectHelpingCash, giveBack, jobGiveBack, reportCustomerAbsent, jobEarnings, rateCustomer, jobChat, sendJobChat, presignUpload, triggerSOS | chat.message, eta.update, worker.location, room join | ☐ |
| Join / onboarding | `/provider/onboarding` | 13: providerDomains, providerServiceLines, providerEnrol, providerLineRequirements, providerSaveEnrolment, providerSubmitEnrolment, providerRequestServiceLine, providerOnboardingStatus, providerIdCheck, startAadhaarCheck, submitAadhaarOtp, verifyPanCheck, presignUpload | | ☐ |
| My services and prices | `/provider/services` | 18: liveCatalog, repairBrands, repairModels, repairWorkCatalog, repairProviderPricing, repairProviderSuggestedPricing (+lazy), bulkRepairProviderPricing, saveRepairCapabilities, repairServiceAreas, upsertRepairServiceArea, getAddresses, saveRecentLocation, getNearbyWorkers (lazy), requestRepairCatalogAddition, providerOnboardingStatus, setShopWarranty, updateShopMe | map | ☐ |
| My documents | `/provider/documents` | 5: providerMyDocuments, providerIdCheck, startAadhaarCheck, submitAadhaarOtp, verifyPanCheck | | ☐ |
| Earnings | `/worker/earnings` | getJobEarnings | | ▣ |
| Withdraw | `/worker/withdraw` | 7: getWallet, getWorkerBankAccounts, workerDues, claimDuesPayment, requestPayout, requestOtp, verifyActionOtp | | ☐ |
| Bank and UPI | `/worker/bank` | 6: getWorkerBankAccounts, addWorkerBankAccount, deleteWorkerBankAccount, setDefaultWorkerBankAccount, requestOtp, verifyActionOtp | | ☐ |
| Work hours | `/worker/hours` | workerHours, saveWorkerHours | | ☐ |
| Goals | `/worker/goals` | getWorkerGoals, setWorkerGoal, getZoneBenchmark | | ☐ |
| Training | `/worker/training` | getTrainingModules, getTrainingModule, submitTrainingQuiz | | ☐ |
| Reviews | `/worker/reviews` | myReviews, reportReview | | ☐ |
| Appeals | `/worker/appeals` | getWorkerAppeals, createWorkerAppeal | | ☐ |
| Notifications | `/worker/notifications` | listNotifications, markNotificationRead, markAllNotificationsRead | notification | ▣ |
| Profile | `/worker/profile` | 9: accountMe, getWorkerMe, updateWorkerProfile, setWorkerCredentials, setAccountPassword, setAccountPhoto, startEmailVerification, presignUpload, providerOnboardingStatus | | ◐ interim account tab; full profile next |

Web logic these screens share (port as logic, not copied UI): `utils/money.js`,
`utils/distance.js`, `provider/useProviderJobs.js`, `modules/worker/workerSlice.js`,
`hooks/useGeolocation.js` + `utils/geoCache.js` (location rules: GPS lock ≤30 m,
reject rough fixes), `utils/alertSound.js` (offer ring).

## ServicePro: shops and their technicians (web: servicepro.zappyone.com)

Technicians see the Rakshak screens above (same code, shop rules).

| Screen | Web route | Source | Status |
|---|---|---|---|
| Sign in (owner or technician) | `/worker/login` | WorkerLoginPage | ☑ |
| Shop home | `/shop` | ShopDashboard | ☐ |
| Shop profile | `/shop/profile` | ShopProfile | ☐ |
| Shop KYC | `/shop/kyc` | ShopKyc | ☐ |
| Technicians | `/shop/workers` | ShopWorkers | ☐ |
| Shop earnings | `/shop/earnings` | ShopEarnings | ☐ |
| Price requests | `/shop/price-requests` | ShopPriceRequests | ☐ |
| Appeals | `/shop/appeals` | ShopAppeals | ☐ |
| Account | `/shop/account` | ShopAccountPage | ☐ |
| Notifications | `/shop/notifications` | ShopNotifications | ☐ |
| Bank and UPI | `/shop/bank` | ShopBank | ☐ |
| Withdraw | `/shop/withdraw` | ShopWithdrawPage | ☐ |
| Reviews | `/shop/reviews` | ProviderReviewsPage | ☐ |
| Onboarding, services, documents, jobs | as Rakshak | shared provider pages | ☐ |

## ZappyOne: customers (web: zappyone.com)

| Area | Web routes | Status |
|---|---|---|
| Sign in | `/login` | ☑ |
| Home, all services, search, ZappyLens | `/`, `/home`, `/services`, `/services/:category`, `/service/:code` | ☐ |
| Repair: phone, laptop, 2-wheeler, 4-wheeler, water tank | `/repair`, `/repair/*`, `/repair/category/:vertical/:categoryCode` | ☐ |
| Repair booking, tracking, price requests | `/repair/bookings/:id`, `/repair/price-requests/:id` | ☐ |
| Pet care: my pets, booking, bookings, recurring | `/pet`, `/pet/my-pets`, `/pet/my-pets/:id`, `/pet/book/:categoryCode`, `/pet/bookings`, `/pet/bookings/:id`, `/pet/recurring` | ☐ |
| Helping: shopping, returns, task | `/helping`, `/helping/shopping`, `/helping/returns`, `/helping/tasks/:id` | ☐ |
| Events: browse, theme, book, bookings, saved | `/events`, `/events/browse`, `/events/themes/:id`, `/events/book/:id`, `/events/bookings`, `/events/bookings/:id`, `/events/saved` | ☐ |
| Bookings and tracking | `/orders`, `/orders/:id`, `/orders/:id/chat`, `/track`, `/scheduled` | ☐ |
| My things, nearby shops | `/my-assets`, `/nearby-shops`, `/shops/:id`, `/worker-profile/:workerId` | ☐ |
| Profile, addresses, payments, wallet | `/profile`, `/payments`, `/wallet`, `/spending` | ☐ |
| Offers, rewards, referral, plans | `/promos`, `/rewards`, `/referral`, `/plans` | ☐ |
| Notifications and settings | `/notifications`, `/notification-prefs`, `/account-security` | ☐ |
| Help | `/support`, `/disputes`, `/faq`, `/policy/:slug` | ☐ |

Not in the apps: the admin console and the events-partner portal stay web-only
in v1. Email-link pages (`/verify-email`, `/reset-password`) open the website.

## Store basics each app needs for v1 (not features)

- ☐ Icon and splash
- ☐ Account deletion inside the app (Apple requires it)
- ☐ Privacy policy and support links
- ☐ Forced-update check (old versions told to update)
