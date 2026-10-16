import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { makeChallenge, verifyChallenge, verifyRegistration, verifyAssertion, PasskeyError } from '../lib/passkey-webauthn.js';

const ORIGIN='https://dmixriddikx-cmd.github.io';
const RP='dmixriddikx-cmd.github.io';
const secret='synthetic-passkey-session-secret-not-production';
const data=new Map();
let writes=0;
class BlobPreconditionFailedError extends Error {}
mock.module('@vercel/blob',{exports:{
  BlobPreconditionFailedError,
  get:async(path,options)=>{
    assert.equal(options.headers?.['accept-encoding'],'identity');
    const row=data.get(path);
    return row?{stream:new Response(row.content).body,blob:{etag:row.etag}}:null;
  },
  put:async(path,content,options)=>{
    const old=data.get(path);
    if((options.ifMatch && old?.etag!==options.ifMatch) ||
       (options.allowOverwrite===false && old))throw new BlobPreconditionFailedError();
    data.set(path,{content,etag:'etag-'+(++writes)});
  }
}});
const {default:handler}=await import('../api/passkeys.js');

process.env.NINOCHKA_SESSION_SECRET=secret;
process.env.NINA_CREDENTIAL_SHA256=createHash('sha256').update('нина\0synthetic-pin').digest('hex');
process.env.VOLODYMYR_CREDENTIAL_SHA256=createHash('sha256').update('вова\0synthetic-pin').digest('hex');
const enc=bytes=>Buffer.from(bytes).toString('base64url');
const sha=bytes=>createHash('sha256').update(bytes).digest();
function session(actor='nina'){
  const payload=enc(Buffer.from(JSON.stringify({actor,expiresAt:Date.now()+3600000})));
  const mac=createHmac('sha256',secret).update(payload).digest('base64url');
  return payload+'.'+mac;
}
async function api(action, body={},auth=null,origin=ORIGIN,method='POST'){
  const result={statusCode:200,headers:{},body:null};
  const res={status(n){result.statusCode=n;return this;},setHeader(k,v){result.headers[k]=v;return this;},
    json(v){result.body=v;return this;},end(){return this;}};
  await handler({method,headers:{origin,...(auth?{authorization:'Bearer '+auth}:{})},
    body:{action,...body}},res);
  return result;
}
function head(major,n) {
  if(n<24)return Buffer.from([(major<<5)|n]);
  if(n<256)return Buffer.from([(major<<5)|24,n]);
  if(n<65536){const b=Buffer.alloc(3);b[0]=(major<<5)|25;b.writeUInt16BE(n,1);return b;}
  throw Error('test too large');
}
function cbor(value){
  if(typeof value==='number')return value>=0?head(0,value):head(1,-1-value);
  if(Buffer.isBuffer(value))return Buffer.concat([head(2,value.length),value]);
  if(typeof value==='string'){const b=Buffer.from(value);return Buffer.concat([head(3,b.length),b]);}
  if(value instanceof Map){const out=[head(5,value.size)];for(const [k,v] of value){out.push(cbor(k),cbor(v));}return Buffer.concat(out);}
  throw Error('unsupported synthetic value');
}
function credentialPair(challenge){
  const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const jwk=keys.publicKey.export({format:'jwk'});
  const id=randomBytes(32);
  const cose=cbor(new Map([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x,'base64url')],[-3,Buffer.from(jwk.y,'base64url')]]));
  const signedHeader=Buffer.concat([sha(Buffer.from(RP)),Buffer.from([0x45]),Buffer.alloc(4)]);
  const attested=Buffer.concat([signedHeader,Buffer.alloc(16),Buffer.from([0,id.length]),id,cose]);
  const object=cbor(new Map([['fmt','none'],['attStmt',new Map()],['authData',attested]]));
  const client=Buffer.from(JSON.stringify({type:'webauthn.create',challenge,origin:ORIGIN,crossOrigin:false}));
  return {keys,credential:{
    id:enc(id),rawId:enc(id),type:'public-key',
    response:{clientDataJSON:enc(client),attestationObject:enc(object)}
  }};
}
function assertion(pair,challenge,user='nina',overrides={}){
  const id=pair.credential.id;
  const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin:ORIGIN,crossOrigin:false}));
  const auth=Buffer.concat([sha(Buffer.from(RP)),Buffer.from([0x05]),Buffer.alloc(4)]);
  const signature=sign('sha256',Buffer.concat([auth,sha(client)]),pair.keys.privateKey);
  return {id,rawId:id,type:'public-key',response:{
    clientDataJSON:enc(client),authenticatorData:enc(auth),signature:enc(signature),
    userHandle:enc(Buffer.from('vnn-family:'+user)),...overrides
  }};
}

test('stateless challenges are signed, short-lived and bound to operation, actor, origin',()=>{
  const challenge=makeChallenge({kind:'create',actor:'nina',origin:ORIGIN,secret});
  const valid=verifyChallenge(challenge,{kind:'create',actor:'nina',origin:ORIGIN,secret});
  assert.equal(valid.rpId,RP);
  assert.throws(()=>verifyChallenge(challenge,{kind:'get',actor:'nina',origin:ORIGIN,secret}),PasskeyError);
  assert.throws(()=>verifyChallenge(challenge,{kind:'create',actor:'volodymyr',origin:ORIGIN,secret}),PasskeyError);
  assert.throws(()=>verifyChallenge(challenge,{kind:'create',actor:'nina',origin:'https://evil.example',secret}),PasskeyError);
  const modified=challenge.slice(0,-1)+(challenge.at(-1)==='x'?'y':'x');
  assert.throws(()=>verifyChallenge(modified,{kind:'create',actor:'nina',origin:ORIGIN,secret}),PasskeyError);
  assert.throws(()=>verifyChallenge(challenge,{kind:'create',actor:'nina',origin:ORIGIN,secret,now:Date.now()+121000}),PasskeyError);
});

test('enrollment requires both existing family session and existing VNN password',async()=>{
  data.clear();
  assert.equal((await api('register-options',{login:'Нина',pin:'synthetic-pin'})).statusCode,401);
  assert.equal((await api('register-options',{login:'Нина',pin:'wrong'},session())).statusCode,401);
  assert.equal((await api('register-options',{login:'Вова',pin:'synthetic-pin'},session())).statusCode,401);
  const options=await api('register-options',{login:'Нина',pin:'synthetic-pin'},session());
  assert.equal(options.statusCode,200);
  assert.equal(options.body.publicKey.rp.id,RP);
  assert.equal(options.body.publicKey.authenticatorSelection.userVerification,'required');
  assert.equal(options.body.publicKey.authenticatorSelection.residentKey,'required');
  assert.equal(options.body.publicKey.pubKeyCredParams[0].alg,-7);
  assert.equal(writes,0,'starting enrollment does not write any personal data');
});

test('real P-256 registration then signed Face ID-style assertion creates correct family session',async()=>{
  data.clear();
  const opts=await api('register-options',{login:'Нина',pin:'synthetic-pin'},session());
  const challenge=opts.body.publicKey.challenge;
  const pair=credentialPair(challenge);
  const result=await api('register-finish',{challenge,credential:pair.credential},session());
  assert.equal(result.statusCode,200);
  assert.equal(result.body.actor,'nina');
  assert.equal(data.has('generation-2/family-passkeys.json'),true);
  assert.equal(data.has('generation-2/family-budget.json'),false,'enrollment never touches budget');
  const get=await api('login-options');
  assert.equal(get.statusCode,200);
  const signed=assertion(pair,get.body.publicKey.challenge,'nina');
  const login=await api('login-finish',{challenge:get.body.publicKey.challenge,credential:signed});
  assert.equal(login.statusCode,200);
  assert.equal(login.body.actor,'nina');
  assert.equal(typeof login.body.token,'string');
  assert.equal((await api('login-finish',{challenge:get.body.publicKey.challenge,credential:signed})).statusCode,409,
    'WebAuthn assertion cannot be replayed');
  const wrongId={...signed,id:enc(randomBytes(32))};
  const second=await api('login-options');
  assert.equal((await api('login-finish',{challenge:second.body.publicKey.challenge,credential:wrongId})).statusCode,401);
});

test('bad signatures, wrong user handles and unverifiable authenticator flags are rejected',async()=>{
  data.clear();
  const opts=await api('register-options',{login:'Вова',pin:'synthetic-pin'},session('volodymyr'));
  const pair=credentialPair(opts.body.publicKey.challenge);
  assert.equal((await api('register-finish',{challenge:opts.body.publicKey.challenge,credential:pair.credential},session('volodymyr'))).statusCode,200);
  let next=await api('login-options');
  let signed=assertion(pair,next.body.publicKey.challenge,'nina');
  assert.equal((await api('login-finish',{challenge:next.body.publicKey.challenge,credential:signed})).statusCode,401);
  next=await api('login-options');signed=assertion(pair,next.body.publicKey.challenge,'volodymyr');
  signed.response.signature=enc(randomBytes(70));
  assert.equal((await api('login-finish',{challenge:next.body.publicKey.challenge,credential:signed})).statusCode,401);
  next=await api('login-options');signed=assertion(pair,next.body.publicKey.challenge,'volodymyr');
  const bad=Buffer.from(signed.response.authenticatorData,'base64url');bad[32]&=~4;
  signed.response.authenticatorData=enc(bad);
  assert.equal((await api('login-finish',{challenge:next.body.publicKey.challenge,credential:signed})).statusCode,401);
});

test('missing origin and cross-site origin are denied',async()=>{
  assert.equal((await api('login-options',{},null,'https://evil.example')).statusCode,403);
  assert.equal((await api('login-options',{},null,null)).statusCode,403);
  assert.equal((await api('login-options',{},null,ORIGIN,'OPTIONS')).statusCode,204);
});

test('preview passkeys are isolated from production credentials and storage',async()=>{
  const before=new Map(data);
  process.env.VERCEL_ENV='preview';process.env.VERCEL_URL='synthetic-passkeys-preview.vercel.app';
  process.env.NINOCHKA_PREVIEW_SESSION_SECRET='synthetic-preview-passkey-secret';
  process.env.NINOCHKA_PREVIEW_NINA_CREDENTIAL_SHA256=createHash('sha256').update('нина\0synthetic-pin').digest('hex');
  try{
    const preview='https://synthetic-passkeys-preview.vercel.app';
    const options=await api('login-options',{},null,preview);
    assert.equal(options.statusCode,200);
    assert.equal(options.body.publicKey.rpId,'synthetic-passkeys-preview.vercel.app');
    assert.deepEqual(new Map([...data].filter(([key])=>!key.startsWith('previews/'))),before,
      'preview must not mutate production object');
  }finally{
    delete process.env.VERCEL_ENV;delete process.env.VERCEL_URL;
    delete process.env.NINOCHKA_PREVIEW_SESSION_SECRET;delete process.env.NINOCHKA_PREVIEW_NINA_CREDENTIAL_SHA256;
  }
});
