# ZappyOne build list

Kept up to date as items ship. P1 = do next, P2 = soon, P3 = next version or at volume.
Based on the code as of 2026-11-03 (main `6033c6a1`).

## What dispatch already does

- Live pros in a Redis GEO index; location writes batched every 1.5 s.
- Ready pool: pros who opted in are locked with no offer round-trip.
- Fair order: within the 10-min promise band, fewest jobs today, then longest idle (`jobs/fairness`).
- Ring rounds every ringSec, widening to widenKm; auto-assign at 3 min (`jobs/fast-assign`).
- Waves: offline pros nudged at 5 min, customer told at 10 min (`jobs/waves`).
- H3 is installed but used only by surge and weather.

## Dispatch and algorithms

| # | Item | Why | Priority |
|---|------|-----|----------|
| D3 | ETA calibration log: promised vs actual arrival per H3 cell and hour; learn speed per cell instead of one 22 km/h | Makes the "arrives in 10 min" claim evidence-backed and tightens D1 when Mapbox is down | P1 |
| D4 | H3 supply and demand cells (res 8, about 0.7 km²): free pros vs open jobs per cell, shared with surge's cell function | Powers "3 jobs waiting near you, go online" nudges, an admin live heatmap and per-area launch demand | P2 |
| D5 | Hold-and-batch matching: jobs opened within a few seconds in neighbouring cells are assigned together (min-cost assignment) instead of first-come | Avoids sending the one nearby pro to the job that is worse for both. Only matters at volume | P3 |
| D6 | Demand forecast per cell × hour of week (moving average, then the SurgeQuote log as training data) | Nudge pros online before peaks rather than after the customer is waiting | P3 |

## Features

| # | Item | Why | Priority |
|---|------|-----|----------|
| F1 | (Customer credit part waits on payment credentials.) Late or no-show guard: if the pro is not moving toward the door by the promised time, re-ring automatically and credit the customer | No no-show handling exists in jobs today; it is the top complaint on every service marketplace | P1 |
| F2 | Admin: launch demand per service per area ("Coming to your area" breakdown) | Decides which providers to onboard first; waiting on your answer (now or next version) | P1 |
| F3 | Talk to ZappyOne: unread badge in each menu, saved quick replies for admin, attach a photo | Makes the new chat feel like chat | P2 |
| F4 | Live tracking map shows a road ETA that counts down (live position already streams; the ETA is still the rough estimate until D1) | The countdown is what customers watch in Rapido and Swiggy | P2 |
| F5 | Pro scorecard in ServicePro: acceptance, on-time %, rating, with how to improve (uses D2/D3 data) | Pros improve what they can see; also fair to them | P2 |
| F6 | The side-by-side price compare that repairs have, for pet care and helping too | Providers set every price now; showing it plainly is the mediator's job | P2 |

## Done

- 2026-11-03 D2: auto-assign picks pros who answer their rings first inside the promise band (accept rate from penalties; under 10 rings not judged).

- 2026-11-03 D0: the live-pro index no longer expires on location-only updates.
- 2026-11-03 D1: road ETAs from one Mapbox Matrix call with traffic (Google key refused: billing off).
- 2026-11-03 Home live catalog cached in Redis for 60 s; public catalog cacheable by the browser for 5 min.
- 2026-11-03 Polls back off to 2 min while the socket is live.
- 2026-11-03 No crash after a deploy (stale page file); ServicePro profile shows a retry instead of loading forever.

- 2026-11-03 Talk to ZappyOne (web, customer and ServicePro apps, admin replies with push).
- 2026-11-03 No white screen on load: boot screen in HTML, page chunk loads during session restore.

## F7 plan: "Busy now, I can come in 45 min" (accept with a later start)

Status: planned, not built. Like Urban Company and ride apps: a pro who is busy or far can still take a job by promising a time, and the customer decides.

### How it works

1. **Pro's offer card**: three choices, *Take now*, *Take, I'll come in [20 · 30 · 45 · 60] min* and *Pass*. The later times shown are capped by Economics → Dispatch (`maxLaterStartMin`, default 60); a pro at their job cap sees none.
2. **Server holds offers for one ring window**: a *Take now* inside the window wins at once, as today. *Come later* offers are collected; when the window ends the earliest promise (then reliability, then fairness) is chosen. Nobody is given a job they did not tap.
3. **Customer approves**: "Ravi can be with you around 10:45 (in 45 min). OK, or find someone sooner?" The job is held for `customerDecisionSec` (default 120). OK books it at that time. *Sooner* keeps ringing, with Ravi's promise kept as the fallback. No answer means OK; an ASAP booking never silently becomes a much later one, because a promise over 30 minutes needs a tap.
4. **The promise drives everything after**: tracking shows "arrives around 10:45", the late/no-show guard (F1) measures against the promised time, and the pro's reliability score (D2) counts promises kept.

### Data
`matching.promise { minutes, at, workerId|shopId, offeredAt, customerDecision: 'pending'|'ok'|'sooner', decidedAt }`; the job stays in its waiting status until the customer says OK, so workload, capacity and ring rules need no new status.

### Edge cases to cover
- Two pros promise; one says *now* during the window: *now* wins and the others hear "taken".
- The customer says *sooner*, nobody else takes it: the kept promise is booked automatically before the original pro's offer lapses.
- The customer cancels while deciding: free, no fee, the pro hears at once.
- The pro cancels after promising: counts like a cancellation; the job re-rings at once with the original priority.
- The pro's current job runs long: at promise minus 10 min, ask "still on time?"; *running late* gives the customer the choice again.
- A scheduled booking: no *come later* option (it already has a time).
- A shop's offer: the promise is the shop's; the owner assigns a technician before the promised time or the job falls back.
- Cap: a promise counts toward `maxActiveJobs` from the moment it is accepted.
- Surge and boosts keep their amounts; a promise never changes the price.
- Rakshak staff stay on the current ring-one-at-a-time rule (v3).

### Build list
Server: offer `promiseMin` on accept, window collection in `waves`, customer decision endpoint, promise-aware `arrival` and `workload`, messages (customer decision, pro outcome). Web + app: offer card buttons, customer decision sheet, tracking line. Tests: each edge case above as a route-level test.
