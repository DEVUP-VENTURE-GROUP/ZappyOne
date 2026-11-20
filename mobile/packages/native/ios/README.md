# ZappyNative for iOS

ZappyOne's own iPhone code. It sits next to the Android module in `../android`, and both are reached from JavaScript through `../index.ts`. Screens never branch on the platform: a call the iPhone does not support returns "not here".

## What is here

One folder per feature, so each piece of iPhone code has an obvious home:

```
ios/
  ZappyNative.podspec          builds every .swift file below into the app
  Module/
    ZappyNativeModule.swift    the Expo module JavaScript calls (one entry point)
  LiveActivity/
    JobActivityAttributes.swift   the Live Activity's shape, shared with the widget
```

New features get their own folder (for example `Upload/` for background photo upload, `Notifications/` for offer actions), and the module in `Module/` calls into them.

The Lock Screen and Dynamic Island design lives in the customer app at `apps/customer/targets/job-activity/` (SwiftUI, added at build time by `@bacons/apple-targets`).

## How a Live Activity flows

1. The customer opens a job's tracking screen. `useJobLiveActivity` (customer app) calls `liveActivity.start` with the starting state the server sent in the job options (`liveActivity`).
2. iOS gives the activity a push token. The module sends it to JavaScript (`onLiveActivityToken`), and the app posts it to `POST /api/jobs/:id/live-activity`.
3. Every status change on the server (`jobs/job-events` announce) calls `notification/live-activity.onStatus`, which pushes the new state through APNs with the `liveactivity` push type. A finished or cancelled job ends the card.

## Rules for changing it

- The state's fields exist in three places: `LiveActivity/JobActivityAttributes.swift` here, the copy in `apps/customer/targets/job-activity/`, and the server's `stateFor`. `mobile/tools/tests/liveActivityShape.test.mjs` fails if they differ. Run it with `node --test tools/tests/liveActivityShape.test.mjs` from `mobile/`.
- Use SF Symbols and ZappyOne colours in the widget. No emoji and no illustrations.
- Update by status changes, not by every GPS point: Apple limits how often a Live Activity may be pushed.

## To build it

- Set `APPLE_TEAM_ID` in the EAS environment. Without it the extension target is left out and the rest of the app builds as before.
- Set the APNs key on the server: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY`.
- Live Activities need iOS 16.2 or later. The Dynamic Island shows on iPhone 14 Pro and later; other iPhones show the Lock Screen card.
- This is native code: it ships only with a store build (1.1.0), never over the air.

## Not built yet

- Accept and Decline buttons on job offer notifications (ServicePro).
- The pro's active-job Live Activity.
- Background photo upload (`enqueueUpload` returns false on iPhone).
- Home Screen widgets, Siri and Shortcuts, pictures in notifications.
