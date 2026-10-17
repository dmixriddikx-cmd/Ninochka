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
if (/document\.addEventListener\('click',[\s\S]{0,700}\[data-action="expense-save"\][\s\S]{0,700}\},true\);/.test(app)) fail('expense save must not be intercepted in capture phase');
if (!/if\(action==='expense-save'\)[\s\S]{0,900}core\.addExpense/.test(app)) fail('expense save path must reach core.addExpense');
if (!app.includes('<option value="${c}"')) fail('currency selector must preserve raw ISO currency codes as option values');
if (!app.includes('view.onboardingStep=Number(i)||0')) fail('onboarding step must be tracked across rerenders');
if (app.includes("data-final-action=\"reset-budget\"")) fail('production UI must not expose destructive budget reset');
if (app.includes("resetTestData(true)")) fail('production UI must not bypass reset confirmation');
if (!app.includes("['products','household','transport','clothes','leisure','health','gifts','other']")) fail('expense editor must include every active category');
if (!app.includes("!categories.includes(item.category)")) fail('expense editor must preserve unknown legacy categories');
if (!app.includes("field('subcategory'")) fail('expense editor must preserve an optional nested category');
if (!app.includes('data-final-action="income-add"')) fail('income tab must create explicit income entries');
if (/transport-test-burst-cleaned|accidental transport burst|ww\.expenses=ww\.expenses\.filter\(x=>!ids\.has/.test(app)) fail('runtime must never auto-delete similar transport expenses');

console.log('UI contract checks PASS');
