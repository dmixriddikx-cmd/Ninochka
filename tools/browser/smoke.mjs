import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const api=spawn(process.execPath,['--experimental-test-module-mocks',fileURLToPath(new URL('synthetic-api.mjs',import.meta.url))],{cwd:root,stdio:['ignore','pipe','inherit']});
let browser;
try{
  const [chunk]=await Promise.race([once(api.stdout,'data'),once(api,'exit').then(([code])=>{throw new Error('Synthetic API exited: '+code);})]);const {port}=JSON.parse(String(chunk));
  const browserOptions={headless:true};
  if(process.env.VNN_CHROMIUM_PATH)browserOptions.executablePath=process.env.VNN_CHROMIUM_PATH;
  browser=await chromium.launch(browserOptions);
  const errors=[];
  async function device(login){
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin==='https://ninochka-sync.vercel.app'){
        const response=await route.fetch({url:`http://127.0.0.1:${port}${url.pathname}`});
        return route.fulfill({response});
      }
      if(url.origin==='https://dmixriddikx-cmd.github.io'){
        const relative=url.pathname.replace(/^\/Ninochka\/?/,'')||'index.html';
        if(relative.includes('..'))return route.abort();
        try{let body=await readFile(root+'_site/'+relative);
          if(relative==='app.js') body=Buffer.concat([body,Buffer.from('\nglobalThis.__vnnTest={get state(){return state},get sync(){return sync},get modal(){return modal},get expenseInbox(){return expenseInbox},render,inboxRequest,refreshExpenseInbox};')]);
          const ext=relative.split('.').pop();
          const contentType={html:'text/html',js:'text/javascript',css:'text/css',webmanifest:'application/manifest+json',png:'image/png'}[ext]||'text/plain';
          return route.fulfill({body,contentType});
        }catch{return route.fulfill({status:404,body:''});}
      }
      return route.abort();
    });
    const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
    await page.goto('https://dmixriddikx-cmd.github.io/Ninochka/');
    assert.equal(await page.locator('.ct-auth-shell').count(),1);
    await page.locator('[data-sync-login]').fill(login);
    await page.locator('[data-sync-pin]').fill('synthetic-pin');
    await page.locator('[data-auth-form]').evaluate(form=>form.requestSubmit());
    await page.locator('.ct-app').waitFor();
    await page.evaluate(()=>{localStorage.setItem('ninochka-onboarding-nina','1');localStorage.setItem('ninochka-onboarding-volodymyr','1');__vnnTest.state.preferences.onboardingSeen=true;__vnnTest.render();document.querySelector('.onboarding')?.remove();});
    return page;
  }
  const nina=await device('Нина');
  const staged=await nina.evaluate(async()=>{
    const {inboxRequest}=__vnnTest;
    const date=new Date();date.setDate(14);
    const month=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
    return inboxRequest('POST',{action:'stage-recognized',items:[{id:'synthetic-browser-1',name:'Synthetic Coffee',amount:450,currency:'EUR',category:'products',date:month+'-14',bankStatus:'Completed'}]});
  });assert.equal(staged.accepted,1);
  await nina.evaluate(()=>__vnnTest.refreshExpenseInbox());
  await nina.locator('[data-inbox="review"]').click();
  const date=await nina.locator('[data-inbox-date]').inputValue();
  await nina.locator('[data-inbox-date]').fill(date.slice(0,8)+'07');
  await nina.locator('[data-inbox="apply"]').click();
  await nina.waitForFunction(()=>!__vnnTest.expenseInbox.applying&&!__vnnTest.modal.open);
  const summary=await nina.evaluate(()=>({rev:__vnnTest.sync.rev,paused:__vnnTest.sync.paused,balance:__vnnTest.state.storage.balance,rows:__vnnTest.state.months.flatMap(m=>m.weeks.flatMap(w=>w.expenses.filter(e=>e.importId==='synthetic-browser-1').map(e=>({week:w.id,date:e.date}))))}));
  assert.equal(summary.paused,false);assert.equal(summary.rows.length,1);assert.equal(summary.rows[0].week,1);
  assert.equal(summary.rows[0].date.slice(8,10),'07');assert.equal(summary.balance,-450);
  const vova=await device('Вова');
  const second=await vova.evaluate(()=>({balance:__vnnTest.state.storage.balance,rev:__vnnTest.sync.rev}));
  assert.deepEqual(second,{balance:-450,rev:summary.rev});
  const replay=await nina.evaluate(()=>__vnnTest.inboxRequest('POST',{action:'stage-recognized',items:[{id:'synthetic-browser-1',name:'Synthetic Coffee',date:new Date().toISOString().slice(0,7)+'-14',amount:450,currency:'EUR',category:'products'}]}));
  assert.equal(replay.duplicates,1);
  const pending=await nina.evaluate(()=>__vnnTest.inboxRequest('GET'));assert.equal(pending.items.length,0);
  const manifest=await nina.evaluate(async()=>{const link=document.querySelector('link[rel="manifest"]');return(await fetch(link.href)).json();});
  assert.equal(manifest.display,'standalone');assert.ok(manifest.icons.some(icon=>icon.sizes==='192x192'));assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'));
  assert.equal(await nina.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log('Mobile browser synthetic flow PASS: login → stage → date edit → confirm → negative balance → readback → second session → replay; PWA manifest and 390px layout');
}finally{await browser?.close();api.kill();}
