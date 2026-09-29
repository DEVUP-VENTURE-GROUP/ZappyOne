# ZappyOne admin console

Vite + React app on `:5174` (admin.zappyone.com). Reached only through the secret login slug
(`VITE_ADMIN_LOGIN_SLUG` here, `ADMIN_LOGIN_SLUG` on the server); shares `@shared` with the other apps.

```
src/
  main.jsx            entry
  app/                App (routing), Shell (sidebar + section frame), LoginPage
  config/             admin.js (slug paths), sections.jsx — the sidebar, hubs and old-link redirects
  ui/                 kit.jsx (cards, tables, badges, form bits), Hub.jsx (one entry, several tabs)
  hooks/              map helpers shared by several screens
  features/<area>/    one folder per area — the same names the server uses for permissions
    overview  insights  catalog  customers  bookings  support  providers
    events    marketing money    operations system
next/                 parked work for a later version (not built, not imported)
```

## Adding a screen

1. Put the component in `src/features/<area>/`.
2. Add one line to `P` in `src/config/sections.jsx`, then either a sidebar item (with its `area`)
   or a tab in an existing hub.
3. If it calls a new admin endpoint, map that path to an area in
   `server/src/modules/admin/access/permissions.js` — unmapped paths are super-admin only.

The sidebar shows only the areas the signed-in admin's role can open; the server checks the same
rule on every request, so hiding a link is convenience, never the security.
