// Family passkeys. Opt-in additive login: password fallback is retained.
// Apple IDs, passwords and biometrics are NEVER received by this API.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readDocument, replaceDocument, WriteConflict } from '../lib/blob-store.js';
import { browserOrigin } from '../lib/browser-origin.js';
import { signedActor, sessionSecret } from '../lib/token-auth.js';
import { makeChallenge, verifyChallenge, verifyRegistration, verifyAssertion, rpForOrigin, PasskeyError } from '../lib/passkey-webauthn.js';

const KEY_PATH='generation-2/family-passkeys.json';
const USED_PATH='generation-2/passkey-challenges-used.json';
const ACTORS=new Set(['nina','volodymyr']);
const TTL=30*24*60*60*1000;
const b64=bytes=>Buffer.from(bytes).toString('base64url');
function send(res,status,body){return res.status(status).setHeader('Cache-Control','no-store').json(body);}
function normalizedLogin(login){return String(login||'').trim().toLocaleLowerCase('ru-RU');}
function passwordActor(login,pin){
  if(typeof pin!=='string'||pin.length>128)return null;
  const name=normalizedLogin(login);
  const actor=name==='нина'?'nina':name==='вова'?'volodymyr':null;
  if(!actor)return null;
  const prefix=process.env.VERCEL_ENV==='preview'?'NINOCHKA_PREVIEW_':'';
  const key=prefix+(actor==='nina'?'NINA_CREDENTIAL_SHA256':'VOLODYMYR_CREDENTIAL_SHA256');
  const expected=process.env[key];
  if(!/^[a-f0-9]{64}$/i.test(expected||''))return null;
  const actual=createHash('sha256').update(name+'\0'+pin).digest('hex');
  return timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex'))?actor:null;
}
function signSession(actor){
  const secret=sessionSecret();
  if(!secret)throw new PasskeyError('passkey_not_configured',503);
  const expiresAt=Date.now()+TTL;
  const payload=Buffer.from(JSON.stringify({actor,expiresAt})).toString('base64url');
  const signature=createHmac('sha256',secret).update(payload).digest('base64url');
  return {actor,token:payload+'.'+signature,expiresAt};
}
function verifiedDatabase(data){
  if(data===null)return {rev:0,items:[]};
  if(!data||!Number.isSafeInteger(data.rev)||data.rev<1||!Array.isArray(data.items)||
    data.items.length>12||!data.items.every(x=>x&&ACTORS.has(x.actor)&&
    typeof x.id==='string'&&/^[A-Za-z0-9_-]{20,350}$/.test(x.id)&&
    Number.isSafeInteger(x.counter)&&x.counter>=0&&
    x.publicKey?.kty==='EC'&&x.publicKey?.crv==='P-256'&&
    typeof x.publicKey.x==='string'&&typeof x.publicKey.y==='string'))
    throw new PasskeyError('invalid_passkey_store',503);
  if(new Set(data.items.map(x=>x.id)).size!==data.items.length)throw new PasskeyError('invalid_passkey_store',503);
  return data;
}
function verifiedUsed(data){
  if(data===null)return {rev:0,items:[]};
  if(!data||!Number.isSafeInteger(data.rev)||data.rev<1||!Array.isArray(data.items)||
    data.items.length>512||!data.items.every(x=>x&&/^[a-f0-9]{64}$/.test(x.digest)&&
    Number.isSafeInteger(x.expires)))throw new PasskeyError('invalid_challenge_store',503);
  return data;
}
async function mutate(path,decode,transform) {
  for(let i=0;i<5;i++){
    const snapshot=await readDocument(path);
    const current=decode(snapshot.data);
    const items=transform(current);
    const next={rev:current.rev+1,items};
    try{await replaceDocument(path,snapshot,next);return next;}
    catch(error){if(!(error instanceof WriteConflict))throw error;}
  }
  throw new PasskeyError('passkey_store_busy',503);
}
async function consume(challengeData){
  const now=Date.now();
  await mutate(USED_PATH,verifiedUsed,current=>{
    const entries=current.items.filter(x=>x.expires>now);
    if(entries.some(x=>x.digest===challengeData.digest))throw new PasskeyError('passkey_challenge_replayed',409);
    if(entries.length>=500)throw new PasskeyError('passkey_challenge_store_full',503);
    entries.push({digest:challengeData.digest,expires:challengeData.expires});
    return entries;
  });
}
async function credentials(){return verifiedDatabase((await readDocument(KEY_PATH)).data).items;}
function userId(actor){return b64('vnn-family:'+actor);}
function checkedRequestOrigin(req) {
  // Require an explicit browser Origin on credential creation/assertion.
  if(!req.headers.origin)return null;
  return browserOrigin(req);
}
export default async function handler(req,res) {
  const origin=checkedRequestOrigin(req);
  if(!origin)return send(res,403,{error:'origin_denied'});
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return send(res,405,{error:'method_not_allowed'});
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body))return send(res,400,{error:'invalid_request'});
  if(!sessionSecret())return send(res,503,{error:'passkey_not_configured'});
  const action=body.action;
  const rpId=rpForOrigin(origin);
  try {
    if(action==='register-options'){
      const actor=signedActor(req,'session');
      if(!actor || passwordActor(body.login,body.pin)!==actor)
        return send(res,401,{error:'recent_password_confirmation_required'});
      const current=await credentials();
      if(current.filter(x=>x.actor===actor).length>=5)return send(res,409,{error:'passkey_limit_reached'});
      const challenge=makeChallenge({kind:'create',actor,origin,secret:sessionSecret()});
      return send(res,200,{publicKey:{
        challenge,rp:{id:rpId,name:'VNN — семейный бюджет'},
        user:{id:userId(actor),name:actor==='nina'?'Нина':'Вова',displayName:actor==='nina'?'Нина':'Вова'},
        pubKeyCredParams:[{type:'public-key',alg:-7}],
        authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'required',userVerification:'required'},
        attestation:'none',timeout:60000,
        excludeCredentials:current.filter(x=>x.actor===actor).map(x=>({type:'public-key',id:x.id}))
      }});
    }
    if(action==='register-finish'){
      const actor=signedActor(req,'session');
      if(!actor)return send(res,401,{error:'invalid_session'});
      if(typeof body.challenge!=='string'||body.challenge.length>1400)
        return send(res,400,{error:'invalid_challenge'});
      const checked=verifyChallenge(body.challenge,{kind:'create',actor,origin,secret:sessionSecret()});
      const parsed=verifyRegistration({credential:body.credential,challenge:body.challenge,origin,rpId});
      // Replay is consumed before account storage. Fail closed if any write fails.
      await consume(checked);
      await mutate(KEY_PATH,verifiedDatabase,current=>{
        if(current.items.some(x=>x.id===parsed.id))throw new PasskeyError('credential_already_registered',409);
        if(current.items.filter(x=>x.actor===actor).length>=5)throw new PasskeyError('passkey_limit_reached',409);
        return current.items.concat([{actor,id:parsed.id,publicKey:parsed.publicKey,counter:parsed.counter,createdAt:new Date().toISOString()}]);
      });
      return send(res,200,{registered:true,actor});
    }
    if(action==='passkey-list'){
      const actor=signedActor(req,'session');
      if(!actor)return send(res,401,{error:'invalid_session'});
      const owned=(await credentials()).filter(x=>x.actor===actor);
      return send(res,200,{items:owned.map(x=>({id:x.id,createdAt:x.createdAt})),actor});
    }
    if(action==='passkey-revoke'){
      const actor=signedActor(req,'session');
      if(!actor||passwordActor(body.login,body.pin)!==actor)
        return send(res,401,{error:'recent_password_confirmation_required'});
      if(typeof body.id!=='string'||!/^[A-Za-z0-9_-]{20,350}$/.test(body.id))
        return send(res,400,{error:'invalid_credential'});
      await mutate(KEY_PATH,verifiedDatabase,current=>{
        if(!current.items.some(x=>x.id===body.id&&x.actor===actor))
          throw new PasskeyError('unknown_passkey',404);
        return current.items.filter(x=>!(x.id===body.id&&x.actor===actor));
      });
      return send(res,200,{revoked:true,actor});
    }
    if(action==='login-options'){
      const challenge=makeChallenge({kind:'get',actor:'*',origin,secret:sessionSecret()});
      return send(res,200,{publicKey:{challenge,rpId,timeout:60000,userVerification:'required'}});
    }
    if(action==='login-finish'){
      if(typeof body.challenge!=='string'||body.challenge.length>1400)
        return send(res,400,{error:'invalid_challenge'});
      const checked=verifyChallenge(body.challenge,{kind:'get',actor:'*',origin,secret:sessionSecret()});
      const current=await credentials();
      const credential=current.find(x=>x.id===body.credential?.id);
      if(!credential)return send(res,401,{error:'unknown_passkey'});
      const handle=body.credential?.response?.userHandle;
      if(handle && handle!==userId(credential.actor))return send(res,401,{error:'passkey_account_mismatch'});
      const result=verifyAssertion({credential:body.credential,challenge:body.challenge,origin,rpId,registered:credential});
      await consume(checked);
      if(result.counter>0){
        await mutate(KEY_PATH,verifiedDatabase,store=>{
          const stored=store.items.find(x=>x.id===result.id);
          if(!stored||stored.actor!==credential.actor||
            (stored.counter>0&&result.counter<=stored.counter))
            throw new PasskeyError('passkey_counter_conflict',409);
          return store.items.map(x=>x.id===result.id?{...x,counter:result.counter}:x);
        });
      }
      return send(res,200,signSession(credential.actor));
    }
    return send(res,400,{error:'invalid_action'});
  } catch(error) {
    if(error instanceof PasskeyError)return send(res,error.status,{error:error.message});
    console.error('VNN passkey operation unavailable');
    return send(res,503,{error:'passkey_unavailable'});
  }
}
