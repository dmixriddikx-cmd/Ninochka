import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./sync-service/api/inbox.js', import.meta.url), 'utf8');
const start = source.indexOf('function cleanItem(');
const end = source.indexOf('function seed()', start);
assert.ok(start >= 0 && end > start, 'The cloud inbox has a validation guard');
const env = { CURRENCIES:new Set(['EUR','USD','UAH','MDL']),
  CATEGORIES:new Set(['products','transport','clothes','other']) };
const {cleanItem} = vm.runInNewContext(source.slice(start,end) + '\n({cleanItem})', env);
const base = {id:'bank_row_42',name:'Coffee',date:'2026-10-15',
  amount:450,currency:'EUR',category:'products'};
assert.equal(cleanItem(base).status,'pending');
for(const date of ['2026-13-99','2026-02-30','2026-00-15','not-a-date']){
  assert.throws(()=>cleanItem({...base,date}), /invalid_item/,
    'Bad bank screenshot date must give a clear client error: '+date);
}
assert.throws(()=>cleanItem({...base,amount:-450}),/invalid_item/);
assert.throws(()=>cleanItem({...base,amount:4.50}),/invalid_item/,
  'Cloud inbox amounts must be integer cents');
console.log('VNN inbox input validation PASS: invalid bank dates produce 400-style validation errors');
