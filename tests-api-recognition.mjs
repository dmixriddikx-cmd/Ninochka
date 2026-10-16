import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import recognize from './sync-service/api/recognize.js';
const old={secret:process.env.NINOCHKA_SESSION_SECRET,
  enabled:process.env.VNN_SCAN_ENABLED,key:process.env.OPENAI_API_KEY};
process.env.NINOCHKA_SESSION_SECRET='test-session-secret';
function session(){
  const body=Buffer.from(JSON.stringify({actor:'nina',expiresAt:Date.now()+100000})).toString('base64url');
  const sig=createHmac('sha256',process.env.NINOCHKA_SESSION_SECRET).update(body).digest('base64url');
  return body+'.'+sig;
}
function request(image,token=session(),origin='https://dmixriddikx-cmd.github.io',captureDate=null){
  return {method:'POST',headers:{origin,authorization:'Bearer '+token},body:{image,captureDate}};
}
function fakeResponse(){
  return {statusCode:200,headers:{},status(n){this.statusCode=n;return this;},
    setHeader(k,v){this.headers[k]=v;return this;},json(x){this.data=x;return this;},
    end(){this.ended=true;return this;}};
}
const image='data:image/jpeg;base64,'+Buffer.from([255,216,255,0,0,0]).toString('base64');
let res=fakeResponse();
await recognize(request(image,session(),'https://untrusted.example'),res);
assert.equal(res.statusCode,403);
res=fakeResponse();
await recognize(request(image,'bad'),res);
assert.equal(res.statusCode,401);
delete process.env.VNN_SCAN_ENABLED;
res=fakeResponse();
await recognize(request(image),res);
assert.equal(res.statusCode,503);
assert.equal(res.data.error,'scan_not_configured');

process.env.VNN_SCAN_ENABLED='1';
process.env.OPENAI_API_KEY='test-key';
const before=globalThis.fetch;
let calls=0;
globalThis.fetch=async(_url,options)=>{
  calls++;
  const body=JSON.parse(options.body);
  assert.equal(body.store,false);
  assert.ok(body.messages[1].content.some(x=>x.type==='image_url'));
  const instructions=body.messages[1].content.find(x=>x.type==='text')?.text||'';
  assert.ok(instructions.includes('2026-10-15') && instructions.includes('Yesterday'),
    'relative bank dates must be anchored to image file metadata and reviewed');
  assert.equal(options.headers.Authorization,'Bearer test-key');
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
    transactions:[
      {name:'Coffee',amount:'4.50',currency:'EUR',date:'2026-10-15',
        bank:'Demo Bank',status:'Completed',category:'products'},
      {name:'Demo Taxi',amount:'9.90',currency:'USD',date:'2026-10-15',
        bank:'Demo Bank',status:'Отклонено банком',category:'transport'},
      {name:'Unknown',amount:null,currency:'USD',date:'2026-10-15',
        bank:'Demo Bank',status:'Completed'}
    ]
  })}}]})};
};
try{
  res=fakeResponse();
  await recognize(request(image,session(),'https://dmixriddikx-cmd.github.io','2026-10-15'),res);
  assert.equal(res.statusCode,200);
  assert.equal(res.data.items.length,1);
  assert.equal(res.data.items[0].amount,450);
  assert.equal(res.data.excludedCount,1);
  assert.equal(res.data.uncertainCount,1);
  assert.equal(res.data.needsReview,true);
  assert.equal(calls,1);
  res=fakeResponse();
  await recognize(request('not-an-image'),res);
  assert.equal(res.statusCode,400);
  assert.equal(calls,1);
  console.log('VNN bank recognition HTTP tests PASS: authentication, spending disabled by default, model schema, rejected/unclear filtering');
}finally{
  globalThis.fetch=before;
  if(old.secret===undefined)delete process.env.NINOCHKA_SESSION_SECRET;else process.env.NINOCHKA_SESSION_SECRET=old.secret;
  if(old.enabled===undefined)delete process.env.VNN_SCAN_ENABLED;else process.env.VNN_SCAN_ENABLED=old.enabled;
  if(old.key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old.key;
}
