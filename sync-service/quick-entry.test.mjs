import test from 'node:test';
import assert from 'node:assert/strict';
import { applyQuickExpense, parseMinor, quickWeek, QuickError } from './lib/quick-entry.js';

function fresh() {
  return {schemaVersion:4,
    storage:{balance:0,currency:'EUR',history:[]},rates:{},
    months:[{id:'2026-10',status:'active',obligations:[],
      weeks:[1,2,3,4].map(id=>({id,status:'open',
        fund:{amount:0,currency:'EUR',rate:1},expenses:[],settlement:0,closedAt:null}))}]
  };
}
const expense = (id, date='2026-10-15', amount='4.50', currency) =>
  ({ id, date, amount, ...(currency?{currency}:{}) });

test('minor units accept exactly two decimal places, reject invalid inputs',()=>{
  assert.equal(parseMinor('4,50'),450);
  assert.equal(parseMinor('0.01'),1);
  assert.equal(parseMinor('12'),1200);
  for(const invalid of ['0','-4','1.123','3e2','1 000','',null,1000000])
    assert.throws(()=>parseMinor(invalid),/invalid_amount/);
});

test('week assignment: days 1-7, 8-14, 15-21, 22-end',()=>{
  for(const [date,week] of [['2026-10-01',1],['2026-10-07',1],
    ['2026-10-08',2],['2026-10-14',2],['2026-10-15',3],
    ['2026-10-21',3],['2026-10-22',4],['2026-10-31',4]])
    assert.equal(quickWeek(date),week);
  assert.throws(()=>quickWeek('2026-11-31'),/invalid_date/);
});

test('one quick coffee posts to week 3 in storage currency; retry never doubles',()=>{
  const state=fresh();
  const first=applyQuickExpense(state,'nina',expense('feeedd00-1111'));
  assert.equal(first.duplicate,false);
  assert.equal(first.row.name,'Мелкие расходы');
  assert.equal(first.row.category,'leisure');
  assert.equal(state.months[0].weeks[2].expenses.length,1);
  assert.equal(state.months[0].weeks[2].expenses[0].amount,450);
  assert.equal(state.storage.balance,0,'open week does not settle yet');
  const again=applyQuickExpense(state,'nina',expense('feeedd00-1111'));
  assert.equal(again.duplicate,true);
  assert.equal(state.months[0].weeks[2].expenses.length,1);
  const secondPerson=applyQuickExpense(state,'volodymyr',expense('feeedd00-1111'));
  assert.equal(secondPerson.duplicate,false,'IDs are namespaced by actor');
});

test('posting to closed week reconciles Storage, including negative balances',()=>{
  const state=fresh();
  state.months[0].weeks[1].status='closed';
  applyQuickExpense(state,'volodymyr',expense('same-day-111','2026-10-14','5.00'));
  assert.equal(state.storage.balance,-500);
  assert.equal(state.months[0].weeks[1].settlement,-500);
  const duplicate=applyQuickExpense(state,'volodymyr',expense('same-day-111','2026-10-14','5.00'));
  assert.equal(duplicate.duplicate,true);
  assert.equal(state.storage.balance,-500);
});

test('currency conversion respects saved rate and refuses unknown rate',()=>{
  const state=fresh();
  const bad=expense('usd-expense-1','2026-10-14','5.00','USD');
  assert.throws(()=>applyQuickExpense(state,'nina',bad),/missing_rate/);
  state.rates.USD_EUR={value:0.9};
  state.months[0].weeks[1].status='closed';
  const good=applyQuickExpense(state,'nina',bad);
  assert.equal(good.row.currency,'USD');
  assert.equal(good.row.amount,500);
  assert.equal(state.storage.balance,-450);
});

test('first expense in a new month creates only a zero-allocation month',()=>{
  const state=fresh();
  state.months[0].obligations = [{id:'school-old',name:'school',kind:'study',
    amount:15000,currency:'EUR',rate:1}];
  const result=applyQuickExpense(state,'nina',expense('first-new-month','2026-11-01','2'));
  assert.equal(result.monthId,'2026-11');
  assert.equal(state.months.length,2);
  const month=state.months.find(x=>x.id==='2026-11');
  assert.equal(month.weeks.length,4);
  assert.ok(month.weeks.every(w=>w.fund.amount===0));
  assert.equal(month.obligations.length,1);
  assert.equal(month.obligations[0].name,'school');
  assert.equal(month.obligations[0].amount,15000);
  assert.notEqual(month.obligations[0].id,'school-old');
  assert.equal(month.weeks[0].expenses[0].amount,200);
});

test('invalid actor and IDs never write',()=>{
  const state=fresh();
  assert.throws(()=>applyQuickExpense(state,'admin',expense('not-user-001')),/invalid_actor/);
  assert.throws(()=>applyQuickExpense(state,'nina',expense('bad')),/invalid_id/);
  assert.equal(state.months[0].weeks[2].expenses.length,0);
});

console.log('VNN quick add tests: currency, 4-week allocation, closed week, duplicates, new month PASS');
