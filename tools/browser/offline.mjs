// Actual Service Worker/offline reload with synthetic API and synthetic login.
// No browser request is allowed to reach production or a recognition provider.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const api=spawn(process.execPath,['--experimental-test-module-mocks',fileURLToPath(new URL('synthetic-api.mjs',import.meta.url))],{cwd:root,stdio:['ignore','pipe','inherit']});
let browser, server;
try {
 const [chunk]=await once(api.stdout,'data');const {port}=JSON.parse(String(chunk));
 server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  try {
   if(url.pathname.startsWith('/api/')){
    let raw='';for await(const part of req)raw+=part;
    const response=await fetch(`http://127.0.0.1:${port}${url.pathname}`,{method:req.method,
     headers:{...req.headers,host:'127.0.0.1',origin:'https://dmixriddikx-cmd.github.io'},...(raw?{body:raw}:{})});
    res.writeHead(response.status,{'Content-Type':'application/json'});res.end(await response.text());return;
   }
   const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
   if(file.includes('..')){res.writeHead(404).end();return;}
   const body=file==='sync-config.js'?Buffer.from('globalThis.NINOCHKA_SYNC_API=location.origin;'):await readFile(root+'_site/'+file);
   const type={html:'text/html',js:'text/javascript',css:'text/css',json:'application/json',webmanifest:'application/manifest+json',svg:'image/svg+xml',png:'image/png',webp:'image/webp'}[file.split('.').pop()]||'text/plain';
   res.writeHead(200,{'Content-Type':type});res.end(body);
  } catch {res.writeHead(404).end();}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 browser=await chromium.launch({headless:true,...(process.env.VNN_CHROMIUM_PATH?{executablePath:process.env.VNN_CHROMIUM_PATH}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const base=`http://127.0.0.1:${server.address().port}`;
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(20000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);
 await page.locator('[data-sync-login]').fill('Нина');await page.locator('[data-sync-pin]').fill('synthetic-pin');
 await page.locator('[data-auth-form]').evaluate(form=>form.requestSubmit());
 await page.locator('.ct-app').waitFor();
 for(let step=0;step<4;step++)await page.locator('[data-onboard]').click();
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await page.waitForFunction(()=>localStorage.getItem('ninochka-sync-rev')!==null);
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('ninochka-v4')));
 await context.setOffline(true);await page.reload();await page.locator('.ct-app').waitFor();
 assert.equal(await page.locator('.ct-auth-shell').count(),0,'Cached authenticated copy reopens without a network');
 await page.locator('[data-final-action="quick-expense"][data-category="products"]').click();
 await page.locator('[name="amount"]').fill('2.50');await page.locator('[name="name"]').fill('Synthetic offline coffee');
 await page.locator('[data-action="expense-save"]').click();
 await page.waitForFunction(()=>localStorage.getItem('ninochka-sync-dirty')==='1');
 await page.reload();await page.locator('.ct-app').waitFor();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ninochka-v4')).months.flatMap(m=>m.weeks.flatMap(w=>w.expenses)).filter(x=>x.name==='Synthetic offline coffee').length),1);
 const financialCache=await page.evaluate(async()=>{
  const keys=await caches.keys();const urls=(await Promise.all(keys.map(async k=>(await(await caches.open(k)).keys()).map(r=>r.url)))).flat();
  return urls.some(u=>new URL(u).pathname.startsWith('/api/'));
 });assert.equal(financialCache,false,'Financial API responses are never Service Worker cache entries');
 await context.setOffline(false);await page.reload();await page.locator('.ct-app').waitFor();
 await page.waitForFunction(()=>localStorage.getItem('ninochka-sync-dirty')!=='1');
 const saved=await page.evaluate(async()=>{const r=await fetch('/api/sync',{headers:{Authorization:'Bearer '+localStorage.getItem('ninochka-sync-token')}});return r.json();});
 assert.equal(saved.data.months.flatMap(m=>m.weeks.flatMap(w=>w.expenses)).filter(x=>x.name==='Synthetic offline coffee').length,1);
 assert.equal(saved.data.storage.currency,before.storage.currency);assert.deepEqual(errors,[]);
 console.log('Offline PWA browser PASS: shell cache → offline restart → expense → second offline restart → online authenticated readback exactly once; API cache empty');
} finally {await browser?.close();server?.closeAllConnections();server?.close();api.kill();}
