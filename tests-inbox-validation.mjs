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
// Exercise the actual browser date resolution, not a reimplementation.
// Clearing a selected date must fail validation rather than silently using the bank hint.
const browserSource = fs.readFileSync(new URL('./v4/app-inbox.js', import.meta.url), 'utf8');
const dateStart = browserSource.indexOf('function inboxResolvedDate(');
const dateEnd = browserSource.indexOf('async function applyExpenseInbox(', dateStart);
assert.ok(dateStart >= 0 && dateEnd > dateStart, 'Date resolver must exist in the browser importer');
const { inboxResolvedDate } = vm.runInNewContext(browserSource.slice(dateStart,dateEnd) +
  '\\n({ inboxResolvedDate })'.replace('\\n','\n'), {});
const row = {id:'bank_row_42', date:'2026-10-14'};
assert.equal(inboxResolvedDate(row,new Map()),'2026-10-14', 'Unedited date keeps original');
assert.equal(inboxResolvedDate(row,new Map([['bank_row_42','2026-10-15']])),'2026-10-15',
  'Valid user date overrides the screenshot hint');
const cleared = inboxResolvedDate(row,new Map([['bank_row_42','']]));
assert.equal(cleared,'', 'Empty date must NOT silently restore the screenshot date');
assert.equal(/^\\d{4}-\\d{2}-\\d{2}$/.test(cleared),false,
  'Cleared date must be rejected by applyExpenseInbox validation');
console.log('VNN inbox input validation PASS: invalid bank dates produce 400-style validation errors');
