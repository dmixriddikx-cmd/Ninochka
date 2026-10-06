import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const site = path.resolve(process.argv[2] || '_site');
const nodes = [];
const app = { innerHTML: '' };
const toast = { textContent: '', hidden: true };
const modal = { open: false, innerHTML: '', querySelector: () => null, showModal(){ this.open = true; }, close(){ this.open = false; } };
const cssVariables = new Map();
const root = { dataset: {}, style: { setProperty(key, value){ cssVariables.set(key, value); } }, setAttribute(){}, lang: 'ru' };

globalThis.localStorage = new Map();
globalThis.localStorage.getItem = globalThis.localStorage.get.bind(globalThis.localStorage);
globalThis.localStorage.setItem = globalThis.localStorage.set.bind(globalThis.localStorage);
globalThis.document = {
  documentElement: root,
  body: { append(node){ nodes.push(node); } },
  querySelector(selector){
    if (selector === '#app') return app;
    if (selector === '#toast') return toast;
    if (selector === '#modal') return modal;
    return null;
  },
  querySelectorAll(){ return []; },
  createElement(){ return { className: '', innerHTML: '', remove(){} }; },
  addEventListener(){}
};
globalThis.matchMedia = () => ({ matches: true, addEventListener(){} });
globalThis.fetch = async input => {
  const relative = String(input).replace(/^\.\/assets\//, '');
  const asset = path.join(site, 'assets', relative);
  if (fs.existsSync(asset)) return { ok: true, text: async () => fs.readFileSync(asset, 'utf8') };
  return { ok: false, text: async () => '', json: async () => ({}) };
};

await import(`${pathToFileURL(path.join(site, 'app.js')).href}?runtime-smoke=1`);
await new Promise(resolve => setTimeout(resolve, 0));

if (!app.innerHTML.includes('ct-app')) throw new Error('UI runtime failed to render the contract shell');
if (!app.innerHTML.includes('ct-home-hero')) throw new Error('UI runtime did not render the approved home screen');
if (app.innerHTML.includes('storageTab')) throw new Error('UI runtime exposed an untranslated storage navigation label');
if (!nodes.some(node => node.className === 'onboarding ct-onboarding')) throw new Error('UI runtime did not render the contract onboarding');
if (root.dataset.theme !== 'dark') throw new Error('fresh installation must open in the approved dark theme');
for (const key of ['--approved-dark-hero', '--approved-light-home', '--ct-storage-art', '--ct-week-empty']) {
  if (!cssVariables.get(key)?.startsWith('url(')) throw new Error(`UI runtime did not decode ${key}`);
}

console.log('UI runtime smoke PASS');
