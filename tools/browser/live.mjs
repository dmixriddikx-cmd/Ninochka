// Opt-in REAL immutable preview browser checks. Synthetic fixture only; no mocks.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base=process.env.VNN_PREVIEW_URL, pin=process.env.VNN_PREVIEW_LOGIN_PIN;
const sourceSha=process.env.VNN_SOURCE_SHA;
const url=new URL(base);
assert.equal(url.origin,base);
assert.match(url.hostname,/^ninochka-sync-[a-z0-9]+-jwmhnfndnc-3728\.vercel\.app$/);
assert.ok(pin);assert.match(sourceSha,/^[a-f0-9]{40}$/);
const browser=await chromium.launch({headless:true,
 ...(process.env.VNN_CHROMIUM_PATH?{executablePath:process.env.VNN_CHROMIUM_PATH}:{}),
 ...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
const errors=[];const browsers=[];
async function device(login){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});browsers.push(context);
 const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base,{waitUntil:'networkidle'});
 assert.equal(await page.locator('.ct-auth-shell').count(),1);
 assert.equal(await page.locator('.onboarding').count(),0);
 await page.locator('[data-sync-login]').fill(login);await page.locator('[data-sync-pin]').fill(pin);
 await page.locator('[data-auth-form]').evaluate(form=>form.requestSubmit());
 const apiStatuses=[];page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apiStatuses.push({path:new URL(r.url()).pathname,status:r.status()});});
 await page.locator('.ct-app').waitFor().catch(()=>{throw new Error('Cloud browser login did not complete: '+JSON.stringify(apiStatuses));});
 for(let step=0;step<4;step++)await page.locator('[data-onboard]').click();
 await page.waitForFunction(()=>localStorage.getItem('ninochka-sync-dirty')!=='1');
 const safety=await request(page,'/api/sync');
 assert.equal(safety.status,200);assert.equal(safety.body.environment,'preview');
 assert.equal(safety.body.storageNamespace,`previews/${url.hostname}/`);
 return page;
}
async function request(page,path,method='GET',body){
 return page.evaluate(async({path,method,body})=>{
  const response=await fetch(path,{method,cache:'no-store',headers:{
   Authorization:'Bearer '+localStorage.getItem('ninochka-sync-token'),
   ...(method==='PUT'?{'X-VNN-Write-Protocol':'2'}:{}),
   ...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
 },{path,method,body});
}
try {
 const context=await browser.newContext();const probe=await context.newPage();
 await probe.goto(base+'/verification.json');
 const manifest=JSON.parse(await probe.locator('body').innerText());
 assert.equal(manifest.sourceSha,sourceSha);assert.ok(Object.keys(manifest.backendFiles).length>=10);await context.close();
 const nina=await device('Нина');
 const before=await request(nina,'/api/sync');
 const id='synthetic-live-ui-'+randomUUID();
 const row={id,name:'Synthetic UI coffee',amount:450,currency:'EUR',category:'products',date:'2026-10-14',bankStatus:'Completed'};
 const staged=await request(nina,'/api/inbox','POST',{action:'stage-recognized',items:[row]});
 assert.equal(staged.status,200);assert.equal(staged.body.accepted,1);
 // Reload obtains the genuine cloud queue through the shipped frontend.
 await nina.reload();await nina.locator('[data-inbox="review"]').waitFor();
 await nina.locator('[data-inbox="review"]').click();
 await nina.locator('[data-inbox-date="'+id+'"]').fill('2026-10-07');
 await nina.locator('[data-inbox-name="'+id+'"]').fill('Corrected synthetic UI coffee');
 await nina.locator('[data-inbox-amount="'+id+'"]').fill('5.75');
 await nina.locator('[data-inbox="apply"]').click();
 await nina.locator('#modal').waitFor({state:'hidden'});
 const saved=await request(nina,'/api/sync');assert.equal(saved.status,200);
 const entries=saved.body.data.months.flatMap(m=>m.weeks.flatMap(w=>w.expenses.filter(e=>e.importId===id).map(e=>({...e,week:w.id}))));
 assert.equal(entries.length,1);assert.equal(entries[0].week,1);assert.equal(entries[0].date.slice(0,10),'2026-10-07');
 assert.equal(entries[0].name,'Corrected synthetic UI coffee');assert.equal(entries[0].amount,575);
 assert.equal(saved.body.data.storage.balance,before.body.data.storage.balance-575);
 assert.equal((await request(nina,'/api/inbox')).body.items.filter(x=>x.id===id).length,0);
 assert.equal((await request(nina,'/api/inbox','POST',{action:'stage-recognized',items:[row]})).body.duplicates,1);
 const vova=await device('Вова');
 const second=await request(vova,'/api/sync');
 assert.deepEqual(second.body.data.months,saved.body.data.months);
 assert.deepEqual(second.body.data.storage,saved.body.data.storage);
 // Exercise real browser upload and its honest disabled-provider message.
 const screenshot=await nina.screenshot();
 await nina.locator('[data-scan-files]').setInputFiles({name:'synthetic-ui.png',mimeType:'image/png',buffer:screenshot});
 await nina.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('Распознавание ещё не подключено'));
 assert.equal((await request(nina,'/api/sync')).body.data.storage.balance,saved.body.data.storage.balance);
 assert.equal(await nina.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await nina.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 const apiCached=await nina.evaluate(async()=>{
  const urls=(await Promise.all((await caches.keys()).map(async k=>(await(await caches.open(k)).keys()).map(r=>r.url)))).flat();
  return urls.some(u=>new URL(u).pathname.startsWith('/api/'));
 });assert.equal(apiCached,false);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:'PASS',preview:url.hostname,sourceSha,viewport:'390x844',
  tests:['live UI login both accounts','genuine cloud inbox','editable date/name/amount','single confirmation','correct week','negative Storage','authenticated readback','idempotent replay','browser file upload with disabled OCR','no financial API cache','no page exceptions'],
  realOCR:false,physicalIPhone:false,familyData:'untouched'}));
} finally {await browser.close();}
