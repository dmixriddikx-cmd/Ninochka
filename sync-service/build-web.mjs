// Build the existing VNN frontend beside its API, without contacting any data store.
import {readFile, writeFile, mkdir, cp, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('./public/', import.meta.url));
let build = process.env.VERCEL_GIT_COMMIT_SHA;
if (!build) build = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding:'utf8'}).trim();
if (!/^[a-f0-9]{7,40}$/.test(build)) throw new Error('Invalid build revision');
build = build.slice(0, 12);
// Fail before changing output when Vercel excludes files outside its root directory.
await readFile(root + 'v4/app-00.js');
await rm(output, {recursive:true, force:true});
await mkdir(output, {recursive:true});
for (const file of ['index.html','sw.js','contract.css','core.js','corefix.js','manifest.webmanifest']) {
  const content = await readFile(root + file, 'utf8');
  await writeFile(output + file, content.replaceAll('__BUILD_ID__', build));
}
await cp(root + 'assets', output + 'assets', {recursive:true});
for (const size of [180,192,512]) {
  const encoded = await readFile(root + `assets/vnn-icon-${size}.png.b64`, 'utf8');
  await writeFile(output + `assets/vnn-icon-${size}.png`, Buffer.from(encoded, 'base64'));
  await rm(output + `assets/vnn-icon-${size}.png.b64`);
}
const parts = ['00','01','02','03','04','05','contract','sync','inbox','quick','scan'];
await writeFile(output + 'app.js', (await Promise.all(parts.map(p => readFile(root + `v4/app-${p}.js`, 'utf8')))).join('\n'));
// Preview must never send its test sessions or records to the production API.
await writeFile(output + 'sync-config.js', 'globalThis.NINOCHKA_SYNC_API = location.origin;\n');
await writeFile(output + 'version.json', JSON.stringify({commit:build}));
console.log(`Built existing VNN frontend ${build} in sync-service/public`);
