# ZappyOne mobile: Android, iOS and web

For: everyone working on the apps. Read §1 and §2 first. Android developers then read §3, iOS developers read §4.

## 1. One codebase, three outputs

The customer app and ServicePro are each **one** React Native app on **Expo SDK 58** (React Native 0.88). Rakshak stays on Expo SDK 56 (React Native 0.85). See `README.md` → *Two Expo SDK generations* for how the two live under `mobile/`.

- The same TypeScript code ships to Android and to iOS.
- The website is a separate React app (`client/`, `servicepro/`). It shares logic with the apps through `shared/` and the sync tool.

```
hyperlocal-platform/
├── client/                         Customer website (Vite + React)
├── servicepro/                     ServicePro website
├── admin/                          Admin console (web only)
├── shared/src/                     Web code + the ONE copy of shared logic
│   ├── services/endpoints.js       Every API endpoint (web and app)
│   ├── services/api.js             Hooks exported to the web
│   └── config/, customer/, provider/   Logic synced into the apps
├── server/                         Node API
└── mobile/
    ├── apps/
    │   ├── customer/               Customer app
    │   │   ├── app/                Screens as routes (expo-router)
    │   │   ├── src/                The app's own features
    │   │   ├── app.config.ts       ★ Native settings for BOTH platforms
    │   │   ├── eas.json            Build profiles (dev, simulator, preview, production)
    │   │   ├── package-lock.json   Its own SDK 58 install (node_modules beside it)
    │   │   ├── shared              Link to ../../packages (TypeScript reads the shared code through it)
    │   │   ├── android/            GENERATED, not in git (see §2)
    │   │   └── ios/                GENERATED, not in git (see §2)
    │   ├── servicepro/             ServicePro app (same layout)
    │   │   └── modules/            ★ Our own native code (committed)
    │   │       ├── zappy-bubble/       android/: floating job bubble (Android only)
    │   │       └── zappy-shortcuts/    android/: app-icon shortcuts (Android only)
    │   └── rakshak/                On hold: do not touch (SDK 56, installed by mobile/package.json)
    ├── packages/
    │   ├── core/                   API hooks (generated), store, shared logic (synced)
    │   ├── ui/                     Shared screens and components for both apps
    │   └── native/                 ★ Shared native module (android/ today), file:../../packages/native in both apps
    ├── package.json                SDK 56 workspace: apps/rakshak, packages/core, packages/ui
    └── tools/                      sync-api-hooks.js (shared/ → packages/core), sync-bundled-art.js, tests/
```

## 2. Why `android/` and `ios/` are not in git

We use Expo's **Continuous Native Generation**:
- `app.config.ts` plus the config plugins are the source of truth for every native setting: bundle IDs, permissions, background modes, notification sounds, Google Maps key.
- The `android/` and `ios/` projects are generated from them.
- EAS generates them fresh on every cloud build, so Android and iOS can never drift apart, and an SDK upgrade is a one-line change.

**The rules:**
1. Change native settings in `app.config.ts`, never by hand in a generated folder. A hand edit is lost the next time the folders are generated.
2. Your own native code (Kotlin, Java, Swift, Objective-C) goes in an **Expo module**:
   - `mobile/apps/<app>/modules/<name>/android/` for Android;
   - `mobile/apps/<app>/modules/<name>/ios/` for iOS;
   - `mobile/packages/native/` for code shared by both apps.

   These folders **are** committed.
3. Never commit `apps/*/android/` or `apps/*/ios/`. `.gitignore` blocks them.

**To look at or debug the native project locally:**

| Command, run inside `mobile/apps/<app>` | What it does | Where it works |
|---|---|---|
| `npm run native:android` | Generates `android/`. Open it in Android Studio | Windows, macOS, Linux |
| `npm run native:ios` | Generates `ios/` and runs `pod install`. Open `ios/*.xcworkspace` in Xcode | **macOS only.** Expo refuses on Windows |
| `npm run native:clean` | Deletes both and regenerates from `app.config.ts` | Use after changing plugins or permissions |

On SDK 58, `expo prebuild` regenerates `ios/` from scratch even without `--clean`: `Pods/`, `Podfile.lock` and the `.xcworkspace` are removed. Keep a copy of `ios/Podfile.lock` if you need the same pods, put it back, then run `pod install`.
| `npm run android` / `npm run ios` | Builds and runs on a device or emulator | `ios` needs macOS + Xcode |

## 3. Android developer

**Setup:**
- Android Studio (latest)
- JDK 17 (`JAVA_HOME` pointing at it; newer JDKs are not used by this Gradle setup)
- Android SDK: compile SDK 37 and build-tools 37.0.0 for the SDK 58 apps (Gradle installs them on the first build once the licences are accepted)
- An emulator, or a phone with USB debugging

**Run it:**
```
cd mobile/apps/servicepro && npm ci   # SDK 58 apps install on their own (Rakshak: cd mobile && npm ci)
npm run native:android     # optional: view the native project
npm run android            # build, install, start Metro on :8082
```

**Builds and release (from inside each app folder):**

| Goal | Command |
|---|---|
| Development build (APK) | `npx eas-cli build --profile development --platform android` |
| Store build (AAB) | `npx eas-cli build --profile production --platform android`, then `eas submit` |

EAS holds the signing keystore. Never generate your own or commit one.

**JavaScript-only fixes go over the air.** The command is `EAS_SKIP_AUTO_FINGERPRINT=1 npx eas-cli update --channel production --environment production --platform android --non-interactive`. Before any update, check that the change adds no native module. An update that needs a native part the installed build lacks crashes the app (this happened on 19 Oct). Runtimes in use (the runtime follows the app version):
- customer and ServicePro: 1.1.0, the SDK 58 builds. Store builds on 1.0.x (SDK 56) never receive a 1.1.0 update, and 1.1.0 builds never take a 1.0.x one.
- Rakshak: 1.0.1 (SDK 56).

**Android-only native code today:**
- the ServicePro bubble (`SYSTEM_ALERT_WINDOW`);
- shortcuts;
- the foreground location service.

## 4. iOS developer

### 4.1 What you need
- **A Mac with Xcode 16+**, and CocoaPods (`sudo gem install cocoapods`). You cannot generate or build the iOS project on Windows. The SDK 58 apps target iOS 16.4 and were last built in Release with Xcode 27.2.
- **The ZappyOne Apple Developer team** ($99/yr, owned by the company). Ask the owner to add you.
- **Bundle IDs:**
  - customer: `com.zappyone.app`
  - ServicePro: `com.zappyone.servicepro`

### 4.2 Run it
```
cd mobile/apps/servicepro && npm ci
npm run native:ios         # generates ios/ and installs pods
npm run ios                # simulator build + Metro on :8082
```

**No Mac at hand?** A cloud simulator build needs no Apple account: `npx eas-cli build --profile development-simulator --platform ios`. Drag the `.app` it produces onto a Mac's simulator.

**On a real iPhone:**
1. `npx eas-cli build --profile development --platform ios` (needs the Apple team; EAS registers your device).
2. `eas build --profile production --platform ios` for TestFlight and the App Store.

### 4.3 What is already set for iOS (`app.config.ts`)
- **Bundle IDs and iPhone only.** `supportsTablet: false`.
- **Permission texts:**
  - location while using;
  - location always (ServicePro only, for pros who are online);
  - camera and photos.
- **`UIBackgroundModes: ['location']`** for ServicePro, so a pro's position stays live with the screen off.
- **Notification sound** `zappy_ring.wav`, under 30 s, which iOS accepts.
- **`ITSAppUsesNonExemptEncryption: false`**, so no export questions on each upload.
- **Maps** use Apple Maps on iOS by default; the Google key is Android only.

### 4.4 What is NOT done yet, in priority order

**1. Push notifications: code done, the APNs key needed on the server.**
- iPhones send their raw APNs token; the server keeps it as is and sends straight to Apple over HTTP/2 (`server/src/modules/notification/apns.js`). Android keeps Firebase. No Firebase iOS app and no deprecated Firebase token swap.
- *Needs, once:* in the Apple Developer account, create an **APNs Auth Key (.p8)**, then set on the server `APNS_KEY_ID`, `APNS_TEAM_ID` and `APNS_KEY` (the .p8 contents) or `APNS_KEY_PATH`.
- Development builds use Apple's sandbox, TestFlight and App Store builds production: the server tries production first and falls back to sandbox by itself.
- Taps open the right screen: routing data rides in the payload's `body` key, where expo-notifications reads it on iOS.
- Signing out removes the phone's token from that account; a phone that signs in to another account leaves the first one.
- Job offers play `zappy_ring.wav` and are time-sensitive (ServicePro has the `com.apple.developer.usernotifications.time-sensitive` entitlement), so they come through Focus. The ring-through-silent-mode and lock-screen card are Android-only.

**2. App Store setup.**
- *The problem:* `eas.json` submit settings are Android only.
- *Fix:* add `submit.production.ios` (`appleId`, `ascAppId`, `appleTeamId`) once the apps exist in App Store Connect.

**3. Live Activity for the job in progress (replaces the Android bubble).** iOS does not allow drawing over other apps. The iOS equivalent is a Live Activity on the lock screen and Dynamic Island, showing the customer, ETA and current step.
- *Where to build it:* an Expo module at `apps/servicepro/modules/zappy-live-activity/ios/`, with a widget extension added through a config plugin.
- *Add it after push works.*

**4. App-icon shortcuts (replaces Android `zappy-shortcuts`).** iOS Quick Actions (`UIApplicationShortcutItems`). Add them as `modules/zappy-shortcuts/ios/`, or through a config plugin. The JS side (`modules/zappy-shortcuts/index.ts`) already falls back to doing nothing when the native part is missing.

**5. App Review notes for "location always".** Apple asks why it is needed. Answer: pros receive nearby jobs and customers see the pro arrive while the pro is online. It stops when they go offline, and the in-app explanation shows before the system prompt (`src/captain/backgroundLocation.ts`).

### 4.5 iOS testing rules
- **Expo Go and the simulator never receive push.** Test push on a development or TestFlight build on a real iPhone.
- **Test background location on a real device:** start a job, lock the screen, and watch the customer's map.
- **Any JS that calls our native modules** must keep the `requireOptionalNativeModule` pattern, so a missing iOS part is a safe no-op, never a crash.

## 5. Web
- The web apps are not part of `mobile/`.
- Logic both sides need lives once in `shared/src/` and is copied into the apps by `cd mobile && npm run sync:api`.
- Never edit `packages/core/api/*` or the synced files in `packages/core/shared/` by hand.
- A customer or ServicePro change ships to the website **and** both phone platforms in the same PR.

## 6. Who owns what

| Area | Android developer | iOS developer | Both |
|---|---|---|---|
| `app.config.ts` `android: {...}` and Android plugins | ✔ | | |
| `app.config.ts` `ios: {...}`, iOS plugins, Info.plist texts | | ✔ | |
| `modules/*/android/`, `packages/native/android/` | ✔ | | |
| `modules/*/ios/`, `packages/native/ios/` | | ✔ | |
| Screens, components and logic (`app/`, `src/`, `packages/ui`, `packages/core`) | | | ✔ (one change, both platforms) |
| `eas.json` build/submit | Android sections | iOS sections | |

Before review, type-check every app you touched: `npx tsc --noEmit -p .` inside each app. Then run the gate from the repo root (`node tools/checkpoint-gate/run.js --base origin/main`); it must say PASS.
