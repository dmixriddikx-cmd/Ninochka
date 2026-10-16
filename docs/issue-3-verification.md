# Issue #3 verification checkpoint — 2026-10-16

Implementation remains on `feature/charlie-expense-inbox-20261015`, in draft
PR [#2](https://github.com/dmixriddikx-cmd/Ninochka/pull/2). No merge, Pages deploy,
production deployment, credential rotation, private batch staging, or family
budget write was performed. Final immutable branch SHA and CI links are recorded
in the PR after the implementation commit is pushed.

## Engineering evidence

- Replaced budget and inbox lease locks with private Blob ETag conditional writes.
  First creation forbids overwrite. Stale writers cannot publish over a winner.
  Quick Add and inbox mutations recompute after conditional-write conflicts.
- Pinned `@vercel/blob` 2.8.2 and committed npm lockfiles. Its API supports
  `get().blob.etag` and `put(..., {ifMatch})`. This SDK contract still needs a
  real isolated-preview provider check; local tests do not establish distributed
  provider behavior.
- Vercel preview data/history paths are isolated by immutable deployment hostname;
  missing hostname fails closed. Preview never reads the private initial seed.
- Offline reconnect retains the unsent base revision; a newer remote revision
  pauses for review. Expired sessions preserve dirty data and a recovery copy.
  Refresh does not replace edits made during an in-flight request.
- Inbox confirmation performs authenticated saved-budget readback before
  acknowledgement. Ambiguous writes pause further writes and retain local data.
- Failed, pending and unknown bank statuses are held out. Recognition requires a
  recognized successful posting status. Incomplete rows stay out. Bank references
  remain stable despite optional OCR fields changing; minute-only timestamps do
  not erase identical repeated purchases.
- Budget validation enforces four distinct weekly IDs, safe integer money and
  supported currencies, while allowing negative storage.
- No CSS, approved image/icon, index markup or manifest changes.

## Verified local checks

Runtime: Node **24.19.0**. Backend suite: **13/13 pass**. Root regression scripts,
syntax checks, budget/UAH invariants, generated icons, frozen UI contract and
runtime smoke pass. Browser recovery tests cover offline revision mismatch,
in-flight refresh edits, and expired-session dirty-state preservation.

Mobile Chromium at **390 × 844** passes this synthetic flow:

`family login → stage → review → edit purchase date → confirm → week 1 → negative storage → authenticated readback → second session → identical replay`

Replay is a no-op, both sessions agree on revision/balance, the pending queue is
empty, and there are no page exceptions or horizontal overflow. Manifest is
standalone with 192/512 icons. See `tools/browser/smoke.mjs` and the updated CI.
The harness intercepts external URLs and runs the actual handlers with an
in-memory Blob model. It uses synthetic login/data only and disables paid OCR.
This is **not** a cloud preview, real OCR, physical iPhone installation or a
native widget test. Browser hooks exist only in intercepted test responses.

## Live read-only evidence

- GitHub Pages: HTTP **200**, [live URL](https://dmixriddikx-cmd.github.io/Ninochka/).
- Pages deployment `6874940949`: success, commit
  `bf491c38c79605dfb5960277d389a62a1eeb4e9b`,
  [deployment run](https://github.com/dmixriddikx-cmd/Ninochka/actions/runs/37409102038).
- Existing production backend: `/api/sync` HTTP **401** without a session and
  `/api/inbox` HTTP **404**, with the approved Origin. No authenticated family
  data was read or written. These responses do not prove full production health.
- Vercel project metadata: **403 forbidden** for
  `prj_Azq2dYlvYhlGflm8mCFszoQ7pEoV` in
  `team_nNO5GNBWGs5ouopkW9AgS3GA` (scope `jwmhnfndnc-3728`).
  Safe error: `Not authorized: Trying to access resource under scope`.
- CLI fallback found no Vercel credentials. Its automatically offered device
  login was cancelled; no alternate scope or interactive authentication was used.

## Acceptance ledger

| Field | Status | Evidence / limit |
| --- | --- | --- |
| SOURCE_HEAD | VERIFIED | Current remote HEAD fetched as `19dc93517dbced67e33f92b036713d3b865203bd`; final repair SHA in PR |
| PR_STATUS | VERIFIED | PR #2 open and draft; not merged |
| CI | PARTIAL | Local checks pass; final exact-HEAD Actions evidence recorded in PR after push |
| PREVIEW_DEPLOYED | NOT_STARTED | Vercel scope access blocked |
| PREVIEW_COMMIT_MATCH | NOT_STARTED | No new preview ID available |
| PREVIEW_API_TESTS | PARTIAL | Synthetic handler and browser checks pass; live Blob/auth still unverified |
| ENV_CONFIG_STATUS | NOT_STARTED | Current keys/targets inaccessible; historical inventory is not current evidence |
| SCREENSHOT_OCR_TESTED | PARTIAL | Mock-provider normalization/auth/spending gate tested; real OCR not run |
| BATCH_STAGED | NOT_STARTED | Real batch untouched; env presence and persistence not assumed |
| BATCH_READBACK | NOT_STARTED | No private authenticated access |
| GITHUB_PAGES_LIVE | VERIFIED | HTTP 200 and successful deployment evidence above |
| VERCEL_PRODUCTION_LIVE | PARTIAL | Sync 401; inbox 404; no full family-session test |
| PRODUCTION_COMMIT | PARTIAL | Pages SHA verified; backend SHA inaccessible |
| BUDGET_APPLIED | VERIFIED | **NO** real family budget changes; only isolated synthetic records |
| PHONE_PWA_VERIFIED | PARTIAL | Mobile Chromium and manifest pass; physical iPhone/Shortcut untested |
| ROLLBACK_AVAILABLE | PARTIAL | Pages commit retained; Vercel rollback ID from issue is unverified in this session |

Historical Vercel rollback reference supplied by the issue:
`dpl_EfDdXXQv58EeDqBXVDVqrzAJmbWq`. No deployment was promoted, overwritten or
deleted. Historical public Git objects were not rewritten. This work does not
claim that all historical artifacts have been cleared of private information.

## Remaining external gates

1. Connect Vercel with access to the specified project/team. Inspect current root,
   routing, aliases, Blob configuration and environment **key names/targets only**.
   Deploy a fresh exact-SHA preview and verify its namespace, HTTP/CORS/auth,
   conditional-write races, readback and logs using synthetic data.
2. For actual OCR only: owner approves API spending and securely provisions
   `OPENAI_API_KEY` plus `VNN_SCAN_ENABLED` in the intended preview environment.
   No paid request or key provisioning was attempted. Private originals were not
   available and no OCR-on-family-screenshots claim is made.
3. Private batch inspection requires secure authenticated read-only access; the
   explicit instruction not to modify real family data remains in force.
4. Production needs separate owner approval after cloud gates pass. Coordinate
   writer cutover: older deployments do not honor ETag fencing. Recheck backend
   rollback evidence and preserve local recovery copies before an approved release.
