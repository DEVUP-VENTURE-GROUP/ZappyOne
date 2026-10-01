# assets — every image, for every app

All images live here, once. The five web apps (customer, admin, ServicePro,
Rakshak, events) all use this folder; no app keeps its own copy.

```
assets/
  web/       served at "/" in every app — files a browser or the OS asks for by URL
    favicon.ico, apple-touch-icon.png, icons/   browser tab and home-screen icons
    logo.png                                     the ZappyOne mark (256 px)
    branding/zappylogo.png                       full-size official logo (push notification icon)
    og-default.jpg                               link-preview image
  images/    imported in code — pictures that screens show
    events/                                      event-category photos
```

## Which folder

- A file referenced by URL from HTML, a manifest, a push notification or
  another site (favicon, icons, `og:image`) → `web/`. Use it as `/logo.png`.
- A picture a screen shows → `images/<area>/`, and import it:

  ```js
  import birthdayPhoto from '@assets/images/events/event_birthday.webp';
  <img src={birthdayPhoto} alt="" />
  ```

  Importing lets the build fingerprint and cache it, and fails the build if
  the file is missing — a broken image is caught before release, not by a user.

- The logo in a component: `<ZappyLogo />` (`shared/src/components/common`),
  or `import logoUrl from '@assets/web/logo.png'`.

## Rules

- One copy of each image. Never copy a file into an app's `public/`; an app's
  `public/` holds only what is its own (robots.txt, sitemap, manifest, service worker).
- Compress before adding: WebP for photos (under ~150 KB), PNG for logos and icons.
- Name files for what they show (`event_birthday.webp`), lowercase, `_` between words.

How it is wired: `shared/vite.base.js` gives every app the `@assets` alias and
serves `web/` at the site root in dev and copies it into each build.
