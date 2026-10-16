# VNN integration and release gate — 2026-10-16

Continue the existing feature branch and PR #2. The current immutable source,
latest CI, final preview deployment and runtime outcomes are recorded in the PR
body; older SHAs in issue comments are historical checkpoints, not current HEAD.
No family budget write, historical batch application, PIN change, paid OCR request,
production merge or production promotion has been authorized by these test runs.
The owner's current instruction authorizes a controlled release once gates pass.

## Inventory and preserved state

| Area | Current finding |
| --- | --- |
| Approved frontend | GitHub Pages production uses main `bf491c38c79605dfb5960277d389a62a1eeb4e9b`; newer source remains in PR #2 |
| Approved design | `contract.css`, index markup, manifest and approved assets unchanged by these repairs |
| Budget engine | Four weekly funds, closure/reopening, retroactive corrections, signed manual corrections, negative Storage and EUR/USD/MDL/UAH regression checks pass |
| Backend production | Preserved `dpl_EfDdXXQv58EeDqBXVDVqrzAJmbWq`, existing aliases unchanged; approved-Origin `/api/sync` returns 401 unauthenticated, new inbox/recognition routes are absent there (404) |
| Initial READY preview | `dpl_8xQrbymEzutqQkhRw5MHBze8s48h` had no working `/api/sync` route; READY was not functionality evidence |
| Correct deployment root | Fresh deployment with `sync-service/` root serves all three API routes; project root setting repaired |
| Git integration | Vercel explicitly reports no connected Git repository; this explains the gitSource failure. Exact-source inline deployments work; Git integration itself is not repaired |
| Storage | Existing private Blob store `store_1Uk84eHDVHO7zjyn` preserved; synthetic data under immutable `previews/<hostname>/` only |
| Historical batch | Initial-batch env key exists; persistence/application status is UNKNOWN until authenticated production inspection. No private screenshot attachments supplied to this run |
| OCR | Disabled: `OPENAI_API_KEY` and `VNN_SCAN_ENABLED` absent. Mock-provider tests are not real OCR |
| Legacy artifacts | Additional CSS, unused source fragments and payload files are not part of the active UI bundle; retained rather than deleted or rewritten |
| Observability | Connector build/runtime log operations still return 403 for scope `jwmhnfndnc-3728`; direct terminal HTTP checks work. No CLI credentials; cloud dashboard requires sign-in |

## Repairs

- Real provider defect reproduced: Brotli GET returned a different ETag from
  Blob `head()` on a large budget. Conditional writes using that representation
  failed. `accept-encoding: identity` produces the stored-object ETag and is now
  required by the shared budget/inbox/cache reader. No unconditional-write fallback.
- Quick Add and inbox retry transient storage failures and recompute after a
  conflict, including a response lost after successful commit. Bounded backoff;
  permanent validation failures do not retry. Sync function has a 30-second limit.
- Preview credentials/session signing are separate from production. Inherited
  production sessions and ingestion tokens cannot authenticate to preview.
- Closed-week settlements rebase with Storage currency, preserving correction,
  savings and reopening math. Signed manual expense corrections survive API
  validation; weekly fund allocations remain nonnegative.
- Multi-screenshot staging and acknowledgment handle 140 rows in 50/50/40
  API chunks with one final family confirmation. Provider failures remain visible.
- Review supports merchant, amount, currency and date corrections. Local edits
  during importer preflight cannot be replaced or silently sent with a changed
  remote revision. Stable import IDs are checked through cloud readback.
- Inbox cannot acknowledge unconfirmed transactions. Acknowledged IDs remain
  compact replay tombstones; imported entries do not exhaust pending capacity.
- Recognition caches the minimal private review result by exact image digest.
  Re-upload reuses the same rows without another provider call; racing results
  use the winning cached record. No screenshot or raw provider response is stored.
- Login is no longer covered by the introductory overlay.
- Service Worker caches only the public application shell. An existing unexpired
  authenticated installation reopens its local recovery copy offline. Offline
  expenses survive restarts and synchronize after reconnection; API responses
  never enter shell caches. New installations still require cloud login.
- Calendar rollover runs while an authenticated app stays open, queues a cloud
  save, creates exactly four weeks and never settles the same month twice.
- Shortcut setup explains reusing the same UUID on retries and checking `saved`.

## Verification boundaries

Node 24 suite includes auth/CORS, conditional first-create/update, stale writers,
concurrent inbox and Quick Add, lost write responses, token separation, negative
FX balances, review races and financial/calendar invariants. See current CI.

Mobile Chromium tests run the actual frontend and handlers against an in-memory
Blob model with synthetic login/data, including editable review, two accounts,
replay, 390px layout and manifest. A separate browser test installs the actual
Service Worker from a local HTTP server and tests two offline restarts, an offline
expense, authenticated online readback exactly once, and absence of API caches.
These tests are explicitly synthetic. They do not establish real OCR, actual
Apple Shortcuts execution or physical iPhone installation.

`scripts/verify-live-preview.mjs` is a separate, guarded real-cloud runner. It
requires a NEW immutable preview and proves its storage namespace before writing.
It exercises auth, two accounts, actual Blob read/write/conflict behavior, inbox
staging/acknowledgment, status filtering, corrected dates, duplicate imports,
restricted Quick Add, simultaneous requests and synthetic data rollback. Its
actual result is recorded in PR #2, including any unresolved failure. No green CI
or READY state may substitute for this result.

## Production gate and recovery

1. Authenticate privately to the existing family budget. Preserve an authenticated
   readback, exact revision, byte/hash-verified recoverable backup and private
   inbox state before cutover. Do not retrieve or print environment credential values.
2. Establish a verified writer barrier for old deployments. Old unconditional
   writers must not run against new ETag writers or a restored snapshot. Existing
   production deployments are retained; merely preserving an ID is not a tested
   financial rollback.
3. Recheck current production credential/storage metadata and compatible frontend
   and backend artifacts. Keep preview test credentials out of production.
4. Stage the production build, verify against its production configuration, and
   test the concrete rollback under the writer barrier before assigning aliases.
5. Publish the existing GitHub Pages pipeline and backend deliberately, then
   verify the real production URLs, both family sessions, queue and saved budget.
6. Real OCR requires separate owner spending approval and secure server-side API
   credentials. Physical dual-iPhone installation/Shortcut acceptance stays PARTIAL
   until actually performed. Bank imports still require final confirmation in VNN.

Production is not DONE while these gates remain unverified. No test reset, sample
budget or historical import is permitted to overwrite the real family budget.
