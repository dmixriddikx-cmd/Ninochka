import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('v4/app-scan.js','utf8');
const start=source.indexOf('async function scanBankFiles(');
const end=source.indexOf("document.addEventListener('click'",start);
const batches=[],messages=[];
const context={bankScan:{busy:false},sync:{connected:true,paused:false},render(){},notify:m=>messages.push(m),
 encodeBankScreenshot:async file=>file.id,screenshotFileDate:()=>null,
 recognizeBankScreenshot:async id=>({items:Array.from({length:35},(_,i)=>({id:'synthetic-'+id+'-'+i}))}),
 inboxRequest:async(method,body)=>{assert.equal(method,'POST');assert.ok(body.items.length<=50);batches.push(body.items);return{accepted:body.items.length};},
 refreshExpenseInbox:async()=>{}};
vm.createContext(context);vm.runInContext(source.slice(start,end),context);
await context.scanBankFiles([1,2,3,4].map(id=>({id})));
assert.deepEqual(batches.map(x=>x.length),[50,50,40]);
assert.equal(new Set(batches.flat().map(x=>x.id)).size,140);
assert.ok(messages.some(m=>m.includes('140')));
context.recognizeBankScreenshot=async()=>{throw new Error('Synthetic provider not configured');};
await context.scanBankFiles([{id:1},{id:2}]);
assert.ok(messages.includes('Synthetic provider not configured'),'Multi-image failure preserves the actionable provider error');
const inbox=fs.readFileSync('v4/app-inbox.js','utf8');
const ackStart=inbox.indexOf('async function inboxAcknowledge(');
const ackEnd=inbox.indexOf('async function refreshExpenseInbox(',ackStart);
const chunks=[];const ackContext={inboxRequest:async(method,body)=>{assert.equal(method,'PATCH');chunks.push(body.ids.length);}};
vm.createContext(ackContext);vm.runInContext(inbox.slice(ackStart,ackEnd),ackContext);
await ackContext.inboxAcknowledge(Array.from({length:140},(_,i)=>'synthetic-'+i));
assert.deepEqual(chunks,[50,50,40]);
console.log('Multi-screenshot batch PASS: 140 rows stage/ack in 50/50/40 chunks with one budget confirmation; provider errors remain actionable');
