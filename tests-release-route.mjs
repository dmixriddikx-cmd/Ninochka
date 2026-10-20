import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const pages = await read('.github/workflows/pages.yml');
assert.match(pages, /branches: \["main"\]/);
assert.match(pages, /actions\/deploy-pages@/);
assert.match(pages, /cp contract\.css core\.js corefix\.js sync-config\.js _site\//);
assert.match(await read('sync-config.js'), /NINOCHKA_SYNC_API = 'https:\/\/ninochka-sync\.vercel\.app'/);
const paths = await import('./sync-service/lib/data-generation.js');
assert.equal(paths.BUDGET_PATH,'family-budget.json');
assert.equal(paths.INBOX_PATH,'family-expense-inbox.json');
assert.equal(paths.historyPath('before.json'),'history/before.json');
const manifest = JSON.parse(await read('manifest.webmanifest'));
assert.equal(manifest.start_url,'./');
assert.equal(manifest.scope,'./');
assert.equal(manifest.id,undefined);
const frontend = await read('v4/app-00.js');
const sync = await read('v4/app-sync.js');
assert.match(frontend, /const STORE='ninochka-v4'/);
for (const key of ['token','login','rev','ready','dirty']) {
  assert.ok(sync.includes(`'ninochka-sync-${key}'`));
}
assert.match(sync,/result\.writeProtocol === 2 \? 2 : 0/);
assert.match(sync,/Missing cloud document is not permission|missing cloud document is not permission/i);
const worker = await read('sw.js');
assert.match(worker,/vnn-shell-__BUILD_ID__/);
console.log('Established GitHub Pages, API, Blob, local data and PWA route PASS');
