# Ninochka shared budget API

This Vercel project serves only `/api/sync`. The existing frontend remains on GitHub Pages. It stores one JSON document in a dedicated Dropbox **App folder**; the Dropbox credentials never enter the public frontend repository or browser.

## Required setup

1. Create a Dropbox **Scoped access / App folder** API app. Enable `files.content.read` and `files.content.write`. Authorize the owner's Dropbox account with `token_access_type=offline`; obtain the refresh token through Dropbox OAuth on a private device. Never put the refresh token, app secret, or personal access keys in GitHub.
2. Create a Vercel project rooted at `sync-service/`. Set the following **Production** environment variables there:
   - `DROPBOX_APP_KEY`
   - `DROPBOX_APP_SECRET`
   - `DROPBOX_REFRESH_TOKEN`
   - `NINA_KEY_SHA256` and `VOLODYMYR_KEY_SHA256`: hex SHA-256 hashes of two different randomly generated access keys of at least 24 characters. Keep the original access keys privately with their respective users. The API hashes the supplied key and compares it with these values.
3. Deploy the API. Its GET request with a valid key should return `{ "rev": null, "data": null, "actor": "nina" }` when the Dropbox file is empty.
4. Put the API's HTTPS origin (no trailing slash) in the frontend `sync-config.js`, publish GitHub Pages, and use **Ещё → Общий бюджет** on the first device. The first device explicitly uploads its local budget. The second downloads the shared version. The first switch stores `ninochka-before-shared` as a recovery snapshot in the browser. Use **Скачать копию** for an external backup as well.

On each later write, the API uses Dropbox `mode:update` with the revision last seen by that device. A conflict returns HTTP 409 and never overwrites the remote file. The browser retains unsent local data, shows a persistent banner, and offers a download before switching to the current shared copy. Network failures leave a dirty local copy for retry.

Both devices may modify the budget. The access key determines the actor attached to new expenses and manual storage entries. Local theme, language, and onboarding settings stay on each device. The app is a family tool, not a bank ledger: do not put bank passwords or account numbers in descriptions.

Run `npm test` in this directory to exercise authentication, first write, conflict, and successful revision update.
