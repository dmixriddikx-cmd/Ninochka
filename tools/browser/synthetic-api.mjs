// Local-only verification: never connects to Vercel, Blob, or OCR providers.
import { mock } from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { createState } from '../../corefix.js';
const store = new Map(); let revision=0;
class BlobPreconditionFailedError extends Error {}
mock.module(pathToFileURL(createRequire(new URL('../../sync-service/package.json',import.meta.url)).resolve('@vercel/blob').replace(/index\.cjs$/, 'index.js')).href, {exports:{
  BlobPreconditionFailedError,
  get:async path=>{const blob=store.get(path);return blob?{stream:new Response(blob.body).body,blob:{etag:blob.etag}}:null;},
  put:async(path,body,options)=>{
    const old=store.get(path);
    if ((options.ifMatch && old?.etag!==options.ifMatch)||(options.allowOverwrite===false&&old)) throw new BlobPreconditionFailedError();
    store.set(path,{body,etag:String(++revision)});
  }
}});
process.env.NINOCHKA_SESSION_SECRET='local-synthetic-secret';
process.env.NINA_CREDENTIAL_SHA256=createHash('sha256').update('нина\0synthetic-pin').digest('hex');
process.env.VOLODYMYR_CREDENTIAL_SHA256=createHash('sha256').update('вова\0synthetic-pin').digest('hex');
delete process.env.NINOCHKA_INBOX_INITIAL_BATCH;
delete process.env.OPENAI_API_KEY;
delete process.env.VNN_SCAN_ENABLED;
delete process.env.VERCEL_ENV;
const {replaceDocument}=await import('../../sync-service/lib/blob-store.js');
const data=createState();data.preferences.onboardingSeen=true;
for(const month of data.months)for(const week of month.weeks)week.fund={amount:0,currency:'EUR',rate:1};
await replaceDocument('generation-3/family-budget.json',{etag:null},{rev:1,data,updatedAt:new Date().toISOString(),updatedBy:'nina'});
const {default:sync}=await import('../../sync-service/api/sync.js');
const {default:inbox}=await import('../../sync-service/api/inbox.js');
const {default:recognize}=await import('../../sync-service/api/recognize.js');
const {default:passkeys}=await import('../../sync-service/api/passkeys.js');
const handlers={'/api/sync':sync,'/api/inbox':inbox,'/api/recognize':recognize,'/api/passkeys':passkeys};
const server=createServer(async(req,res)=>{
  const handler=handlers[req.url];
  if(!handler){res.writeHead(404).end();return;}
  let raw='';for await(const chunk of req)raw+=chunk;
  req.body=raw?JSON.parse(raw):undefined;
  res.status=n=>{res.statusCode=n;return res;};
  res.json=body=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));return res;};
  // Vercel's response helper is chainable; Node's setHeader already returns res.
  try{await handler(req,res);}catch{res.writeHead(500).end();}
});
server.listen(0,'127.0.0.1',()=>process.stdout.write(JSON.stringify({port:server.address().port})+'\n'));
