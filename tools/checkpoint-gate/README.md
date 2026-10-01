# Checkpoint gate

A verify-only check on every pull request into `checkpoint-main`. It never changes code. It builds, tests and measures the PR against its base, then gives a verdict:

- **PASS:** the PR can be merged.
- **FAIL:** the PR cannot be merged until the listed fixes are made.

The report appears in three places:

- a comment on the PR, updated on every push
- the run's summary page
- `report.html` in the run's artifacts, a single page you can download and share

## What it checks

| Check | Fails when |
|---|---|
| Forbidden files | an `.env`, key, certificate, build output or AI tool config (`.claude/`, `CLAUDE.md`, `AGENTS.md`, `.cursor/`…) is added |
| Secrets in code | an added line looks like an AWS key, a database URI with a password, a private key, a live payment key or a token |
| Server tests | any test in `server/tests` fails |
| Build every app · compressed size | an app fails to build, or its gzipped JS + CSS grows past its budget in `budgets.json` |
| Code health | the PR **adds** a function that is too complex (more than 20 branches) or too long (more than 250 lines), nests more than 5 levels deep, takes more than 5 parameters, or adds unused values or dead code |
| Duplicated code | the PR adds a copy-paste block of 12 lines or more instead of reusing existing code |
| Unused components and endpoints | the PR leaves a file that no app imports or nothing on the server requires, or an API hook no screen calls |
| AI assistance | the PR description has no `AI-assisted: N%` line |

These checks only report and never fail the gate:

| Check | Reports |
|---|---|
| Complexity | the average and highest complexity of the functions the PR wrote or changed |
| AI assistance | the declared share, and the share of lines from commits marked with an AI co-author trailer; it warns when the declaration is lower than what the commits show |
| Tests for server changes | a warning when server code changes but no test changes |
| Size of the change | a warning past 1,500 added lines |

The code-quality checks (code health, duplicates, unused) compare the PR with its base. They fail only on what the PR adds, so older debt in a file you touch is shown but not blamed on you.

AI-written code that isn't declared can't be detected reliably. That's why the gate requires the declaration and cross-checks it against commit trailers.

## Run it before you open a PR

```bash
cd tools/checkpoint-gate && npm ci && cd ../..
git fetch origin checkpoint-main
node tools/checkpoint-gate/run.js --base origin/checkpoint-main
# faster while iterating:  --skip-tests --skip-build
# open gate-report/report.html
```

## Make it binding (one-time, repository admin)

On GitHub, go to **Settings → Branches → Add rule** for `checkpoint-main`:

- Require a pull request before merging.
- Require status checks to pass, and select **Checkpoint gate** (plus **CI**, **Secret Scan** and **CodeQL**).
- Do not allow bypassing the above settings.

## Changing a threshold

Thresholds live in `eslint.config.mjs` (code health), `run.js` (duplicate size, PR size) and `budgets.json` (app size). Change them in a PR of their own, with the reason, so the bar only moves on purpose.
