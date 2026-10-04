# Customer app — source layout

```
app/            App shell and routes (App.jsx). main.jsx mounts it.
features/       One folder per thing a customer does. A feature owns its
                pages, the components only it uses, and its hooks.
  auth/           sign in
  home/           home screen and its sections
  catalog/        all services, search, ZappyLens, area coverage
  providers/      shop and technician profiles, nearby shops
  repair/ pet/ helping/ events/   booking flows per service line
  bookings/       my bookings, scheduled, track list (useMyJobs)
  tracking/       live job tracking: JobTrackingPage, cards/, redesign/
  account/        profile, security, notification settings, payments
  wallet/         wallet, spending, rewards, referrals, offers, plans
  support/        help, disputes, FAQ, policies, chat
  notifications/  inbox, permission banner, push (useFCM)
components/     UI used by several features: common/, layout/, pwa/, marketing/
hooks/ lib/ utils/   app-wide helpers with no feature of their own
```

Rules
- A file used by one feature lives in that feature. Move it to `components/`
  or `hooks/` only when a second feature needs it.
- Anything shared with the other portals belongs in `shared/` (`@shared/...`),
  not here. Images belong in the repo-root `assets/`.
- Pages are lazy-loaded from `app/App.jsx`; add new routes there.
