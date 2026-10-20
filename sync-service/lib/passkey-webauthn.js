// VNN WebAuthn verifier. Uses Node crypto and deliberately supports only
// ES256/P-256 discoverable credentials with "none" attestation.
// Credentials belong to the GitHub Pages origin, not Apple account passwords.
import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';

const RP_PROD = 'dmixriddikx-cmd.github.io';
const MAX_CLIENT = 4096;
const MAX_ATTESTATION = 12000;
export class PasskeyError extends Error {
  constructor(code, status=400) { super(code); this.status=status; }
}
const fail = (code, status) => { throw new PasskeyError(code,status); };
const sha256 = bytes => createHash('sha256').update(bytes).digest();
const b64 = bytes => Buffer.from(bytes).toString('base64url');
function from64(value, max=MAX_ATTESTATION) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length>Math.ceil(max*4/3)+3)
    fail('invalid_web_authn_encoding');
  const bytes=Buffer.from(value,'base64url');
  if (!bytes.length || bytes.length>max || b64(bytes)!==value) fail('invalid_web_authn_encoding');
  return bytes;
}
function constEq(a,b) { return a.length===b.length && timingSafeEqual(a,b); }
export function rpForOrigin(origin) {
  const parsed=new URL(origin);
  if(parsed.protocol!=='https:' || parsed.pathname!=='/' || parsed.search || parsed.hash || parsed.port)
    fail('invalid_passkey_origin');
  const rp=parsed.hostname;
  if(rp!==RP_PROD && !(process.env.VERCEL_ENV==='preview' && rp===process.env.VERCEL_URL))
    fail('invalid_passkey_origin',403);
  return rp;
}
export function makeChallenge({kind, actor, origin, secret, now=Date.now()}) {
  if(!['create','get'].includes(kind) || !['nina','volodymyr','*'].includes(actor) || !secret)
    fail('challenge_not_configured',503);
  const rpId=rpForOrigin(origin);
  const payload=Buffer.from(JSON.stringify({v:1,kind,actor,origin,rpId,issued:now,expires:now+120000,nonce:b64(randomBytes(24))}));
  const mac=createHmac('sha256',secret).update('vnn:webauthn:v1').update(payload).digest();
  return b64(Buffer.concat([payload,mac]));
}
export function verifyChallenge(challenge,{kind,actor,origin,secret,now=Date.now()}) {
  if(!secret) fail('challenge_not_configured',503);
  const data=from64(challenge,1024);
  if(data.length<33) fail('invalid_challenge');
  const raw=data.subarray(0,-32),sig=data.subarray(-32);
  const expected=createHmac('sha256',secret).update('vnn:webauthn:v1').update(raw).digest();
  if(!constEq(expected,sig)) fail('invalid_challenge',401);
  let claims;try{claims=JSON.parse(raw.toString('utf8'));}catch{fail('invalid_challenge');}
  if(claims?.v!==1 || claims.kind!==kind || claims.actor!==actor || claims.origin!==origin ||
     claims.rpId!==rpForOrigin(origin) || !Number.isSafeInteger(claims.issued) ||
     !Number.isSafeInteger(claims.expires) || claims.expires-claims.issued!==120000 ||
     claims.issued>now+5000 || claims.expires<=now ||
     typeof claims.nonce!=='string' || claims.nonce.length!==32) fail('expired_or_mismatched_challenge',401);
  return {digest:sha256(data).toString('hex'),expires:claims.expires,rpId:claims.rpId};
}
function readClient(raw,kind,challenge,origin) {
  const bytes=from64(raw,MAX_CLIENT);
  let info;try{info=JSON.parse(bytes.toString('utf8'));}catch{fail('invalid_client_data');}
  if(info?.type!=='webauthn.'+kind || info.challenge!==challenge ||
     info.origin!==origin || info.crossOrigin===true) fail('client_data_mismatch',401);
  return bytes;
}
function decodeCbor(bytes,offset=0,depth=0) {
  if(depth>7 || offset>=bytes.length) fail('invalid_cbor');
  const start=offset, prefix=bytes[offset++],major=prefix>>5,additional=prefix&31;
  let length;
  if(additional<24)length=additional;
  else if(additional===24){if(offset>=bytes.length)fail('invalid_cbor');length=bytes[offset++];}
  else if(additional===25){if(offset+2>bytes.length)fail('invalid_cbor');length=bytes.readUInt16BE(offset);offset+=2;}
  else if(additional===26){if(offset+4>bytes.length)fail('invalid_cbor');length=bytes.readUInt32BE(offset);offset+=4;}
  else fail('unsupported_cbor');
  if(major===0||major===1)return {value:major===0?length:-1-length,offset};
  if(major===2||major===3){
    if(length>MAX_ATTESTATION||offset+length>bytes.length)fail('invalid_cbor');
    const slice=bytes.subarray(offset,offset+length);
    return {value:major===2?slice:slice.toString('utf8'),offset:offset+length};
  }
  if(major===4||major===5){
    if(length>64)fail('invalid_cbor');
    const items=major===5?new Map():[];
    for(let i=0;i<length;i++){
      const a=decodeCbor(bytes,offset,depth+1);offset=a.offset;
      if(major===4)items.push(a.value);
      else {
        if(!['string','number'].includes(typeof a.value)||items.has(a.value))fail('invalid_cbor_key');
        const v=decodeCbor(bytes,offset,depth+1);offset=v.offset;items.set(a.value,v.value);
      }
    }
    return {value:items,offset};
  }
  if(major===7 && [20,21,22].includes(additional))
    return {value:additional===20?false:additional===21?true:null,offset};
  fail('unsupported_cbor');
}
function checkedAuthenticator(authData,rpId,requireAttested) {
  if(authData.length<37 || authData.length>MAX_ATTESTATION)fail('invalid_authenticator_data');
  if(!constEq(authData.subarray(0,32),sha256(Buffer.from(rpId))))fail('rp_id_mismatch',401);
  const flags=authData[32];
  if(!(flags&0x01) || !(flags&0x04))fail('user_verification_required',401);
  if(requireAttested && !(flags&0x40))fail('missing_attested_credential');
  const counter=authData.readUInt32BE(33);
  return {counter,flags};
}
function credentialId(input) {
  if(!input || input.type!=='public-key')fail('invalid_credential');
  const id=from64(input.rawId,1024);
  if(input.id!==b64(id) || id.length<16 || id.length>255)fail('credential_id_mismatch');
  return {id:b64(id),raw:id};
}
export function verifyRegistration({credential,challenge,origin,rpId}) {
  const id=credentialId(credential);
  const response=credential.response||{};
  readClient(response.clientDataJSON,'create',challenge,origin);
  const attested=from64(response.attestationObject,MAX_ATTESTATION);
  const root=decodeCbor(attested);
  if(root.offset!==attested.length||!(root.value instanceof Map))fail('invalid_attestation');
  if(root.value.get('fmt')!=='none' || !(root.value.get('attStmt') instanceof Map) ||
     root.value.get('attStmt').size!==0)fail('unsupported_attestation');
  const data=root.value.get('authData');
  if(!Buffer.isBuffer(data))fail('invalid_authenticator_data');
  const {counter}=checkedAuthenticator(data,rpId,true);
  let offset=37;
  if(offset+18>data.length)fail('invalid_attestation');
  offset+=16;const len=data.readUInt16BE(offset);offset+=2;
  if(!len||len>255||offset+len>=data.length)fail('invalid_attestation');
  if(!constEq(id.raw,data.subarray(offset,offset+len)))fail('credential_id_mismatch');offset+=len;
  const cose=decodeCbor(data,offset).value;
  if(!(cose instanceof Map)||cose.get(1)!==2||cose.get(3)!==-7||cose.get(-1)!==1 ||
     !Buffer.isBuffer(cose.get(-2))||cose.get(-2).length!==32||
     !Buffer.isBuffer(cose.get(-3))||cose.get(-3).length!==32)fail('unsupported_passkey_algorithm');
  const publicKey={kty:'EC',crv:'P-256',x:b64(cose.get(-2)),y:b64(cose.get(-3))};
  try{createPublicKey({key:publicKey,format:'jwk'});}catch{fail('invalid_credential_key');}
  return {id:id.id,publicKey,counter};
}
export function verifyAssertion({credential,challenge,origin,rpId,registered}) {
  const id=credentialId(credential);
  if(!registered||registered.id!==id.id)fail('unknown_passkey',401);
  const response=credential.response||{};
  const client=readClient(response.clientDataJSON,'get',challenge,origin);
  const auth=from64(response.authenticatorData,MAX_ATTESTATION);
  const signature=from64(response.signature,1024);
  const {counter}=checkedAuthenticator(auth,rpId,false);
  if(!registered.publicKey||registered.publicKey.kty!=='EC'||registered.publicKey.crv!=='P-256')fail('invalid_registered_key',503);
  const message=Buffer.concat([auth,sha256(client)]);
  let valid=false;
  try{valid=verify('sha256',message,createPublicKey({key:registered.publicKey,format:'jwk'}),signature);}
  catch{fail('invalid_signature',401);}
  if(!valid)fail('invalid_signature',401);
  if((registered.counter>0 && counter<=registered.counter)|| (registered.counter>0&&counter===0))
    fail('authenticator_counter_replayed',401);
  return {id:id.id,counter};
}
