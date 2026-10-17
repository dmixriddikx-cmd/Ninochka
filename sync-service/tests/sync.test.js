import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';

// In-memory model of Blob's server-side conditional-write contract. No remote I/O.
const documents = new Map();
let serial = 0;
let beforeWrite = null;
let afterWrite = null;
class BlobPreconditionFailedError extends Error {}
mock.module('@vercel/blob', { exports: {
  BlobPreconditionFailedError,
  get: async (path, options) => {
    assert.equal(options.headers?.['accept-encoding'],'identity','CAS reads must retain the stored representation ETag');
    const found = documents.get(path);
    return found ? { stream: new Response(found.body).body, blob: { etag: found.etag } } : null;
  },
  put: async (path, body, options) => {
    if (beforeWrite && !path.includes('history/')) await beforeWrite(path);
    const current = documents.get(path);
    if ((options.ifMatch && current?.etag !== options.ifMatch) ||
        (options.allowOverwrite === false && current)) throw new BlobPreconditionFailedError();
    assert.ok(options.ifMatch || options.allowOverwrite === false || path.includes('history/'), 'no unconditional document overwrites');
    documents.set(path, { body, etag: 'etag-' + (++serial) });
    if (afterWrite && !path.includes('history/')) await afterWrite(path);
  }
}});
const { default: sync } = await import('../api/sync.js');
const { default: inbox } = await import('../api/inbox.js');
const { storagePath, readDocument, replaceDocument, WriteConflict } = await import('../lib/blob-store.js');
const origin = 'https://dmixriddikx-cmd.github.io';
process.env.NINOCHKA_SESSION_SECRET = 'synthetic-session-secret';
process.env.NINOCHKA_INBOX_INGEST_TOKEN = 'synthetic-ingest';
const token = (actor='nina', purpose='session', expiresAt=Date.now()+3600000) => {
  const payload = Buffer.from(JSON.stringify({actor,purpose,expiresAt})).toString('base64url');
  return payload+'.'+createHmac('sha256',process.env.NINOCHKA_SESSION_SECRET).update(payload).digest('base64url');
};
async function call(handler, method, body, auth=token(), source=origin, protocol='2') {
  const result = { statusCode:200, headers:{} };
  const res = { status(n){result.statusCode=n;return this;},setHeader(k,v){result.headers[k]=v;return this;},
    json(value){result.body=value;return this;},end(){return this;} };
  await handler({ method, body, headers:{...(source?{origin:source}:{}),authorization:'Bearer '+auth,...(protocol?{'x-vnn-write-protocol':protocol}:{})} },res);
  return result;
}
function budget() { return {schemaVersion:4,months:[{id:'2026-10',weeks:[1,2,3,4].map(id=>({id,status:'closed',fund:{amount:0,currency:'EUR',rate:1},expenses:[],settlement:0}))}],storage:{balance:0,currency:'EUR',history:[]},rates:{USD_EUR:{value:0.9}}}; }
function barrier(count) {
  let arrived=0, release;
  const ready=new Promise(ok=>release=ok);
  return async()=>{ if (++arrived===count) release(); if(arrived<=count) await ready; };
}
const row = id => ({id,name:'Synthetic Coffee',date:'2026-10-14',amount:450,currency:'EUR',category:'products',bankStatus:'Completed'});

test('auth, CORS, login, token separation and invalid payloads', async()=>{
  process.env.NINA_CREDENTIAL_SHA256=createHash('sha256').update('нина\0synthetic-pin').digest('hex');
  assert.equal((await call(sync,'POST',{action:'login',login:'Нина',pin:'synthetic-pin'})).statusCode,200);
  assert.equal((await call(sync,'POST',{action:'login',login:'Нина',pin:'wrong'})).statusCode,401);
  assert.equal((await call(sync,'GET',null,token(),'https://evil.example')).statusCode,403);
  assert.equal((await call(sync,'GET',null,'bad')).statusCode,401);
  assert.equal((await call(sync,'GET',null,token('nina','session',0))).statusCode,401);
  assert.equal((await call(sync,'GET',null,token('nina','quick-expense'))).statusCode,401);
  assert.equal((await call(inbox,'GET',null,token('nina','quick-expense'))).statusCode,401);
  assert.equal((await call(sync,'PUT',{rev:null,data:budget()})).statusCode,400);
  assert.equal((await call(sync,'PUT',{rev:0,data:{version:4}})).statusCode,400);
  const fiveWeeks=budget();fiveWeeks.months[0].weeks.push({...fiveWeeks.months[0].weeks[0],id:5});
  assert.equal((await call(sync,'PUT',{rev:0,data:fiveWeeks})).statusCode,400);
  const badMoney=budget();badMoney.storage.balance=0.1;
  assert.equal((await call(sync,'PUT',{rev:0,data:badMoney})).statusCode,400);
  const options=await call(sync,'OPTIONS');
  assert.equal(options.statusCode,204);
  assert.equal(options.headers['Access-Control-Allow-Origin'],origin);
  assert.ok(options.headers['Access-Control-Allow-Headers'].includes('X-VNN-Write-Protocol'));
});

test('concurrent first creates and updates have one winner and preserve revision',async()=>{
  documents.clear(); beforeWrite=barrier(2);
  const first=await Promise.all([call(sync,'PUT',{rev:0,data:budget()}),call(sync,'PUT',{rev:0,data:budget()},token('volodymyr'))]);
  beforeWrite=null;
  assert.deepEqual(first.map(x=>x.statusCode).sort(),[200,409]);
  beforeWrite=barrier(2);
  const updates=await Promise.all([11,22].map(balance=>call(sync,'PUT',{rev:1,data:{...budget(),storage:{...budget().storage,balance}}})));
  beforeWrite=null;
  assert.deepEqual(updates.map(x=>x.statusCode).sort(),[200,409]);
  const winner=updates.find(x=>x.statusCode===200);
  assert.equal(winner.body.rev,2);
  const nina=await call(sync,'GET'); const vova=await call(sync,'GET',null,token('volodymyr'));
  assert.deepEqual(nina.body.data,vova.body.data);
  assert.equal(nina.body.rev,2);
});

test('stale snapshot cannot overwrite a newer document, including after arbitrary delay',async()=>{
  const old=await readDocument('generation-2/family-budget.json');
  const current={...old.data,rev:old.data.rev+1};
  await replaceDocument('generation-2/family-budget.json',old,current);
  await assert.rejects(replaceDocument('generation-2/family-budget.json',old,{...old.data,rev:999}),WriteConflict);
  assert.equal((await readDocument('generation-2/family-budget.json')).data.rev,current.rev);
});

test('legacy immutable deployments are isolated from generation 2 family data',async()=>{
  documents.clear();
  const legacy={rev:43,data:{...budget(),storage:{...budget().storage,balance:111}},updatedBy:'legacy'};
  await replaceDocument('family-budget.json',{data:null,etag:null},legacy);
  const current={...budget(),storage:{...budget().storage,balance:222}};
  assert.equal((await call(sync,'PUT',{rev:0,data:current})).statusCode,200);
  const legacySnapshot=await readDocument('family-budget.json');
  await replaceDocument('family-budget.json',legacySnapshot,{...legacySnapshot.data,rev:44,
    data:{...legacySnapshot.data.data,storage:{...legacySnapshot.data.data.storage,balance:999}}});
  const response=await call(sync,'GET');
  assert.equal(response.statusCode,200);
  assert.equal(response.body.rev,1);
  assert.equal(response.body.data.storage.balance,222,
    'A write through an old immutable backend can only change the legacy object');
  assert.equal((await readDocument('family-budget.json')).data.data.storage.balance,999);
});

test('concurrent quick adds recompute, retry is idempotent, negative FX balance is exact',async()=>{
  documents.clear(); await call(sync,'PUT',{rev:0,data:budget()});
  const quick=token('nina','quick-expense');
  const payload={action:'quick-add',id:'synthetic-001',date:'2026-10-14',amount:'4.50',currency:'USD'};
  beforeWrite=barrier(2);
  const result=await Promise.all([call(sync,'POST',payload,quick,null),call(sync,'POST',payload,quick,null)]);
  beforeWrite=null;
  assert.ok(result.every(x=>x.statusCode===200));
  assert.equal(result.filter(x=>x.body.duplicate).length,1);
  assert.equal((await call(sync,'POST',payload,quick,null)).body.duplicate,true);
  const saved=(await call(sync,'GET')).body;
  assert.equal(saved.rev,2); assert.equal(saved.data.storage.balance,-405);
  assert.equal(saved.data.months[0].weeks[1].expenses.length,1);
  assert.equal((await call(sync,'POST',payload,token('nina','quick-expense',0),null)).statusCode,401);
});

test('inbox concurrent stage, replay, filtering, acknowledgement and readback',async()=>{
  documents.clear(); const ingest='synthetic-ingest';
  beforeWrite=barrier(2);
  const batches=await Promise.all(['synthetic-1','synthetic-2'].map(id=>call(inbox,'POST',{items:[row(id)]},ingest,null)));
  beforeWrite=null;
  assert.ok(batches.every(x=>x.statusCode===200));
  let pending=await call(inbox,'GET'); assert.equal(pending.body.items.length,2);
  const replay=await call(inbox,'POST',{items:[row('synthetic-1')]},ingest,null);
  assert.equal(replay.body.duplicates,1);
  const statuses=['Declined','Failed','Pending','unknown'];
  const filtered=await call(inbox,'POST',{items:statuses.map((bankStatus,i)=>({...row('filtered-'+i),bankStatus}))},ingest,null);
  assert.equal(filtered.body.accepted,0);
  assert.equal(filtered.body.skippedDeclined,2); assert.equal(filtered.body.skippedUnsettled,2);
  assert.equal((await call(inbox,'POST',{items:[{...row('invalid-1'),date:'2026-02-30'}]},ingest,null)).statusCode,400);
  assert.ok(!documents.has('generation-2/family-budget.json'),'staging never debits budget');
  assert.equal((await call(inbox,'PATCH',{ids:['synthetic-1']})).statusCode,409,'Unconfirmed purchases cannot disappear');
  const confirmed=budget();
  confirmed.months[0].weeks[1].expenses.push({...row('synthetic-1'),importId:'synthetic-1',rate:1});
  assert.equal((await call(sync,'PUT',{rev:0,data:confirmed})).statusCode,200);
  assert.equal((await call(inbox,'PATCH',{ids:['synthetic-1']})).statusCode,200);
  assert.equal((await call(inbox,'PATCH',{ids:['synthetic-1']})).statusCode,200);
  pending=await call(inbox,'GET'); assert.deepEqual(pending.body.items.map(x=>x.id),['synthetic-2']);
  assert.equal((await call(inbox,'POST',{items:[row('synthetic-1')]},ingest,null)).body.duplicates,1,'Acknowledged tombstones preserve replay protection');
});

test('preview paths and historical seeds cannot touch family documents',async()=>{
  const productionBefore=structuredClone(documents.get('generation-2/family-budget.json'));
  const productionToken=token();
  process.env.VERCEL_ENV='preview'; delete process.env.VERCEL_URL;
  assert.throws(()=>storagePath('generation-2/family-budget.json'),/preview_storage_not_isolated/);
  process.env.VERCEL_URL='synthetic-preview.vercel.app';
  process.env.NINOCHKA_PREVIEW_SESSION_SECRET='separate-synthetic-preview-secret';
  const payload=Buffer.from(JSON.stringify({actor:'nina',expiresAt:Date.now()+3600000})).toString('base64url');
  const previewToken=payload+'.'+createHmac('sha256',process.env.NINOCHKA_PREVIEW_SESSION_SECRET).update(payload).digest('base64url');
  process.env.NINOCHKA_INBOX_INITIAL_BATCH=JSON.stringify([row('private-seed-do-not-copy')]);
  try {
    assert.equal((await call(inbox,'GET',null,productionToken)).statusCode,401);
    assert.equal((await call(inbox,'POST',{items:[row('production-token-denied')]},'synthetic-ingest',null)).statusCode,401);
    assert.equal((await call(inbox,'GET',null,previewToken)).body.items.length,0);
    const result=await call(sync,'PUT',{rev:0,data:budget()},previewToken); assert.equal(result.statusCode,200);
    assert.ok(documents.has('previews/synthetic-preview.vercel.app/generation-2/family-budget.json'));
    assert.deepEqual(documents.get('generation-2/family-budget.json'),productionBefore,'Production document remains byte-for-byte unchanged');
  } finally {delete process.env.VERCEL_ENV;delete process.env.VERCEL_URL;delete process.env.NINOCHKA_INBOX_INITIAL_BATCH;delete process.env.NINOCHKA_PREVIEW_SESSION_SECRET;}
});

test('signed manual corrections round trip without rejecting the existing budget',async()=>{
  documents.clear();
  const data=budget();
  data.months[0].weeks[0].expenses.push({amount:-500,currency:'EUR',rate:1,name:'Synthetic refund'});
  assert.equal((await call(sync,'PUT',{rev:0,data})).statusCode,200);
  assert.equal((await call(sync,'GET')).body.data.months[0].weeks[0].expenses[0].amount,-500);
  data.months[0].weeks[0].fund.amount=-1;
  assert.equal((await call(sync,'PUT',{rev:1,data})).statusCode,400,'fund allocations remain nonnegative');
});

test('nested category and explicit income metadata survive both family sessions',async()=>{
  documents.clear();
  const data=budget();
  data.months[0].weeks[0].expenses.push({amount:500,currency:'EUR',rate:1,name:'Synthetic groceries',category:'products',subcategory:'Супермаркет'});
  data.storage.history.push({id:'synthetic-income',type:'income',amount:10000,currency:'EUR',converted:10000,note:'Synthetic income',date:'2026-10-17T12:00:00.000Z',actor:'nina'});
  assert.equal((await call(sync,'PUT',{rev:0,data},token('nina'))).statusCode,200);
  const nina=await call(sync,'GET',null,token('nina'));
  const vova=await call(sync,'GET',null,token('volodymyr'));
  assert.deepEqual(nina.body.data,vova.body.data);
  assert.equal(vova.body.data.months[0].weeks[0].expenses[0].subcategory,'Супермаркет');
  assert.equal(vova.body.data.storage.history[0].type,'income');
});

test('ambiguous storage success retries read the winning IDs instead of debiting again',async()=>{
  documents.clear();await call(sync,'PUT',{rev:0,data:budget()});
  class BlobNetworkError extends Error {}
  afterWrite=async()=>{afterWrite=null;throw new BlobNetworkError('Synthetic lost write response');};
  const payload={action:'quick-add',id:'synthetic-lost-response',date:'2026-10-14',amount:'4.50',currency:'USD'};
  const quick=await call(sync,'POST',payload,token('nina','quick-expense'),null);
  assert.equal(quick.statusCode,200);assert.equal(quick.body.duplicate,true);
  const saved=(await call(sync,'GET')).body;
  assert.equal(saved.rev,2);assert.equal(saved.data.storage.balance,-405);
  assert.equal(saved.data.months[0].weeks[1].expenses.length,1);
  afterWrite=async()=>{afterWrite=null;throw new BlobNetworkError('Synthetic lost stage response');};
  const staged=await call(inbox,'POST',{action:'stage-recognized',items:[row('synthetic-lost-stage')]});
  assert.equal(staged.statusCode,200);assert.equal(staged.body.duplicates,1);
  assert.equal((await call(inbox,'GET')).body.items.length,1);
});


test('exact-preview browser GET without Origin is accepted only with matching fetch metadata',async()=>{
  const {browserOrigin}=await import('../lib/browser-origin.js');
  process.env.VERCEL_ENV='preview';process.env.VERCEL_URL='synthetic-preview.vercel.app';
  const req={method:'GET',headers:{host:process.env.VERCEL_URL,referer:'https://synthetic-preview.vercel.app/', 'sec-fetch-site':'same-origin'}};
  try {
    assert.equal(browserOrigin(req),'https://synthetic-preview.vercel.app');
    assert.equal(browserOrigin({...req,headers:{...req.headers,origin:'https://evil.example'}}),null);
    for(const [key,value] of [['host','evil.example'],['referer','https://evil.example/'],['referer','invalid'],['sec-fetch-site','cross-site']])
      assert.equal(browserOrigin({...req,headers:{...req.headers,[key]:value}}),null);
    assert.equal(browserOrigin({...req,method:'POST'}),null);
    assert.equal(browserOrigin({...req,headers:{host:req.headers.host}}),null);
    process.env.VERCEL_ENV='production';assert.equal(browserOrigin(req),null);
  } finally {delete process.env.VERCEL_ENV;delete process.env.VERCEL_URL;}
});

test('legacy snapshot writers cannot replace a newer budget, even with a current revision',async()=>{
  documents.clear();
  await call(sync,'PUT',{rev:0,data:budget()});
  const before=structuredClone([...documents.entries()]);
  for(const protocol of [null,'1']){
    const response=await call(sync,'PUT',{rev:1,data:{...budget(),storage:{...budget().storage,balance:999}}},token(),origin,protocol);
    assert.equal(response.statusCode,426);assert.equal(response.body.error,'client_upgrade_required');
    assert.deepEqual([...documents.entries()],before,'Rejected legacy write must not archive or replace data');
  }
  assert.equal((await call(sync,'GET')).body.rev,1);
  assert.equal((await call(sync,'PUT',{rev:1,data:budget()})).statusCode,200);
});
