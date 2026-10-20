import assert from 'node:assert/strict';
import { mkdtemp, rm, chmod, readFile, writeFile, stat, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {captureProduction,saveAndVerifyBackup,restoreBackup,privateBackupDirectory} from './scripts/backup-production.mjs';
const folder=await mkdtemp(path.join(os.tmpdir(),'vnn-private-backup-test-'));
try{
 await chmod(folder,0o700);
 const budget={rev:4,data:{schemaVersion:4,months:[],storage:{currency:'EUR',balance:-1250,history:[]}},updatedBy:'nina'};
 const requested=[];
 const request=async(url,options)=>{
  requested.push({url,method:options.method});assert.equal(options.method,'GET');
  assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer synthetic-session');
  return url.endsWith('/api/inbox')?new Response('',{status:404}):new Response(JSON.stringify({...budget,actor:'nina'}));
 };
 await assert.rejects(captureProduction('',request),/Missing protected/);assert.equal(requested.length,0);
 const snapshot=await captureProduction('synthetic-session',request);
 assert.equal(snapshot.stableCapture,true);assert.equal(snapshot.writerBarrierVerified,false);assert.equal(snapshot.inbox.routeAvailable,false);
 const backup=await saveAndVerifyBackup(folder,snapshot);
 assert.equal(backup.offlineRestoreVerified,true);
 assert.equal((await stat(backup.encrypted)).mode&0o777,0o600);assert.equal((await stat(backup.keyFile)).mode&0o777,0o600);
 assert.ok(!(await readFile(backup.encrypted)).includes(Buffer.from('schemaVersion')),'No plaintext financial JSON in encrypted backup');
 const restored=await restoreBackup(backup.encrypted,backup.keyFile);assert.deepEqual(restored.snapshot,snapshot);
 const original=await readFile(backup.encrypted);const corrupted=Buffer.from(original);corrupted[corrupted.length-1]^=1;
 await writeFile(backup.encrypted,corrupted);await assert.rejects(restoreBackup(backup.encrypted,backup.keyFile));
 await writeFile(backup.encrypted,original);await writeFile(backup.keyFile,Buffer.alloc(32));await assert.rejects(restoreBackup(backup.encrypted,backup.keyFile));
 await assert.rejects(privateBackupDirectory(process.cwd()),/repository|0700/);
 const alias=path.join(folder,'checkout-link');await symlink(process.cwd(),alias,'dir');await assert.rejects(privateBackupDirectory(alias),/repository|0700/);
 await chmod(folder,0o755);await assert.rejects(privateBackupDirectory(folder),/0700/);await chmod(folder,0o700);
 let n=0;
 await assert.rejects(captureProduction('synthetic-session',async(url)=>new Response(JSON.stringify({...budget,rev:n++}))),/changed during/);
 await assert.rejects(captureProduction('synthetic-session',async()=>new Response('{}',{status:401})),/HTTP 401/);
 console.log('Private production backup tooling PASS: read-only capture, stable revision, encryption, exact offline restore, tamper rejection, no repository storage; synthetic data only');
}finally{await rm(folder,{recursive:true,force:true});}
