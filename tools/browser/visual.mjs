// Synthetic screenshots for visual review. No request reaches production and
// no real family data or credentials are loaded into the browser.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=root+'_visual';
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
const api=spawn(process.execPath,['--experimental-test-module-mocks',fileURLToPath(new URL('synthetic-api.mjs',import.meta.url))],{cwd:root,stdio:['ignore','pipe','inherit']});
let browser;
try {
  const [chunk]=await Promise.race([once(api.stdout,'data'),once(api,'exit').then(([code])=>{throw new Error('Synthetic API exited: '+code);})]);
  const {port}=JSON.parse(String(chunk));
  browser=await chromium.launch({headless:true,...(process.env.VNN_CHROMIUM_PATH?{executablePath:process.env.VNN_CHROMIUM_PATH}:{})});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:'dark'});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin==='https://ninochka-sync.vercel.app'){
      const response=await route.fetch({url:`http://127.0.0.1:${port}${url.pathname}`});
      return route.fulfill({response});
    }
    if(url.origin==='https://dmixriddikx-cmd.github.io'){
      const relative=url.pathname.replace(/^\/Ninochka\/?/,'')||'index.html';
      if(relative.includes('..'))return route.abort();
      try {
        let body=await readFile(root+'_site/'+relative);
        if(relative==='app.js')body=Buffer.concat([body,Buffer.from('\nglobalThis.__vnnVisual={get state(){return state},render,startOnboarding(step=0){renderOnboardingFinal(step)}};')]);
        const ext=relative.split('.').pop();
        const contentType={html:'text/html',js:'text/javascript',css:'text/css',webmanifest:'application/manifest+json',svg:'image/svg+xml',png:'image/png',webp:'image/webp'}[ext]||'text/plain';
        return route.fulfill({body,contentType});
      } catch { return route.fulfill({status:404,body:''}); }
    }
    return route.abort();
  });
  const page=await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto('https://dmixriddikx-cmd.github.io/Ninochka/');
  await page.locator('.ct-auth-shell').waitFor();
  await page.screenshot({path:output+'/01-login-dark-390.png'});
  await page.locator('[data-sync-login]').fill('Нина');
  await page.locator('[data-sync-pin]').fill('synthetic-pin');
  await page.locator('[data-auth-form]').evaluate(form=>form.requestSubmit());
  await page.locator('.ct-app').waitFor();
  async function waitForOnboardingArt(){
    await page.locator('.ct-onboarding').waitFor();
    await page.evaluate(async()=>{
      const image=getComputedStyle(document.querySelector('.ct-onboarding-art')).backgroundImage;
      const urls=[...image.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(match=>match[1]);
      await Promise.all(urls.map(url=>new Promise((resolve,reject)=>{const asset=new Image();asset.onload=resolve;asset.onerror=reject;asset.src=url;})));
    });
  }
  let sequence=2;
  for(let step=1;step<=4;step++){
    await waitForOnboardingArt();
    await page.screenshot({path:`${output}/${String(sequence++).padStart(2,'0')}-onboarding-${step}-dark-390.png`});
    await page.locator('[data-onboard]').click();
  }
  await page.evaluate(()=>{__vnnVisual.state.preferences.theme='light';__vnnVisual.render();__vnnVisual.startOnboarding(0);});
  for(let step=1;step<=4;step++){
    await waitForOnboardingArt();
    await page.screenshot({path:`${output}/${String(sequence++).padStart(2,'0')}-onboarding-${step}-light-390.png`});
    await page.locator('[data-onboard]').click();
  }

  const tabs=['home','week','plan','storage','more'];
  for(const theme of ['dark','light']){
    await page.evaluate(theme=>{__vnnVisual.state.preferences.theme=theme;__vnnVisual.state.preferences.onboardingSeen=true;__vnnVisual.render();},theme);
    for(const tab of tabs){
      await page.locator(`.ct-nav [data-tab="${tab}"]`).click();
      await page.waitForTimeout(80);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${theme} ${tab} overflows 390px`);
      await page.screenshot({path:`${output}/${String(sequence++).padStart(2,'0')}-${tab}-${theme}-390.png`});
    }
  }
  await page.setViewportSize({width:320,height:844});
  for(const theme of ['dark','light']){
    await page.evaluate(theme=>{__vnnVisual.state.preferences.theme=theme;__vnnVisual.render();},theme);
    await page.locator('.ct-nav [data-tab="home"]').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${theme} home overflows 320px`);
    await page.screenshot({path:`${output}/${String(sequence++).padStart(2,'0')}-home-${theme}-320.png`});
  }
  console.log('Synthetic visual evidence PASS: login + 4 onboarding dark/light + 5 screens dark/light + 320px home; no production requests');
} finally {
  await browser?.close();
  api.kill();
}
