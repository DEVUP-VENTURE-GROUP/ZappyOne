# Checkpoint gate

A verify-only check on every pull request into `checkpoint-main`. It never changes code. It builds, tests and measures the PR against its base, then gives a verdict:

- **PASS:** the PR can be merged.
- **FAIL:** the PR cannot be merged until the listed fixes are made.

The report appears in three places:

- a comment on the PR, updated on every push
- the run's summary page
- `report.html` in the run's artifacts, a single page you can download and share

## What it checks

The gate rates the code a PR **adds** the way SonarQube does: Reliability, Security and Maintainability from A to E, coverage and duplication on new code, and hotspots to review. It goes further with checks SonarQube does not have: app type checks, running cost, dependency licences, unused code and dead API hooks.

| Check | Fails when the PR… |
|---|---|
| Forbidden files | adds an `.env`, key, certificate, build output or AI tool config (`.claude/`, `CLAUDE.md`, `AGENTS.md`, `.cursor/`…) |
| Secrets in code | adds a line that looks like an AWS key, a database URI with a password, a private key, a live payment key or a token |
| Server tests | breaks a test that uses the changed server code (by path, file name or URL, else its module's tests, at most 25 files). `--full` runs the whole suite. A file that fails only under load and passes on a calm retry is a warning (flaky) |
| Coverage on new code | runs fewer than 80% of the new server statements in tests (SonarQube's default gate) |
| Build every app · compressed size | breaks a build of client, servicepro or admin, or pushes one past its gzip budget in `budgets.json` |
| App type check (iOS + Android) | leaves a TypeScript error in an app it touches: Customer and ServicePro (Expo SDK 58) are each checked with their own install in `mobile/apps/<app>`, Rakshak with the `mobile` workspace (SDK 56), and a change to the shared `mobile/packages/core` or `ui` checks all three. An app that cannot be checked (missing lockfile, not installed, broken `shared` link) fails; changed Kotlin/Swift is a warning because the gate does not compile native code |
| Reliability · bugs | adds an undefined name or component, a hook outside a component, identical branches or conditions, an impossible comparison, an ignored return value… (SonarJS + core rules) |
| Security · vulnerabilities | adds `eval` or `new Function`, a shell call, an exponential regex, a hard-coded password or IP, an insecure cookie, a timing-unsafe comparison… |
| Maintainability · code smells | adds a function over cognitive complexity 15 or cyclomatic complexity 20, over 250 lines, nested over 5 deep or with over 5 parameters, an identical function, a dead store, an unused value, missing hook dependencies… |
| Accessibility | adds an image without alt text, an empty link or heading, invalid ARIA roles or properties… |
| Duplicated code | adds a copy-paste block of 12 lines or more |
| Unused components and endpoints | leaves a file no app imports or nothing on the server requires, or an API hook no screen calls |
| Screens wired to real API hooks | imports an API hook the client does not define (the screen would crash on open) |
| Running cost | polls faster than once a minute or adds an image over 400 KB |
| Dependencies | brings in a package with a high or critical advisory, or a GPL, AGPL, SSPL or BUSL licence |

These checks report and never fail the gate:

| Check | Reports |
|---|---|
| Quality on new code | the A–E ratings, coverage %, duplication % and hotspot count, at the top of the report |
| Security hotspots | randomness, weak hashing, plain `http://`, raw HTML and dynamic regexes to review |
| Running cost (to check) | database reads with no `.limit()`, fast timers, polling while the live connection is down |
| Complexity | the average and highest complexity of the functions the PR wrote or changed |
| AI assistance | the declared share against commits marked with an AI co-author trailer |
| Tests for server changes | server code changed with no test changed |
| Size of the change | past 1,500 added lines |

A PR run takes about 2 minutes: only the tests that use the changed code, only the web apps whose code changed, and the type checks of the phone apps a change reaches (documentation alone reaches none). Run `--full` (the whole ~1,950-test suite and all three builds) before a release and nightly.

Every lint-based check compares the PR with its base and fails only on what the PR adds, so older debt in a file you touch is shown but not blamed on you. Tests, the three web builds and the app type checks run at the same time.

Test files may use fake passwords and random values, and translation files contain the word "password" in every language, so those rules skip them (`eslint.config.mjs`).

## Run it before you open a PR

```bash
cd tools/checkpoint-gate && npm ci && cd ../..
git fetch origin checkpoint-main
node tools/checkpoint-gate/run.js --base origin/checkpoint-main
# faster while iterating:  --skip-tests --skip-build
# the gate's own tests:     cd tools/checkpoint-gate && npm test
# open gate-report/report.html
```

## Make it binding (one-time, repository admin)

On GitHub, go to **Settings → Branches → Add rule** for `checkpoint-main`:

- Require a pull request before merging.
- Require status checks to pass, and select **Checkpoint gate** (plus **CI**, **Secret Scan** and **CodeQL**).
- Do not allow bypassing the above settings.

## Changing a threshold

Thresholds live in `eslint.config.mjs` (code health), `run.js` (duplicate size, PR size) and `budgets.json` (app size). Change them in a PR of their own, with the reason, so the bar only moves on purpose.
