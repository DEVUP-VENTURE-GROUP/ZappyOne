# Apps v1: exactly the websites, nothing new

Version 1 of each app is a copy of its website as it is today: the same
screens, flows, rules and server calls. No new features. Every server call
is already shared (`@zappy/core/api`, generated from the websites' list), so
porting a screen means rebuilding its layout for the phone, not its logic.

Order: Rakshak → ServicePro (shop screens on top of the same worker screens)
→ Customer. Tick a row when it works on a phone against the live API.

Legend: ☐ to do · ◐ in progress · ☑ done

## Rakshak: individual workers (web: rakshak.zappyone.com)

| Screen | Web route | Source | Status |
|---|---|---|---|
| Sign in (phone + OTP) | `/worker/login` | WorkerLoginPage | ☑ |
| Home / dashboard (online, today, offers) | `/worker` | WorkerDashboard | ☐ |
| Work board (all jobs: repair, pet, helping) | `/worker/work` | WorkBoardPage | ☐ |
| Repair job | `/worker/repair/:id` | WorkerRepairJobPage | ☐ |
| Pet job | `/worker/pet/:id` | WorkerPetJobPage | ☐ |
| Helping job | `/worker/helping/:id` | WorkerHelpingJobPage | ☐ |
| Join / onboarding (pick work, KYC per service) | `/provider/onboarding` | ProviderOnboardingPage | ☐ |
| My services and prices | `/provider/services` | ProviderRepairSetupPage | ☐ |
| My documents | `/provider/documents` | MyDocumentsPage | ☐ |
| Earnings | `/worker/earnings` | WorkerEarningsPage | ☐ |
| Withdraw | `/worker/withdraw` | WorkerWithdrawPage | ☐ |
| Bank and UPI | `/worker/bank` | WorkerBankPage | ☐ |
| Work hours | `/worker/hours` | WorkerHoursPage | ☐ |
| Goals | `/worker/goals` | WorkerGoalsPage | ☐ |
| Training | `/worker/training` | WorkerTrainingPage | ☐ |
| Reviews | `/worker/reviews` | ProviderReviewsPage | ☐ |
| Appeals | `/worker/appeals` | WorkerAppealsPage | ☐ |
| Notifications | `/worker/notifications` | WorkerNotificationsPage | ☐ |
| Profile | `/worker/profile` | WorkerEditProfilePage | ☐ |

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
