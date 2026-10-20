// Explicit private read-only production capture. Never prints financial records
// or credentials, and never makes PUT/POST/PATCH/DELETE requests.
import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, realpath, writeFile, readFile, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BASE='https://ninochka-sync.vercel.app';
const ORIGIN='https://dmixriddikx-cmd.github.io';
const REPO=fileURLToPath(new URL('../',import.meta.url));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function normalizedEnvelope(body){
  if (!body || !Object.hasOwn(body,'rev') || !Object.hasOwn(body,'data')) throw new Error('Invalid budget response');
  if(body.data!==null && (body.data.schemaVersion!==4 || !Array.isArray(body.data.months) || !body.data.storage))
    throw new Error('Unrecognized production schema; no release permitted');
  // Actor is session-specific metadata; exclude it from consistency checks.
  const {actor,...envelope}=body;
  return envelope;
}
export async function privateBackupDirectory(directory){
  if(!path.isAbsolute(directory)) throw new Error('Backup directory must be absolute and outside Git');
  await mkdir(directory,{recursive:true,mode:0o700});
  const resolved=await realpath(directory);
  if((await stat(resolved)).mode & 0o077) throw new Error('Backup directory must have private 0700 permissions');
  const repo=await realpath(REPO);
  const relative=path.relative(repo,resolved);
  if(relative==='' || (!relative.startsWith('..'+path.sep) && relative!=='..' && !path.isAbsolute(relative)))
    throw new Error('Refusing to store private financial data inside the repository');
  // Refuse any other Git checkout too, including a symlink into one.
  for(let p=resolved;;p=path.dirname(p)){
    try{await realpath(path.join(p,'.git'));throw new Error('Refusing Git-backed backup directory');}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(path.dirname(p)===p)break;
  }
  return resolved;
}
export async function saveAndVerifyBackup(directory,snapshot){
  const target=await privateBackupDirectory(directory);
  const bytes=Buffer.from(JSON.stringify(snapshot));
  const key=randomBytes(32),iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);
  const packed=Buffer.concat([Buffer.from('VNNB1'),iv,cipher.getAuthTag(),ciphertext]);
  const name='vnn-'+Date.now()+'-'+randomBytes(8).toString('hex');
  const encrypted=path.join(target,name+'.enc'),keyFile=path.join(target,name+'.key');
  await writeFile(keyFile,key,{mode:0o600,flag:'wx'});
  try{await writeFile(encrypted,packed,{mode:0o600,flag:'wx'});}
  catch(error){await unlink(keyFile);throw error;}
  const restored=await restoreBackup(encrypted,keyFile);
  if(!timingSafeEqual(createHash('sha256').update(restored.bytes).digest(),createHash('sha256').update(bytes).digest()))
    throw new Error('Backup readback mismatch; production release is blocked');
  return {encrypted,keyFile,sha256:digest(bytes),offlineRestoreVerified:true};
}
export async function restoreBackup(encrypted,keyFile){
  const packed=await readFile(encrypted),key=await readFile(keyFile);
  if(packed.subarray(0,5).toString()!=='VNNB1'||key.length!==32)throw new Error('Invalid backup');
  const decipher=createDecipheriv('aes-256-gcm',key,packed.subarray(5,17));
  decipher.setAuthTag(packed.subarray(17,33));
  const bytes=Buffer.concat([decipher.update(packed.subarray(33)),decipher.final()]);
  return {snapshot:JSON.parse(bytes.toString()),bytes};
}
export async function captureProduction(token,fetcher=fetch){
  if(!token)throw new Error('Missing protected VNN_FAMILY_SESSION_TOKEN Secret; no production request made');
  async function get(route,optional=false){
    const response=await fetcher(BASE+route,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(25000),
      headers:{Origin:ORIGIN,Authorization:'Bearer '+token}});
    if(optional&&response.status===404)return {routeAvailable:false};
    if(!response.ok)throw new Error('Protected production read rejected: HTTP '+response.status);
    let bytes=0;const chunks=[];
    for await(const chunk of response.body){bytes+=chunk.length;if(bytes>4*1024*1024)throw new Error('Backup response too large');chunks.push(chunk);}
    return JSON.parse(Buffer.concat(chunks).toString());
  }
  for(let attempt=0;attempt<3;attempt++){
    const first=normalizedEnvelope(await get('/api/sync'));
    const inbox=await get('/api/inbox',true);
    const second=normalizedEnvelope(await get('/api/sync'));
    if(JSON.stringify(first)!==JSON.stringify(second))continue;
    return {format:'VNN-private-backup-v1',source:BASE,capturedAt:new Date().toISOString(),budget:second,inbox,
      stableCapture:true,writerBarrierVerified:false};
  }
  throw new Error('Production changed during read-only capture; retry under a verified writer barrier');
}
async function main(){
  if(!process.env.VNN_FAMILY_SESSION_TOKEN){
    console.error('BLOCKED: VNN_FAMILY_SESSION_TOKEN Secret is not provisioned; no production request made.');
    process.exitCode=1;return;
  }
  const snapshot=await captureProduction(process.env.VNN_FAMILY_SESSION_TOKEN);
  const result=await saveAndVerifyBackup(process.env.VNN_BACKUP_DIR||'/workspace/shared/vnn-private-backups',snapshot);
  console.log(JSON.stringify({status:'VERIFIED_PRIVATE_CAPTURE',encrypted:result.encrypted,keyFile:result.keyFile,
    offlineRestoreVerified:result.offlineRestoreVerified,productionWritePerformed:false,
    writerBarrierVerified:false,productionRestoreVerified:false,
    note:'Keep encrypted backup AND key private; this does not authorize a production restore or release.'}));
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch(()=>{console.error('BLOCKED: protected production capture/verification failed. No financial data or credential was logged.');process.exitCode=1;});
