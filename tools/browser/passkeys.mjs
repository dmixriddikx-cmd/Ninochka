// Genuine browser WebAuthn interaction with Chromium virtual platform authenticators.
// Synthetic accounts and mocked Blob only. Never touches Apple or production.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../../',import.meta.url));
const api=spawn(process.execPath,['--experimental-test-module-mocks',
 fileURLToPath(new URL('synthetic-api.mjs',import.meta.url))],
 {cwd:root,stdio:['ignore','pipe','inherit']});
let browser;
try {
 const [chunk]=await Promise.race([
   once(api.stdout,'data'),
   once(api,'exit').then(([code])=>{throw new Error('Synthetic API exited: '+code);})
 ]);
 const {port}=JSON.parse(String(chunk));
 const launch={headless:true};
 if(process.env.VNN_CHROMIUM_PATH)launch.executablePath=process.env.VNN_CHROMIUM_PATH;
 browser=await chromium.launch(launch);
 const failures=[];
 const actors=[];
 async function device(login,expectedActor) {
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
   await context.route('**/*', async route=>{
     const url=new URL(route.request().url());
     if(url.origin==='https://ninochka-sync.vercel.app') {
       const response=await route.fetch({url:'http://127.0.0.1:'+port+url.pathname});
       return route.fulfill({response});
     }
     if(url.origin==='https://dmixriddikx-cmd.github.io') {
       const relative=url.pathname.replace(/^\/Ninochka\/?/,'')||'index.html';
       if(relative.includes('..'))return route.abort();
       try{
         let body=await readFile(root+'_site/'+relative);
         if(relative==='app.js')body=Buffer.concat([body,Buffer.from(
           '\nglobalThis.__vnnWebAuthnTest={get actor(){return sync.actor},openMore(){view.tab="more";render();}};'
         )]);
         const ext=relative.split('.').pop();
         const contentType={html:'text/html',js:'text/javascript',css:'text/css',
           webmanifest:'application/manifest+json',png:'image/png'}[ext]||'text/plain';
         return route.fulfill({body,contentType});
       }catch{return route.fulfill({status:404,body:''});}
     }
     return route.abort();
   });
   const page=await context.newPage();
   const cdp=await context.newCDPSession(page);
   await cdp.send('WebAuthn.enable');
   const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{
     protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,
     isUserVerified:true,automaticPresenceSimulation:true
   }});
   page.setDefaultTimeout(30000);
   page.on('pageerror',e=>failures.push(e.message));
   await page.goto('https://dmixriddikx-cmd.github.io/Ninochka/');
   assert.equal(await page.locator('.ct-auth-shell').count(),1);
   assert.equal(await page.locator('[data-auth-passkey]').count(),1,'Face ID button must be visible');
   await page.locator('[data-sync-login]').fill(login);
   await page.locator('[data-sync-pin]').fill('synthetic-pin');
   await page.locator('[data-auth-form]').evaluate(form=>form.requestSubmit());
   await page.locator('.ct-app').waitFor();
   assert.equal(await page.evaluate(()=>__vnnWebAuthnTest.actor),expectedActor);
   await page.evaluate(()=>__vnnWebAuthnTest.openMore());
   await page.locator('[data-passkey-pin]').fill('synthetic-pin');
   await page.locator('[data-passkey-register]').click();
   await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('Ключ доступа сохранён'),
     {timeout:30000});
   // The newly minted private key stays inside the virtual authenticator.
   const saved=await cdp.send('WebAuthn.getCredentials',{authenticatorId});
   assert.equal(saved.credentials.length,1);
   await page.locator('[data-passkey-manage]').click();
   await page.locator('[data-passkey-remove]').waitFor();
   await page.locator('[data-passkey-manage]').count();
   await page.evaluate(()=>{document.querySelector('#modal')?.querySelector('.close')?.click();});
   // Logout must not revoke the passkey. The next login uses its ECDSA signature.
   await page.locator('[data-sync="logout"]').click();
   await page.locator('.ct-auth-shell').waitFor();
   await page.locator('[data-auth-passkey]').click();
   await page.locator('.ct-app').waitFor();
   assert.equal(await page.evaluate(()=>__vnnWebAuthnTest.actor),expectedActor);
   actors.push(expectedActor);
   await context.close();
 }
 await device('Нина','nina');
 await device('Вова','volodymyr');
 assert.deepEqual(actors,['nina','volodymyr']);
 assert.deepEqual(failures,[]);
 console.log('PASS: real virtual WebAuthn registration and passwordless login on mobile Chromium for Nina and Vova; no production data.');
} finally {
 await browser?.close();
 api.kill();
}
