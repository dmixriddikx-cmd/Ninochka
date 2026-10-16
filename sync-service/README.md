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
private batch seeding is disabled there. Preview credentials should be separate
from production credentials when provisioned by the owner.

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
