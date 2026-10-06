import fs from 'node:fs';
import path from 'node:path';

const site = process.argv[2] || '_site';
const read = file => fs.readFileSync(path.join(site, file), 'utf8');
const fail = message => { throw new Error(`UI contract failed: ${message}`); };

const html = read('index.html');
const css = read('contract.css');
const app = read('app.js');

if ((html.match(/rel="stylesheet"/g) || []).length !== 1) fail('exactly one stylesheet must be shipped');
if (!html.includes('contract.css?v=') || !html.includes('app.js?v=')) fail('assets require a build-specific cache key');
if (/styles\.css|final-theme\.css|final-approved|week-polish/.test(html)) fail('legacy stylesheet is still published');
for (const marker of ['ct-home-hero', 'ct-week-page', 'ct-storage-hero', 'ct-onboarding']) {
  if (!css.includes(marker)) fail(`missing ${marker} styles`);
}
for (const marker of ['function resolvedDarkFinal', 'function activeWeekFinal', 'function renderOnboardingFinal', 'data-final-action']) {
  if (!app.includes(marker)) fail(`missing runtime ${marker}`);
}
if (app.lastIndexOf('render=function') < app.lastIndexOf('function contractHome')) fail('contract renderer is not the final renderer');

console.log('UI contract checks PASS');
