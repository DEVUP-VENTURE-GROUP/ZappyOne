# Fleet portal

ZappyOne's fleet management, on the web only (`fleet.zappyone.com`, port 5176):
our own staff, hubs (dark stores), shifts, stock, payroll and fleet money.
Fleet managers sign in with an admin account whose role opens **Fleet**
(server `admin/access`: `fleet_manager`, or ops, finance, city manager, super admin).

## Structure

```
src/
  main.jsx          mounts the app
  app/              FleetApp (routes, sign-in gate), FleetShell (header, tabs, access check)
  config/           paths.js (the secret slug), views.jsx (the list of screens)
  features/         one folder per area, one component per file
    overview/       KPIs, charts, what needs attention
    hubs/           hubs, the hub editor and its map
    stock/          each hub's stock: bought, issued, counted
    staff/          who is staff, hub and salary
    roster/         the week's shifts, auto-fill
    leave/          leave waiting for a decision
    payroll/        the month's salaries, CSV export
    finance/        each hub's profit and loss, expenses, cash deposits
  ui/               small building blocks only the fleet uses (MonthPicker)
```

A new area gets its own folder under `features/` and one line in
`config/views.jsx`; Admin → Fleet shows the same list (imported as `@fleet`).

Console building blocks shared with the admin app (cards, tables, charts,
sign-in) are imported from it as `@admin`, not copied. Data comes from the
shared API layer (`@shared/services`), server module `workforce/`.

## Security

Same as the admin portal: every screen is under a secret slug
(`VITE_FLEET_SLUG`, in the gitignored env files); any other path is a plain
404. The admin API answers only from this origin and admin's, the session is
its own strict 12-hour cookie, and `vercel.json` sends noindex, no-framing and
strict security headers. `VITE_ADMIN_SLUG` must match the admin app's.
