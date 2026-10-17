// Explicit opt-in live verification. Synthetic records ONLY, on a fresh immutable
// preview that proves its own isolated storage namespace before the first write.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as core from '../corefix.js';
const base = process.env.VNN_PREVIEW_URL;
const pin = process.env.VNN_PREVIEW_LOGIN_PIN;
const url = new URL(base);
assert.match(url.hostname, /^ninochka-sync-[a-z0-9]+-jwmhnfndnc-3728\.vercel\.app$/);
assert.equal(url.origin, base); assert.ok(pin, 'Set the synthetic preview PIN privately');
const origin = 'https://dmixriddikx-cmd.github.io';
let checks = 0;
async function call(path, method='GET', body, token, source=origin) {
  const response = await fetch(base+path, {method, signal:AbortSignal.timeout(25000),
    headers:{...(source?{Origin:source}:{}),...(method==='PUT'?{'X-VNN-Write-Protocol':'2'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json().catch(()=>({})),headers:response.headers};
}
function status(response, expected) {assert.equal(response.status,expected); checks++;return response.body;}
const session = async login => status(await call('/api/sync','POST',{action:'login',login,pin}),200).token;
status(await call('/api/sync'),401);
status(await call('/api/inbox'),401);
status(await call('/api/recognize','POST',{}),401);
status(await call('/api/sync','GET',undefined,undefined,'https://evil.example'),403);
const preflight=await call('/api/sync','OPTIONS');
assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
assert.ok(preflight.headers.get('access-control-allow-headers').toLowerCase().includes('x-vnn-write-protocol'));checks+=2;
status(await call('/api/sync','POST',{action:'login',login:'Нина',pin:'synthetic-wrong-pin'}),401);
const nina=await session('Нина'), vova=await session('Вова');
const before=status(await call('/api/sync','GET',undefined,nina),200);
assert.equal(before.environment,'preview');
assert.equal(before.storageNamespace,`previews/${url.hostname}/`);
assert.equal(before.rev,0,'Use a NEW preview, never overwrite an existing dataset');
assert.equal(before.data,null);checks+=4;
const data=core.createState();data.months=[core.blankMonth('2026-10')];data.storage.balance=0;
for(const week of data.months[0].weeks){week.fund={amount:0,currency:'EUR',rate:1};core.closeWeek(data,week);}
// Exercise the stored-object ETag on a budget large enough for compression.
for(let i=0;i<400;i++)core.addExpense(data,data.months[0].weeks[3],{
 name:'Synthetic compression probe '+i+' '+'.'.repeat(80),amount:'0.01',currency:'EUR',category:'other'});
const budgetBytes=Buffer.byteLength(JSON.stringify(data));
assert.ok(budgetBytes>65536 && budgetBytes<1024*1024);checks++;
core.setRate(data,'USD','EUR',0.9);core.setRate(data,'MDL','EUR',0.05);core.setRate(data,'UAH','EUR',0.02);
status(await call('/api/sync','PUT',{rev:0,data},nina),200);
const legacy=await fetch(base+'/api/sync',{method:'PUT',signal:AbortSignal.timeout(25000),headers:{Origin:origin,Authorization:'Bearer '+nina,'Content-Type':'application/json'},body:JSON.stringify({rev:1,data})});
assert.equal(legacy.status,426);assert.equal((await legacy.json()).error,'client_upgrade_required');checks+=2;
const concurrent=await Promise.all([nina,vova].map((token,i)=>call('/api/sync','PUT',{rev:1,data:{...data,storage:{...data.storage,balance:i+1}}},token)));
assert.deepEqual(concurrent.map(x=>x.status).sort(),[200,409]);checks++;
let saved=status(await call('/api/sync','GET',undefined,nina),200);
assert.equal(saved.rev,2);checks++;
const rows=[1,2].map(i=>({id:'synthetic-live-'+i,name:'Synthetic Coffee',amount:450,currency:'EUR',category:'products',date:'2026-10-14',bankStatus:'Completed'}));
let staged=status(await call('/api/inbox','POST',{action:'stage-recognized',items:[...rows,{...rows[0],id:'synthetic-declined',bankStatus:'Declined'},{...rows[0],id:'synthetic-pending',bankStatus:'Pending'}]},nina),200);
assert.equal(staged.accepted,2);assert.equal(staged.skippedDeclined,1);assert.equal(staged.skippedUnsettled,1);checks+=3;
status(await call('/api/inbox','PATCH',{ids:rows.map(x=>x.id)},nina),409);
staged=status(await call('/api/inbox','POST',{action:'stage-recognized',items:rows},vova),200);
assert.equal(staged.accepted,0);assert.equal(staged.duplicates,2);checks+=2;
let pending=status(await call('/api/inbox','GET',undefined,vova),200);assert.equal(pending.items.length,2);checks++;
// Emulate a deliberate user review: move the first purchase from week 2 to week 1.
for(const [i,item] of rows.entries()){
 const date=i===0?'2026-10-07':item.date;const week=saved.data.months[0].weeks[i];
 const row=core.addExpense(saved.data,week,{...item,amount:core.moneyInput(item.amount)});
 row.importId=item.id;row.date=date+'T12:00:00.000Z';row.actor='nina';
}
status(await call('/api/sync','PUT',{rev:saved.rev,data:saved.data},nina),200);
let confirmed=status(await call('/api/sync','GET',undefined,vova),200);
assert.equal(confirmed.data.storage.balance,saved.data.storage.balance);
assert.equal(confirmed.data.months[0].weeks[0].expenses[0].date.slice(0,10),'2026-10-07');checks+=2;
status(await call('/api/inbox','PATCH',{ids:rows.map(x=>x.id)},nina),200);
assert.equal(status(await call('/api/inbox','GET',undefined,vova),200).items.length,0);checks++;
assert.equal(status(await call('/api/inbox','POST',{action:'stage-recognized',items:rows},vova),200).duplicates,2);checks++;
const quick=status(await call('/api/sync','POST',{action:'quick-token'},nina),200).token;
status(await call('/api/sync','GET',undefined,quick),401);
status(await call('/api/inbox','GET',undefined,quick),401);
status(await call('/api/recognize','POST',{},quick),401);
const payload={action:'quick-add',id:randomUUID(),date:'2026-10-14',amount:'4.50',currency:'USD'};
const result=await Promise.all([call('/api/sync','POST',payload,quick,null),call('/api/sync','POST',payload,quick,null)]);
result.forEach(r=>status(r,200));assert.equal(result.filter(x=>x.body.duplicate).length,1);checks++;
assert.equal(status(await call('/api/sync','POST',payload,quick,null),200).duplicate,true);checks++;
const after=status(await call('/api/sync','GET',undefined,vova),200);
assert.equal(after.data.storage.balance,confirmed.data.storage.balance-405);assert.equal(after.rev,confirmed.rev+1);checks+=2;
// Reversible synthetic rollback via the same revision guard, never by deleting Blob.
status(await call('/api/sync','PUT',{rev:after.rev,data:confirmed.data},nina),200);
assert.deepEqual(status(await call('/api/sync','GET',undefined,vova),200).data,confirmed.data);checks++;
status(await call('/api/sync','PUT',{rev:after.rev,data:after.data},vova),409);
status(await call('/api/recognize','POST',{},nina),503); // No paid request.
console.log(JSON.stringify({status:'PASS',checks,budgetBytes,preview:url.hostname,namespace:before.storageNamespace,
  provider:'disabled; no paid request',familyData:'untouched',tests:['auth','CORS','two accounts','Blob read/write/readback','conditional-write race','inbox staging','declined/pending filtering','unconfirmed acknowledgment rejection','date correction','idempotency','restricted Quick Add','concurrent retries','negative FX balance','synthetic rollback']},null,2));
