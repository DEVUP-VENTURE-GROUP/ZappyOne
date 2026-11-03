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

## F7 plan: offer queue, "I can come by", and an order that is never lost

Status: planned, not built. Today: each ring 30 s (`ringSec`), auto-assign at 3 min (`autoAssignSec`), offline nudge at 5 min, customer told at 10 min.
All times below live in Economics → Dispatch; the numbers are the defaults.

### The timeline of one ASAP booking

| When | What happens | Customer sees |
|---|---|---|
| 0 s | The nearest free pros ring, each for **40 s** (`ringSec` 40). A pro already on a job is rung only if nobody free is in reach. | "Finding your pro" |
| every 40 s | Rung again, a little wider each round, up to `widenKm`. The card says "+N more jobs waiting" when several ring. | Pros asked so far, live |
| 0 to 5 min | The job sits in every reached pro's **Work → Open jobs near you** list for **5 minutes** (`openListMin` 5), takeable any time, even after the ring ends. | |
| any time | A pro can tap **Take now** (wins at once) or **I can come by [time]** (10, 20, 30, 45, 60 min; capped by `maxLaterStartMin`). | Each offer appears as it arrives |
| on an offer | "Ravi can be with you around 10:45. **OK**", and below it **other pros near you** to pick instead (their own prices and arrival times). Nobody is ever given the job without tapping Take. | OK, or pick another |
| 5 min, nothing yet | Offline pros nearby get "a job near you is waiting" (today's wave 2). Pros with auto-accept on can be given it (moved from 3 to 5 min, so the 5-minute list rule holds). | "Still looking; we have asked N pros" |
| 10 min | Ops gets it in **Needs intervention** with a call button for the customer and the nearest pros (today). | Choices: keep waiting, pick a time, or cancel free |
| no pro at all in the area | Says so at once (nobody covers the address), never a spinner. | "Nobody near this address does this yet" (live now) |

### Never lost: the backups

1. **Socket down on the pro's phone**: the offer also goes as a push; when the app opens, offers still inside their window are recovered from the server (exists today).
2. **Pro taps Take as someone else does**: the job is claimed in one atomic step; the second sees "taken by another pro" (exists).
3. **Customer's chosen pro ignores it**: after their window it opens to everyone near, without a new booking (exists).
4. **Pro accepts, then cancels or vanishes**: it re-rings at once with its original place in line; the customer keeps their booking (exists for give-back; extend to no-show with F1).
5. **Several offers at once**: the earliest time wins, then reliability (D2), then fairness. The customer can still pick any of them.
6. **Customer does not answer an offer**: under 30 minutes away it is accepted for them after `customerDecisionSec` (120 s); over 30 minutes it always needs their tap, and keeps the job open meanwhile.
7. **Server restarts mid-search**: the waves sweep picks every waiting job back up from the database every 10 s (exists).
8. **Nothing, ever**: the job is never cancelled silently. Only the customer cancels, or ops after calling them.

### Data
`matching.offers [{ by: 'shop:<id>'|'worker:<id>', at, minutes, kind: 'now'|'later' }]`, `matching.customerChoice { by, at }`, new Economics keys `openListMin`, `maxLaterStartMin`, `customerDecisionSec`; `ringSec` default 30 → 40, `autoAssignSec` 180 → 300.

### Build order
1. Server: offers collection on accept ('now' / 'later'), the 5-minute open list, customer choice endpoint, timing defaults, messages.
2. ServicePro web + app: offer card "I can come by", Open jobs list countdown.
3. Customer web + app: offers with OK plus other pros below, the waiting screen choices.
4. Tests: every row and backup above as a route-level test (one booking, two pros, ten bookings at one pro, sockets off, restart).
