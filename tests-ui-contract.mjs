import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

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
if (!app.includes("function contractWelcome()")) fail('personalized Nina/Vova greeting must remain in the home flow');
if (!app.includes('class="ct-home-mark"') || !app.includes('aria-label="VNN"')) fail('home cover must carry the VNN mark');
if (app.includes('Сегодня всё под контролем')) fail('removed productivity slogan must not return');
if (!css.includes('family-threads-dark.svg') || !css.includes('family-threads-light.svg')) fail('both theme thread assets must ship');
if (/transport-test-burst-cleaned|accidental transport burst|ww\.expenses=ww\.expenses\.filter\(x=>!ids\.has/.test(app)) fail('runtime must never auto-delete similar transport expenses');

console.log('UI contract checks PASS');

// Calendar presentation must not follow the last historical week selected.
const calendarMonth={id:'2026-10',weeks:[1,2,3,4].map(id=>({id,status:'open'}))};
const calendarScope={m:()=>calendarMonth,view:{week:1},currentWeekIndex:()=>3,lang:()=> 'ru',Intl,Date};
vm.createContext(calendarScope);
for(const [start,end] of [['function activeWeekFinal(', 'function progressFinal('],['function weekDatesFinal(', 'function secondaryBalanceFinal(']]){
  vm.runInContext(app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start))),calendarScope);
}
if(calendarScope.activeWeekFinal().id!==3)fail('home must show calendar week even when week 1 remains open');
calendarScope.view.week=4;
calendarMonth.weeks[2].status='closed';
if(calendarScope.activeWeekFinal().id!==3)fail('historical selection/closing must not advance the calendar');
for(const [month,end] of [['2026-10',31],['2026-04',30],['2026-02',28],['2028-02',29]]){
  calendarMonth.id=month;
  if(!calendarScope.weekDatesFinal(4).startsWith(`22–${end} `))fail('fourth week must include the entire month end');
}
if(!app.includes("view.week=activeWeekFinal().id;view.weekMode='detail'"))fail('home week link must open displayed calendar week');
console.log('Calendar week presentation regressions PASS');
