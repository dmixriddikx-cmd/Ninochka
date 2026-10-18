import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const root = new URL('./sync-service/public/', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const config = await read('sync-config.js');
const context = {location:{origin:'https://existing-preview.vercel.app'}};
vm.runInNewContext(config, context);
assert.equal(context.NINOCHKA_SYNC_API, context.location.origin);
assert.ok(!config.includes('https://ninochka-sync.vercel.app'));
const manifest = JSON.parse(await read('manifest.webmanifest'));
assert.equal(manifest.start_url, './');
assert.equal(manifest.scope, './');
assert.equal(manifest.display, 'standalone');
assert.ok(!manifest.id, 'Do not give the existing PWA a separate clean-install identity');
for (const size of [180,192,512]) {
  const bytes = await readFile(new URL(`assets/vnn-icon-${size}.png`, root));
  assert.equal(bytes.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), size);
  assert.equal(bytes.readUInt32BE(20), size);
}
for (const file of ['index.html','sw.js']) assert.ok(!(await read(file)).includes('__BUILD_ID__'));
const sw = await read('sw.js');
const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replaceAll("'", '"'));
for (const asset of shell) await readFile(new URL(asset.replace(/\?.*$/, '').replace(/^\.\/$/, './index.html'), root));
assert.ok(sw.includes("url.pathname.includes('/api/')"), 'Never cache budget API responses');
console.log('Vercel frontend build: same-origin API, PWA identity, PNG sizes and every offline-shell asset PASS');
