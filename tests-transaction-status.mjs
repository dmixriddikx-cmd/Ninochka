import assert from 'node:assert/strict';
import { bankOutcome, excludeUnsuccessful } from './sync-service/lib/transaction-status.js';

const testRows = [
  { id: 'kyivstar-01', name: 'Kyivstar', amount: 20000, currency: 'UAH' },
  { id: 'hardrock-01', name: 'Hard Rock New York', amount: 12560, currency: 'USD' },
  { id: 'bestbuy-01', name: 'Best Buy (MAIB)', amount: 17727, currency: 'USD' },
  { id: 'bestbuy-02', name: 'Best Buy (Accent)', amount: 4047, currency: 'USD' },
  { id: 'sam-01', name: 'Sam Halal Food', amount: 618, currency: 'USD' },
  { id: 'pizza-01', name: '99 Cents Delicious Pizza', amount: 461, currency: 'USD' },
  { id: 'hudson-01', name: 'Hudson River Halal', amount: 544, currency: 'USD' },
  { id: 'prestige-01', name: 'Prestige Marketplace 29', amount: 7238, currency: 'USD' },
  { id: 'uber-01', name: 'Uber', amount: 9269, currency: 'USD', bankStatus: 'Completed' },
  { id: 'uber-denied', name: 'Uber', amount: 6055, currency: 'USD',
    statusText: 'Отклонено банком' },
  { id: 'sam-denied', name: 'Sam Halal Food', amount: 618, currency: 'USD',
    transactionStatus: 'Declined' }
];
const result = excludeUnsuccessful(testRows);
assert.equal(result.eligible.length, 9, 'exactly nine successful transactions');
assert.equal(result.excluded.length, 2, 'two declined charges were never staged');
assert.deepEqual(result.excluded.map(x => x.id), ['uber-denied', 'sam-denied']);
assert.equal(result.eligible.filter(x => x.currency === 'USD').reduce((a,x) => a + x.amount, 0), 52464);
assert.equal(result.eligible.filter(x => x.currency === 'UAH').reduce((a,x) => a + x.amount, 0), 20000);
assert.equal(bankOutcome({ name:'Card payment', paymentStatus:'Відхилено банком' }), 'declined');
assert.equal(bankOutcome({ name:'Coffee', description:'Payment failed due to insufficient funds' }), 'declined');
assert.equal(bankOutcome({ name:'Coffee', statusText:'Transaction rejected' }), 'declined');
assert.equal(bankOutcome({ name:'Coffee', bankStatus:'Pending' }), 'unsettled');
assert.equal(bankOutcome({ name:'Coffee', status:'pending' }), 'review',
  'queue status is not the same as a bank transaction status');
assert.equal(bankOutcome({ name:'Uber', amount:9269 }), 'review');
assert.equal(bankOutcome({ name:'Declined transaction', amount: 500 }), 'declined');
assert.deepEqual(excludeUnsuccessful([{ name:'Coffee', bankStatus:'pending' }]).eligible, []);
assert.throws(() => excludeUnsuccessful(null), /invalid_batch/);
console.log('VNN bank-status guard PASS: 9 accepted, 2 declined excluded, unsettled on hold');
