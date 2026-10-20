import assert from 'node:assert/strict';
import {validateBatch} from './scripts/import-private-inbox.mjs';

const valid=[
  {id:'demo_card_20261014_A',name:'Demo Bakery',date:'2026-10-14',amount:250,
    currency:'USD',category:'products'},
  {id:'demo_card_20261014_B',name:'Demo Transit',date:'2026-10-14',amount:525,
    currency:'UAH',category:'transport'}
];
assert.equal(validateBatch({items:valid}).length,2);
assert.throws(()=>validateBatch({items:[...valid,valid[0]]}),/duplicate ID/);
assert.throws(()=>validateBatch({items:[{...valid[0],date:'2026-02-31'}]}),/calendar date/);
assert.throws(()=>validateBatch({items:[{...valid[0],amount:2.50}]}),/amount/);
assert.throws(()=>validateBatch({items:[{...valid[0],currency:'XXX'}]}),/currency/);
assert.throws(()=>validateBatch({items:[]}),/nonempty/);
console.log('VNN private import validator PASS; no real transactions in source control');
