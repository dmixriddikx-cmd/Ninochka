# VNN shared budget API

The approved frontend remains on GitHub Pages. This Vercel project is rooted at
`sync-service/` and serves `/api/sync`, `/api/inbox`, and `/api/recognize` on Node 24.
It uses private Vercel Blob, not the retired Dropbox implementation.

## Configuration (server only)

- `BLOB_READ_WRITE_TOKEN`: private Blob store read/write access.
- `NINOCHKA_SESSION_SECRET`: signs family sessions and restricted Quick Add tokens.
- `NINA_CREDENTIAL_SHA256`, `VOLODYMYR_CREDENTIAL_SHA256`: existing login credential
  digests. Never print values, reset credentials, or rotate active secrets during
  an uncoordinated rollout.
- `NINOCHKA_INBOX_INGEST_TOKEN`: optional trusted staging automation credential.
- `NINOCHKA_INBOX_INITIAL_BATCH`: optional private historical staging seed;
  not proof that any data is persisted or applied. Never copied into previews.
- `OPENAI_API_KEY`, `VNN_SCAN_ENABLED=1`: both required for paid screenshot
  recognition. Keep disabled until the owner authorizes billing and securely
  configures the provider. `VNN_SCAN_MODEL` is optional.

Only the API origin in `sync-config.js` is public. The allowed browser Origin is
`https://dmixriddikx-cmd.github.io`. Quick Add accepts a restricted-purpose signed
token without an Origin for Apple Shortcuts. It cannot read the budget or inbox.
A Shortcut UUID is an idempotency key: reuse it when retrying the same request.
The 90-day token itself is reusable until expiry; it is not a one-time token.

## Writes and recovery

Each budget and inbox read bypasses Blob caching and captures its ETag. Replacing
an existing document requires `ifMatch`; first creation forbids overwrite. A
stale budget revision returns 409. Quick Add and staging recompute on a conflict.
There are no lease locks to expire or delete. Historical budget snapshots remain
available; never delete live documents to recover from a conflict.

The pinned Blob SDK supports conditional writes. The synthetic tests model that
contract; they are not proof of deployed provider behavior. Verify an isolated
preview before release. Do not run old and new writers against the same store:
old deployments lack ETag fencing. Retain production as rollback evidence, but
coordinate writer cutover and client reload before any approved release.

Every Vercel Preview automatically stores documents and history under
`previews/<VERCEL_URL>/`. Missing deployment identity fails closed. Production
paths stay unchanged. Preview tests must use synthetic records exclusively;
private batch seeding is disabled there. Preview credentials are required to be separate
from production credentials.

Inbox staging never debits the budget. The family reviews dates and confirms in
VNN. The client verifies saved import IDs through budget readback before queue
acknowledgement. Ambiguous write failures pause further writes and preserve a
local recovery copy. Reconnect never advances the base revision of unsent edits.

## Verification

From the repository root, on Node 24:

```sh
npm ci --prefix sync-service --ignore-scripts
npm test --prefix sync-service
node tests-sync-browser.mjs
node tests-sync-lock.mjs
```

The feature branch CI builds `_site`, checks the frozen UI and budget invariants,
and runs `tools/browser/smoke.mjs` in mobile Chromium. To repeat that browser check
after building `_site`:

```sh
npm ci --prefix tools/browser --ignore-scripts
cd tools/browser
npx playwright install chromium
npm test
```

For a preinstalled browser, set `VNN_CHROMIUM_PATH`. The harness intercepts all
requests and uses the actual API handlers with an in-memory conditional-write
Blob model. It never contacts production or a paid recognition service. Browser
test hooks are appended only to intercepted module responses; they are never
included in the shipped application. Real iPhone installation, real OCR, and
live Blob concurrency still require separate authorized verification.

## Preview credential isolation and live checks

Previews deliberately refuse production credentials and sessions. Configure the
following **preview-only Secret** keys with synthetic test values:

- `NINOCHKA_PREVIEW_SESSION_SECRET`
- `NINOCHKA_PREVIEW_NINA_CREDENTIAL_SHA256`
- `NINOCHKA_PREVIEW_VOLODYMYR_CREDENTIAL_SHA256`
- `NINOCHKA_PREVIEW_INBOX_INGEST_TOKEN` only if external staging is tested.

These keys do not change either family's production login. A live verification
runner must first receive `environment: preview` and the exact immutable hostname
in `storageNamespace`; it refuses a populated namespace before any write.
Run `scripts/verify-live-preview.mjs` with `VNN_PREVIEW_URL` and a privately
provisioned `VNN_PREVIEW_LOGIN_PIN`. Never put that PIN or session tokens in CI
output, command arguments, source or issue comments. This runner contacts the
actual deployed API and Blob, uses synthetic records, and never invokes paid OCR.

Blob GET must request `accept-encoding: identity`: the observed Brotli GET
representation ETag differs from `head()` and cannot guard stored-object writes.
Both budget and inbox use this shared read path. The live acceptance must include
large JSON, concurrent updates, conflict retries and readback; a small probe or
in-memory mock misses the compression defect.

Recognized review results are cached privately by exact image digest. The image
itself and raw provider output are not retained. Re-upload uses identical row IDs
without another provider request; concurrent recognitions use the winning cached
result. Inbox acknowledgment refuses IDs absent from the saved budget. Imported
IDs remain compact replay tombstones and do not consume pending queue capacity.

The existing frontend can also be copied into `sync-service/public/` for an
isolated QA deployment, with only `sync-config.js` pointing to `location.origin`.
This is a build of the same frontend, not a replacement project or production
cutover. Only its own exact immutable preview Origin is permitted in addition to
the approved GitHub Pages Origin. Never promote that QA build as production.

The PWA caches only public shell files; financial API calls never enter Service
Worker Cache Storage. Existing authenticated, unexpired local sessions can reopen
the local recovery copy offline. Server authentication remains mandatory on every
cloud request. A new service worker waits for existing tabs to close. The browser
suite includes real offline restarts, persistence and authenticated online
readback against a synthetic local service. This does not establish physical
iPhone installation or Apple Shortcuts behavior.

Real browser acceptance is opt-in: `npm run test:live --prefix tools/browser`
requires `VNN_PREVIEW_URL`, a synthetic `VNN_PREVIEW_LOGIN_PIN`, and the expected
`VNN_SOURCE_SHA`. It loads the deployed QA application, checks its source manifest
and isolated namespace, signs into both test accounts, edits and confirms a queued
purchase through the actual UI, and verifies the saved cloud state. It also tests
the real disabled-OCR upload response. No HTTP or Blob mocks are used. A system
browser can be selected with `VNN_CHROMIUM_PATH`; the runner respects `HTTPS_PROXY`.
For terminal live checks in a proxied Node 24 environment use `NODE_USE_ENV_PROXY=1`.
Do not disable TLS verification or use production credentials in these runners.

Same-origin preview browser GET requests normally have no Origin header. The
preview origin guard accepts that case only with the exact deployment Host,
matching Referer and `Sec-Fetch-Site: same-origin`; all session checks remain in
force. Production keeps the approved GitHub Pages Origin policy.
