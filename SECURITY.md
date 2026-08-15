# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report privately via GitHub's [**Report a vulnerability**](../../security/advisories/new)
(Security → Advisories → Report a vulnerability), or email the maintainer. Include
a description, reproduction steps, and the impact you observed. You'll get an
acknowledgement within 72 hours and a fix timeline once the report is triaged.

## What runs on every change

The CI/security pipeline (`.github/workflows/`) enforces:

| Check | Workflow | What it does |
|---|---|---|
| Build | `ci.yml` | Client production build must succeed |
| Tests | `ci.yml` | Server Jest suite (in-memory Mongo + Redis) must pass |
| Dependency audit | `ci.yml` | `npm audit` reported for client/server/mobile |
| SAST | `codeql.yml` | CodeQL `security-extended` on all JS/TS |
| Secrets | `secret-scan.yml` | TruffleHog scans commits + full history |
| Dependency updates | `dependabot.yml` | Weekly upgrade PRs, incl. GitHub Actions |

## Handling secrets

- Never commit real secrets. `.env*` is gitignored; use `.env.example` for shape.
- Access tokens live in memory only on the client (never `localStorage`); refresh
  tokens are httpOnly cookies with rotation + reuse detection.
- The dev OTP is only returned by the API when no SMS provider is configured and
  never in production (`NODE_ENV=production` force-nulls it).

## Known items being tracked

- Several transitive dependency advisories (axios, form-data, ws, socket.io,
  websocket-driver) have fixes available and are being taken via Dependabot.
- A handful of server tests are quarantined with `test.skip` and a
  `TODO(test-restore)` note — including a flagged review of the refresh-token
  rotation concurrent-race grace window. See the CI restoration notes.
