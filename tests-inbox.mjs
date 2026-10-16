import assert from 'node:assert/strict';
import * as core from './corefix.js';

const s = core.createState();
s.storage.currency = 'EUR';
s.storage.balance = 0;
const october = core.month(s, core.nowMonth());
for (const week of october.weeks) week.fund = { amount: 0, currency: 'EUR', rate: 1 };
const target = october.weeks[1]; // Day 14 -> week 2.
core.setRate(s, 'USD', 'EUR', 0.9, 'test');
core.setRate(s, 'UAH', 'EUR', 0.02, 'test');
const transactions = [
 ['Demo Souvenir Shop', 4500, 'USD', 'gifts'],
 ['Demo Electronics (Card A)', 2100, 'USD', 'other'],
 ['Demo Electronics (Card B)', 980, 'USD', 'other'],
 ['Demo Deli', 730, 'USD', 'products'],
 ['Demo Bakery', 650, 'USD', 'products'],
 ['Demo Cafe', 525, 'USD', 'products'],
 ['Demo Grocer', 405, 'USD', 'products'],
 ['Demo Taxi', 3100, 'USD', 'transport'],
 ['Demo Mobile', 25000, 'UAH', 'other']
];
let originalUSD = 0, originalUAH = 0;
for (const [name, amount, currency, category] of transactions) {
  const row = core.addExpense(s, target, { name, amount: core.moneyInput(amount), currency, category });
  row.date = '2026-10-14T12:00:00.000Z';
  row.importId = name.replaceAll(' ', '-') + '-' + amount;
  if (currency === 'USD') originalUSD += amount;
  else originalUAH += amount;
}
assert.equal(transactions.length, 9);
assert.equal(originalUSD, 12990);
assert.equal(originalUAH, 25000);
assert.equal(s.storage.balance, 0, 'pending/open week must not change storage');
const expectedWeekDebit = core.weekSpent(s, target);
assert.ok(expectedWeekDebit > 0);
core.closeWeek(s, target);
assert.equal(target.status, 'closed');
assert.equal(s.storage.balance, -expectedWeekDebit, 'negative storage must be permitted');
assert.equal(october.weeks[2].fund.amount, 0, 'later week remains unchanged');
assert.equal(target.expenses.filter(x => x.name.startsWith('Demo Electronics')).length, 2);
const once = s.storage.balance;
core.closeWeek(s, target);
assert.equal(s.storage.balance, once, 'closing again must not double charge');
console.log('Ninochka inbox: 9 purchases, exact original currencies, negative storage, closed-week idempotency PASS');
