import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as core from './corefix.js';
const source=readFileSync('v4/app-inbox.js','utf8');
const start=source.indexOf('async function applyExpenseInbox(');
const end=source.indexOf("document.addEventListener('change'",start);
const row={id:'synthetic-race-row',name:'Synthetic Coffee',date:'2026-10-14',amount:450,currency:'EUR'};
for(const raceStage of ['read','rate']){
 let put=0,adopt=0;
 const sandbox={core,structuredClone,Date,Map,Set,Number,expenseInbox:{applying:false},
  sync:{connected:true,busy:false,dirty:false,paused:false,rev:4},syncLocalVersion:0,
  modal:{querySelectorAll(selector){return selector.includes('check')?[{dataset:{inboxCheck:row.id}}]:[{dataset:{inboxDate:row.id},value:row.date}];}},
  inboxPending:()=>[row],inboxReviewedItem:x=>x,inboxResolvedDate:(x,dates)=>dates.get(x.id),
  state:{syntheticLocalCopy:true},localStorage:{setItem(){},getItem(){return '{}';}},STORE:'budget',SYNC_REV:'rev',
  notify(){},refreshExpenseInbox(){},adoptRemote(){adopt++;},render(){},closeModal(){},
  async syncRequest(method){if(method==='PUT')put++;if(raceStage==='read'){sandbox.syncLocalVersion++;sandbox.sync.dirty=true;}return{rev:5,data:{remote:true}};},
  async ensureRateFor(){if(raceStage==='rate'){sandbox.syncLocalVersion++;sandbox.sync.dirty=true;}},
 };
 if(raceStage==='rate')sandbox.syncRequest=async method=>{if(method==='PUT')put++;return{rev:4};};
 vm.createContext(sandbox);vm.runInContext(source.slice(start,end),sandbox);
 await sandbox.applyExpenseInbox();
 assert.equal(put,0,'New local edits must prevent an importer write during '+raceStage);
 assert.equal(adopt,0,'New local edits must never be replaced by a remote copy during '+raceStage);
 assert.equal(sandbox.sync.dirty,true);assert.equal(sandbox.state.syntheticLocalCopy,true);
}
console.log('Inbox preflight races PASS: local edits during read/rate resolution are preserved without writing');
