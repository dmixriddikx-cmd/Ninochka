import assert from 'node:assert/strict';
import { bankOutcome, excludeUnsuccessful } from './sync-service/lib/transaction-status.js';

const testRows = [
  { id: 'kyivstar-01', name: 'Demo Mobile', amount: 25000, currency: 'UAH' },
  { id: 'hardrock-01', name: 'Demo Souvenir Shop', amount: 4500, currency: 'USD' },
  { id: 'bestbuy-01', name: 'Demo Electronics (Card A)', amount: 2100, currency: 'USD' },
  { id: 'bestbuy-02', name: 'Demo Electronics (Card B)', amount: 980, currency: 'USD' },
  { id: 'sam-01', name: 'Demo Deli', amount: 730, currency: 'USD' },
  { id: 'pizza-01', name: 'Demo Bakery', amount: 650, currency: 'USD' },
  { id: 'hudson-01', name: 'Demo Cafe', amount: 525, currency: 'USD' },
  { id: 'prestige-01', name: 'Demo Grocer', amount: 405, currency: 'USD' },
  { id: 'uber-01', name: 'Demo Taxi', amount: 3100, currency: 'USD', bankStatus: 'Completed' },
  { id: 'uber-denied', name: 'Demo Taxi', amount: 990, currency: 'USD',
    statusText: 'Отклонено банком' },
  { id: 'sam-denied', name: 'Demo Deli', amount: 730, currency: 'USD',
    transactionStatus: 'Declined' }
];
const result = excludeUnsuccessful(testRows);
assert.equal(result.eligible.length, 9, 'exactly nine successful transactions');
assert.equal(result.excluded.length, 2, 'two declined charges were never staged');
assert.deepEqual(result.excluded.map(x => x.id), ['uber-denied', 'sam-denied']);
assert.equal(result.eligible.filter(x => x.currency === 'USD').reduce((a,x) => a + x.amount, 0), 12990);
assert.equal(result.eligible.filter(x => x.currency === 'UAH').reduce((a,x) => a + x.amount, 0), 25000);
assert.equal(bankOutcome({ name:'Card payment', paymentStatus:'Відхилено банком' }), 'declined');
assert.equal(bankOutcome({ name:'Coffee', description:'Payment failed due to insufficient funds' }), 'declined');
assert.equal(bankOutcome({ name:'Coffee', statusText:'Transaction rejected' }), 'declined');
assert.equal(bankOutcome({ name:'Coffee', bankStatus:'Pending' }), 'unsettled');
assert.equal(bankOutcome({ name:'Coffee', status:'pending' }), 'review',
  'queue status is not the same as a bank transaction status');
assert.equal(bankOutcome({ name:'Demo Taxi', amount:3100 }), 'review');
assert.equal(bankOutcome({ name:'Declined transaction', amount: 500 }), 'declined');
assert.deepEqual(excludeUnsuccessful([{ name:'Coffee', bankStatus:'pending' }]).eligible, []);
assert.throws(() => excludeUnsuccessful(null), /invalid_batch/);
console.log('VNN bank-status guard PASS: 9 accepted, 2 declined excluded, unsettled on hold');
