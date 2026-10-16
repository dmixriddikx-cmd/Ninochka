import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as core from './corefix.js';

const source=fs.readFileSync('v4/app-sync.js','utf8');
const functionSource=(name,end)=>source.slice(source.indexOf(name),source.indexOf(end,source.indexOf(name)));
function scope() {
  const storage=new Map();
  const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
  const sandbox={sync:{token:'synthetic',rev:4,dirty:false,connected:true,busy:false,paused:false,actor:'nina'},
    state:{preferences:{}},localStorage,STORE:'budget',SYNC_REV:'rev',SYNC_DIRTY:'dirty',SYNC_TOKEN:'token',SYNC_READY:'ready',SYNC_LOGIN:'login',
    SYNC_API:'https://synthetic.example',syncLocalVersion:0,authRestorePending:false,
    advanceLocalCalendar(){return false;},cachedSessionActor(){return 'nina';},render(){},adoptRemote(data){sandbox.adopted=data;},saveLocalOnly(){},queueSync(){sandbox.queued=true;},view:{tab:'home'}};
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

{
  const previous=new Date();previous.setDate(1);previous.setMonth(previous.getMonth()-1);
  const data=core.createState();data.months=[core.blankMonth(core.nowMonth(previous))];
  data.storage.balance=5000;
  for(const week of data.months[0].weeks)core.setWeekFund(data,week,'10','EUR');
  core.addExpense(data,data.months[0].weeks[0],{name:'Synthetic prior-month expense',amount:'15',currency:'EUR'});
  let saves=0;
  const context={core,state:data,sync:{connected:true,busy:false,paused:false},structuredClone,save(){saves++;},render(){}};
  vm.createContext(context);
  vm.runInContext(functionSource('function needsCalendarRollover(', 'function backupLocal('),context);
  assert.equal(context.advanceLocalCalendar(),true);
  assert.equal(saves,1);assert.equal(context.state.months[0].status,'closed');
  assert.equal(context.state.months.length,2);assert.equal(context.state.months[1].weeks.length,4);
  assert.equal(context.state.storage.balance,7500);
  assert.equal(context.advanceLocalCalendar(),false);assert.equal(saves,1);
  assert.equal(context.state.storage.balance,7500,'Repeated calendar ticks never settle a month twice');
}
console.log('Live calendar rollover regression PASS: four weeks, one settlement and queued cloud save');

{
  const s={sync:{token:'synthetic'},SYNC_API:'https://synthetic.example',fetch:async(_url,options)=>{
    assert.equal(options.headers['X-VNN-Write-Protocol'],'2');
    return {status:200,ok:true,json:async()=>({rev:2})};
  }};
  vm.createContext(s);vm.runInContext(functionSource('async function syncRequest(', 'function adoptRemote('),s);
  await s.syncRequest('PUT',{rev:1,data:{synthetic:true}});
  s.fetch=async()=>({status:426,ok:false,json:async()=>({error:'client_upgrade_required'})});
  await assert.rejects(s.syncRequest('PUT',{rev:1,data:{synthetic:true}}),error=>error.status===426&&error.message.includes('Местная копия сохранена'));
}
console.log('Writer protocol browser regression PASS: current header sent, upgrade rejection preserves local copy');
