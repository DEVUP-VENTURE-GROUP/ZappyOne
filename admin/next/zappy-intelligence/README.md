# Zappy Intelligence (next version — parked)

Copied as-is from branch `zappyAI` (commit `f895919`). **Not built, not mounted, not imported by anything.**
It is kept here so the next version starts from it.

```
client/   screens (was a separate Vite app on :5174 with its own login)
server/   modules/zi — services, models, routes, own auth (ZIUser, x-zi-token, ZI_JWT_SECRET)
```

## Before it goes live

1. **One login.** Drop `ZIUser` / `zi-auth.middleware` / `ZI_JWT_SECRET`. Mount the routes under the
   admin API (`/api/<ADMIN_LOGIN_SLUG>/intelligence/...`) — the admin session, origin check and
   role checks (`server/src/modules/admin/access/`) then apply. Its permission names map onto the
   `intelligence` area; city-scoped roles map onto the admin `scope`.
2. **All engines, not just orders.** Every service reads only the legacy `Order` collection. Repair,
   pet and helping bookings must be included (read through one normalised booking source), or the
   numbers leave out most of the business.
3. **No India-only assumptions.** `expansion.service` has a hardcoded Indian city list and
   `forecast.service` hardcodes `Asia/Kolkata`; these become per-market data (country, currency,
   timezone) so a second country is configuration, not code.
4. **Nothing invented.** `partner-intel.service` uses a fixed response score of 75 when untracked —
   show "not tracked" instead.
5. **Remove overlaps** with what the admin already has (Insights: expansion, partners, geo/heatmap;
   Fraud detection; Ad campaigns) — keep one of each.
6. Server paths inside this copy (`../../../utils/logger`) point at the old layout; the current
   equivalents are in `server/src/core/`.
