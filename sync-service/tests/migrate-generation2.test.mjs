import { test } from 'node:test';
import assert from 'node:assert/strict';
import { envelopeHash, migrateGeneration2, MigrationBlocked } from '../scripts/migrate-generation2.mjs';

function example() {
  return {rev:8,data:{schemaVersion:4,storage:{balance:-550,currency:'USD',history:[]},months:[{
    id:'2026-10',weeks:[1,2,3,4].map(id=>({id,status:'open',fund:{amount:0,currency:'USD',rate:1},settlement:0,expenses:[]}))
  }]}};
}
function fixture(initial=example()) {
  const state = new Map([['family-budget.json',{data:structuredClone(initial),etag:'etag-1'}]]);
  let n=1,writes=0;
  const read=async path=>structuredClone(state.get(path)||{data:null,etag:null});
  const write=async(path,old,data)=>{
    writes++;
    const existing=state.get(path);
    if (existing || old.etag || old.data !== null) throw new Error('CAS precondition failed');
    state.set(path,{data:structuredClone(data),etag:'etag-'+(++n)});
  };
  return {state,read,write,get writes(){return writes;}};
}
const exp=()=>envelopeHash(example());

test('dry-run proves source and absence of destination without writing',async()=>{
 const f=fixture();const result=await migrateGeneration2({read:f.read,write:f.write,expectedLegacyHash:exp()});
 assert.equal(result.status,'DRY_RUN');assert.equal(result.revision,8);assert.equal(f.writes,0);
});
test('commit copies exactly once using create-only and reads back',async()=>{
 const f=fixture();const result=await migrateGeneration2({read:f.read,write:f.write,expectedLegacyHash:exp(),commit:true});
 assert.equal(result.status,'COPIED_READBACK_VERIFIED');assert.equal(f.writes,1);
 assert.deepEqual((await f.read('generation-2/family-budget.json')).data,example());
 assert.deepEqual((await f.read('family-budget.json')).data,example());
 await assert.rejects(migrateGeneration2({read:f.read,write:f.write,expectedLegacyHash:exp(),commit:true}),/generation2_already_initialized_no_overwrite/);
 assert.equal(f.writes,1);
});
test('wrong backup hash is rejected without writes',async()=>{
 const f=fixture();await assert.rejects(migrateGeneration2({read:f.read,write:f.write,expectedLegacyHash:'0'.repeat(64),commit:true}),MigrationBlocked);
 assert.equal(f.writes,0);
});
test('empty legacy data and five weeks are rejected',async()=>{
 for(const value of [null,(()=>{const a=example();a.data.months[0].weeks.push({...a.data.months[0].weeks[0],id:5});return a;})()]){
  const f=fixture(value);
  await assert.rejects(migrateGeneration2({read:f.read,write:f.write,expectedLegacyHash:value?envelopeHash(value):exp(),commit:true}),MigrationBlocked);
  assert.equal(f.writes,0);
 }
});
test('changed legacy before commit is detected and nothing is copied',async()=>{
 const f=fixture();let num=0;
 const read=async path=>{
  const x=await f.read(path);
  if(path==='family-budget.json'&&++num===2)return {...x,etag:'someone-updated'};
  return x;
 };
 await assert.rejects(migrateGeneration2({read,write:f.write,expectedLegacyHash:exp(),commit:true}),/legacy_changed_during_preflight/);
 assert.equal(f.writes,0);
});
test('source write during copy blocks release even when target already exists',async()=>{
 const f=fixture();const write=async(...args)=>{
  await f.write(...args);
  f.state.set('family-budget.json',{data:example(),etag:'etag-other-writer'});
 };
 await assert.rejects(migrateGeneration2({read:f.read,write,expectedLegacyHash:exp(),commit:true}),/legacy_changed_during_copy_do_not_release/);
 assert.equal(f.writes,1);
 assert.ok((await f.read('generation-2/family-budget.json')).data);
});
test('CAS race at target fails without overwriting the winner',async()=>{
 const f=fixture();const write=async(path,...args)=>{
  f.state.set(path,{data:{owner:'concurrent'},etag:'winner'});
  await f.write(path,...args);
 };
 await assert.rejects(migrateGeneration2({read:f.read,write,expectedLegacyHash:exp(),commit:true}),/CAS precondition failed/);
 assert.equal((await f.read('generation-2/family-budget.json')).data.owner,'concurrent');
});
