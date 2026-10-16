import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('v4/app-sync.js','utf8');
const functionSource=(name,end)=>source.slice(source.indexOf(name),source.indexOf(end,source.indexOf(name)));
function scope() {
  const storage=new Map();
  const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
  const sandbox={sync:{token:'synthetic',rev:4,dirty:false,connected:true,busy:false,paused:false,actor:'nina'},
    state:{preferences:{}},localStorage,STORE:'budget',SYNC_REV:'rev',SYNC_DIRTY:'dirty',SYNC_TOKEN:'token',SYNC_READY:'ready',SYNC_LOGIN:'login',
    SYNC_API:'https://synthetic.example',syncLocalVersion:0,authRestorePending:false,
    cachedSessionActor(){return 'nina';},render(){},adoptRemote(data){sandbox.adopted=data;},saveLocalOnly(){},queueSync(){sandbox.queued=true;},view:{tab:'home'}};
  vm.createContext(sandbox);
  vm.runInContext(functionSource('function clearSyncSession(', 'async function connectSync(')+
    functionSource('async function connectSync(', 'function activateSync(')+
    functionSource('async function refreshSync(', "document.addEventListener('click'"),sandbox);
  return sandbox;
}
{
  const s=scope();s.sync.dirty=true;
  s.syncRequest=async()=>({rev:5,actor:'nina',data:{synthetic:true}});
  await s.connectSync('','',true);
  assert.equal(s.sync.paused,true,'Offline edits cannot be rebased by simply replacing the revision');
  assert.equal(s.sync.rev,4);assert.equal(s.queued,undefined);assert.equal(s.adopted,undefined);
}
{
  const s=scope();s.sync.dirty=true;
  s.syncRequest=async()=>({rev:4,actor:'nina',data:{synthetic:true}});
  await s.connectSync('','',true);
  assert.equal(s.queued,true,'Unchanged remote revision permits retry');
}
{
  const s=scope();let finish;
  s.syncRequest=()=>new Promise(ok=>finish=ok);
  const refresh=s.refreshSync();
  s.sync.dirty=true;s.syncLocalVersion++;
  finish({rev:5,data:{synthetic:true}});await refresh;
  assert.equal(s.adopted,undefined,'Refresh must not discard edits made while GET was in flight');
  assert.equal(s.sync.rev,4);
}
{
  const s=scope();s.sync.dirty=true;s.localStorage.setItem('budget','synthetic-unsent-copy');
  s.localStorage.setItem('rev','4');s.localStorage.setItem('dirty','1');
  s.clearSyncSession('expired');
  assert.equal(s.sync.dirty,true);assert.equal(s.sync.rev,4);
  assert.equal(s.localStorage.getItem('dirty'),'1');assert.equal(s.localStorage.getItem('rev'),'4');
  assert.equal(s.localStorage.getItem('budget'),'synthetic-unsent-copy');
}
console.log('Browser synchronization regression PASS: reconnect conflicts, in-flight edits and expired-session recovery');

{
  const s=scope();s.sync.connected=false;s.syncRequest=async()=>{throw new TypeError('offline');};
  s.localStorage.setItem('ready','1');
  await s.connectSync('','',true);
  assert.equal(s.sync.connected,true,'Previously authenticated local copy can reopen offline');
  assert.equal(s.sync.actor,'nina');
  assert.ok(s.sync.error);
}
{
  const s=scope();s.sync.connected=false;s.syncRequest=async()=>{throw new TypeError('offline');};
  await s.connectSync('','',true);
  assert.equal(s.sync.connected,false,'A fresh offline installation never bypasses login');
}
