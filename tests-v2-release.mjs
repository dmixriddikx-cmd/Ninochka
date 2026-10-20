import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'_site');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const js=read('app.js'),css=read('contract.css'),html=read('index.html');
const check=(truth,message)=>{if(!truth)throw new Error('VNN V2 regression: '+message)};
for(const marker of ['function v2AddPage','ct-v2-weekgrid','ct-v2-chart','ct-v2-picture','ct-v2-nav','data-tab="add"','data-inbox="review"','data-scan-files','data-action="expense-add"','data-final-action="income-add"']){
  check(js.includes(marker),marker+' missing in deployed JavaScript');
}
for(const marker of ['.ct-v2-weekgrid','.ct-v2-tilegrid','.ct-v2-chart-row','.ct-v2-nav','.ct-v2-fab','.ct-v2-add-option','@media(max-width:360px)']){
  check(css.includes(marker),marker+' missing in deployed CSS');
}
check(css.includes('overflow-x:clip'),'mobile horizontal overflow safeguard missing');
check(js.includes("view.tab='home';render()")||js.includes("view.tab='home'; render()"),'expense confirmation redirect missing');
check(js.includes("view.tab='storage';render()"),'storage confirmation redirect missing');
check(js.includes("const v2OldApplyInbox=applyExpenseInbox"),'OCR final confirmation redirect missing');
check((html.match(/rel="stylesheet"/g)||[]).length===1,'must keep one bundled stylesheet');
check(!js.includes('resetTestData(true)'),'unapproved reset surfaced');
check(js.includes("if(!sync.connected||sync.paused)return notify"),'existing OCR auth gate must remain');
console.log('VNN V2 compiled UX invariants PASS');
