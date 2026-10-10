# ZappyOne mobile apps

Three apps, one codebase. They talk to the same API as the websites.

| App | Who uses it | Store ID | Signs in |
|---|---|---|---|
| **ZappyOne** (`apps/customer`) | Customers | `com.zappyone.app` | Customers |
| **ZappyOne ServicePro** (`apps/servicepro`) | Shops and their technicians | `com.zappyone.servicepro` | Shop owners, shop technicians |
| **ZappyOne Rakshak** (`apps/rakshak`) | Individual workers, students doing errands | `com.zappyone.rakshak` | Individual workers |

The server keeps each account in its own app. A shop technician signing in to Rakshak is told to use ServicePro. Each app sends `X-App: customer | servicepro | rakshak` on every request.

## How the code is organised

```
mobile/
├── package.json            workspace root: installs everything once
├── tsconfig.base.json      TypeScript settings every app extends
├── apps/
│   ├── customer/           ZappyOne
│   ├── servicepro/         ZappyOne ServicePro
│   └── rakshak/            ZappyOne Rakshak
│       ├── app/            screens (Expo Router: a file is a screen)
│       │   ├── _layout.tsx     AppRoot: session, guard, push, fonts
│       │   ├── (auth)/         sign-in: login.tsx, otp.tsx
│       │   └── (main)/         signed-in tabs
│       ├── routes.ts       notification link → screen
│       ├── app.config.ts   name, store ID, permissions, native plugins
│       ├── eas.json        build profiles (development, preview, production)
│       └── assets/images   icon and splash
└── packages/
    ├── core/   @zappy/core: logic, no UI
    │   ├── api/        the websites' 542 server calls (generated from shared/), on the apps' secure connection
    │   ├── config/     environment: API address, which app this is
    │   ├── hooks/      useSocket, useLocationTracker, usePushNotifications, useSignOut
    │   ├── lib/        logger, session events, push helpers
    │   ├── socket/     live updates (job.status, job.offer, worker.location…)
    │   ├── store/      Redux store: session, location draft
    │   └── types/      API data shapes
    └── ui/     @zappy/ui: everything people see
        ├── theme/      colours, Figtree type, spacing (same tokens as the website)
        ├── components/ Button, Card, Text, Input, BottomSheet, Skeleton…
        ├── auth/       PhoneLoginScreen, OtpScreen (used by all three apps)
        ├── app/        AppRoot (shared root layout), starter screens
        ├── maps/       live tracking map
        └── location/   pin picker map
```

### Where new code goes

| You are adding… | Put it in |
|---|---|
| A call to the server | `shared/src/services/endpoints.js` (the websites' list, shared by every app), its hook in `shared/src/services/api.js`, then `npm run sync:api` here. Screens import hooks from `@zappy/core/api` by the web's names. Never edit `endpoints.generated.js` or `hooks.ts`. |
| A data shape the server returns | `packages/core/types/api.ts`, with the server's own field names |
| Logic two apps need (a hook, a helper) | `packages/core/hooks` or `packages/core/lib` |
| A visual building block | `packages/ui/components` |
| A screen used by more than one app | `packages/ui/<area>/`, plus a 5-line wrapper in each app's `app/` |
| A screen only one app has | that app's `app/` folder |
| A new colour or size | `packages/ui/theme`, and the same value in `shared/tailwind.preset.js` for the web |

The rules that keep this strong:
1. `packages/core` never imports from `packages/ui` or from an app. `packages/ui` never imports from an app.
2. Screens never call `fetch` or `axios` directly. Every request is a hook from `@zappy/core/api`, the same call the website makes.
3. No made-up data on screens. If the server doesn't send something yet, the screen doesn't show it.
4. Money is in paise from the server and shown in rupees. Prices are never calculated on the phone.
5. One copy of anything shared. If you're copying a file between apps, it belongs in `packages/`.

## One-time setup (your computer)

1. **Node.js 22 LTS** from nodejs.org. React Native 0.85 doesn't support Node 23; check with `node -v`.
2. **Android Studio** (developer.android.com/studio). During install, include the Android SDK and an emulator; then create a Pixel emulator from Device Manager.
3. **Git** (you have it).
4. **An Expo account** at expo.dev, joined to the `devup-ventures-01` organisation.
5. **EAS CLI**: `npm install -g eas-cli`, then `eas login`.
6. For iPhone builds you need the Apple Developer account below. Building iOS locally needs a Mac; EAS builds iOS in the cloud, so a Windows PC is fine.

## Store accounts (start these now; approval takes days)

1. **D-U-N-S number** for DEVUP Ventures (free, about a week). Both stores need it for an organisation account.
2. **Google Play Console**, organisation account, $25 once. An organisation account skips the 12-tester, 14-day test that new personal accounts must run.
3. **Apple Developer Program**, organisation account, $99 a year.
4. **Google Maps API keys**: one Android key restricted to the three package names, one iOS key. Put them in EAS, not in code: `eas env:create --name GOOGLE_MAPS_ANDROID_KEY --value <key> --environment production`.
5. **Firebase project** for push: add the three Android apps and three iOS apps, then upload the files with `eas credentials`.

## Running an app on your phone or emulator

```bash
cd mobile
npm install                 # once, and after pulling new dependencies

# each app reads its own .env.local (copy .env.example the first time)
cp apps/customer/.env.example apps/customer/.env.local
```

In `.env.local`:
- leave `EXPO_PUBLIC_API_URL` unset to use your own API on port 4000 (the app finds your computer on the Wi-Fi)
- or set `EXPO_PUBLIC_API_URL=https://api.zappyone.com` to use the live API

These apps use native modules (maps, secure storage, notifications), so they run in a **development build**, not Expo Go. Make one per app, once, and again whenever native packages change:

```bash
cd apps/customer
eas init                    # first time only for servicepro and rakshak: links the app to Expo
npm run build:dev -- --platform android   # builds an installable .apk in the cloud (~15 min)
```

Install the `.apk` from the link EAS gives you. Then, every day:

```bash
npm run customer            # or: npm run servicepro / npm run rakshak (from mobile/)
```

Scan the QR code with the development build, or press `a` for the Android emulator. Code changes appear instantly.

Before pushing:

```bash
npm run typecheck           # from mobile/: all three apps must show 0 errors
```

## Building for the stores

| Profile | What it's for | Command (inside an app folder) |
|---|---|---|
| `development` | Your phone while coding | `npm run build:dev` |
| `preview` | Team testing on real phones (installable link) | `npm run build:preview` |
| `production` | Play Store and App Store | `npm run build:prod`, then `npm run submit` |

- Production builds use `https://api.zappyone.com` and bump the version number on their own.
- `submit` sends Android to the Play **internal testing** track first. Promote it to production in Play Console once tested.
- **Quick fixes without a store review:** for a JavaScript-only change (copy, a screen bug), run `npm run update -- --channel production`, and phones pick it up on next launch. Anything that adds a native package needs a new build.

## Store checklist (each app)

- [ ] Icon 1024×1024 and splash in `assets/images` (the current ones are placeholders from the old app)
- [ ] Privacy policy URL and support email
- [ ] In-app account deletion (Apple requires it)
- [ ] Play data-safety form and Apple privacy labels: location, phone number, photos
- [ ] Screenshots: phone 6.7" and 6.5" for iOS, phone for Play
- [ ] ServicePro and Rakshak: background-location declaration and demo video for Play, written reason for Apple (needed once live trip tracking runs in the background)

## What's built and what's next

**Built (this foundation):** sign-in for all three apps, with the right account per app; secure session storage and automatic token refresh; sign-out; the live socket connection; push registration; the location picker and tracking map; the design system on the web's tokens; starter Home and Account tabs.

**Next, in order:**
1. **Rakshak and ServicePro:** go online/offline, job offers that ring even when the phone is locked, the job screen (OTP start, map, payment breakdown), background location during a trip, earnings.
2. **Customer:** home from the live catalog, booking flows (repair, pet, helping, events), tracking, payments, bookings, profile.
3. **All three:** crash reporting, Telugu and Hindi, a forced-update check.
